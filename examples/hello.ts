import { ClyptaraClient, ClyptaraServer, LocalTransport } from "../src/index.js";

const server = new ClyptaraServer({ name: "hello-server", version: "0.1.0" });
server.registerAction({
  name: "greet",
  description: "Greets a person by name.",
  inputSchema: {
    type: "object",
    properties: { name: { type: "string", minLength: 1, maxLength: 80 } },
    required: ["name"],
    additionalProperties: false
  },
  run: ({ name }) => ({ content: [{ type: "text", text: `Hello, ${String(name)}!` }] })
});
server.registerDataEntry({ key: "example://readme", name: "Example greeting", mediaType: "text/plain", get: () => "This data entry is served through Clyptara." });

const client = new ClyptaraClient(new LocalTransport(server), { name: "hello-example", version: "0.1.0" });
const connection = await client.connect();
const result = await client.runAction("greet", { name: "Clyptara" });
console.log(JSON.stringify({ connection, result }, null, 2));
await client.disconnect();
