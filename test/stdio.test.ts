import test from "node:test";
import assert from "node:assert/strict";
import { StdioClientTransport } from "../src/transports/stdio.js";
import { ClyptaraClient } from "../src/client.js";

test("stdio transport performs a full subprocess round trip", async () => {
  const transport = new StdioClientTransport(process.execPath, ["--import", "tsx", "examples/stdio-server.ts"], { cwd: process.cwd(), timeoutMs: 8_000 });
  const client = new ClyptaraClient(transport, { name: "stdio-test", version: "0.1.0" });
  try {
    const init = await client.connect();
    assert.equal(init.peer.name, "clyptara-stdio-example");
    assert.deepEqual(await client.runAction("greet", { name: "test" }), { greeting: "Hello, test!" });
  } finally {
    await client.disconnect();
  }
});
