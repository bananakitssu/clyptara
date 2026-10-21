import { ClyptaraServer } from "../src/server.js";
import { serveStdio } from "../src/transports/stdio.js";

const server = new ClyptaraServer({ name: "clyptara-stdio-example", version: "0.1.0" });
server.registerAction({
  name: "greet",
  description: "Greets a person by name.",
  inputSchema: { type: "object", properties: { name: { type: "string", minLength: 1 } }, required: ["name"], additionalProperties: false },
  run: ({ name }) => ({ greeting: `Hello, ${String(name)}!` })
});
serveStdio(server);
