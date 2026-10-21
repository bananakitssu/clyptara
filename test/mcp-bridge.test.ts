import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { startClyptaraServer } from "./bridge/clyptara.js";
import { startMcpBridge } from "./bridge/mcp.js";

async function close(server: Server | undefined): Promise<void> {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function rpc(url: string, message: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream"
    },
    body: JSON.stringify(message)
  });
  assert.equal(response.status, 200);
  const body = await response.text();
  const dataLine = body.split(/\r?\n/).find((line) => line.startsWith("data: "));
  assert.ok(dataLine, `Expected an MCP message, got: ${body}`);
  return JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
}

test("MCP bridge forwards tools and data requests to Clyptara", async () => {
  let clyptara: Server | undefined;
  let mcp: Server | undefined;
  try {
    clyptara = await startClyptaraServer(0);
    const clyptaraPort = (clyptara.address() as AddressInfo).port;
    mcp = await startMcpBridge({
      port: 0,
      clyptaraUrl: `http://127.0.0.1:${clyptaraPort}/clyptara`
    });
    const mcpPort = (mcp.address() as AddressInfo).port;
    const url = `http://127.0.0.1:${mcpPort}/mcp`;

    const initialized = await rpc(url, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "clyptara-test", version: "1.0.0" }
      }
    });
    assert.equal((initialized.result as Record<string, unknown>).protocolVersion, "2025-03-26");

    const listed = await rpc(url, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const tools = (listed.result as { tools: Array<{ name: string }> }).tools.map((tool) => tool.name);
    assert.ok(tools.includes("greet"));
    assert.ok(tools.includes("add_numbers"));
    assert.ok(tools.includes("clyptara_fetch_data"));

    const greeting = await rpc(url, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "greet", arguments: { name: "Clyptara" } }
    });
    const greetingText = (greeting.result as { content: Array<{ text: string }> }).content[0]?.text;
    assert.equal(JSON.parse(greetingText ?? "{}").message, "Hello, Clyptara! Clyptara is working.");

    const sum = await rpc(url, {
      jsonrpc: "2.0",
      id: 31,
      method: "tools/call",
      params: { name: "add_numbers", arguments: { a: 20, b: 22 } }
    });
    const sumText = (sum.result as { content: Array<{ text: string }> }).content[0]?.text;
    assert.equal(JSON.parse(sumText ?? "{}").result, 42);

    const data = await rpc(url, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "clyptara_fetch_data", arguments: { key: "server.info" } }
    });
    const dataText = (data.result as { content: Array<{ text: string }> }).content[0]?.text;
    assert.equal(JSON.parse(dataText ?? "{}").value.name, "clyptara-demo");
  } finally {
    await close(mcp);
    await close(clyptara);
  }
});
