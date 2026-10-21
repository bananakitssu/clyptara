import test from "node:test";
import assert from "node:assert/strict";
import { ClyptaraClient, ClyptaraServer, ClyptaraProtocolError, LocalTransport } from "../src/index.js";

function buildServer() {
  return new ClyptaraServer({ name: "test-server", version: "0.1.0" })
    .registerAction({ name: "sum", description: "Add two numbers", inputSchema: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } }, required: ["a", "b"], additionalProperties: false }, run: ({ a, b }) => ({ total: Number(a) + Number(b) }) })
    .registerDataEntry({ key: "test://one", name: "one", get: () => ({ value: 1 }) });
}

test("client connects, discovers actions, runs one, and fetches data", async () => {
  const client = new ClyptaraClient(new LocalTransport(buildServer()));
  const hello = await client.connect();
  assert.equal(hello.protocol, "clyptara/0.1");
  assert.equal((await client.describePeer()).name, "test-server");
  assert.equal((await client.getActions()).length, 1);
  assert.deepEqual(await client.runAction("sum", { a: 2, b: 3 }), { total: 5 });
  assert.deepEqual(await client.getDataCatalog(), [{ key: "test://one", name: "one" }]);
  assert.deepEqual(await client.fetchData("test://one"), { key: "test://one", value: { value: 1 } });
  await client.disconnect();
});

test("client must connect before making requests", async () => {
  const client = new ClyptaraClient(new LocalTransport(buildServer()));
  await assert.rejects(() => client.getActions(), (error: unknown) => error instanceof ClyptaraProtocolError && error.code === "link_not_open");
});

test("peer rejects invalid action input before execution", async () => {
  const server = buildServer();
  const response = await server.handle({ protocol: "clyptara/0.1", type: "request", id: "x1", method: "action.run", params: { name: "sum", input: { a: "not a number", b: 2 } } });
  assert.equal(response.type, "error");
  if (response.type === "error") assert.equal(response.error.code, "invalid_input");
});

test("old MCP method names are not accepted as Clyptara methods", async () => {
  const result = await buildServer().handle({ protocol: "clyptara/0.1", type: "request", id: "x-old", method: "tools/list", params: {} });
  assert.equal(result.type, "error");
  if (result.type === "error") assert.equal(result.error.code, "method_not_found");
});

test("peer rejects unknown methods with a structured error", async () => {
  const result = await buildServer().handle({ protocol: "clyptara/0.1", type: "request", id: "x2", method: "does.not.exist", params: {} });
  assert.equal(result.type, "error");
  if (result.type === "error") assert.equal(result.error.code, "method_not_found");
});
