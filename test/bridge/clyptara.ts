import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { ClyptaraServer } from "../../src/server.js";
import { errorResponse } from "../../src/protocol.js";

const maxBodyBytes = 1_048_576;

export function makeDemoPeer(): ClyptaraServer {
  return new ClyptaraServer({ name: "clyptara-demo", version: "0.1.0" })
    .registerAction({
      name: "greet",
      description: "Return a greeting for a name.",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string", description: "Name to greet" } },
        required: ["name"],
        additionalProperties: false
      },
      run: ({ name }) => ({ message: `Hello, ${String(name)}! Clyptara is working.` })
    })
    .registerAction({
      name: "add_numbers",
      description: "Add two numbers.",
      inputSchema: {
        type: "object",
        properties: {
          a: { type: "number", description: "First number" },
          b: { type: "number", description: "Second number" }
        },
        required: ["a", "b"],
        additionalProperties: false
      },
      run: ({ a, b }) => ({ result: Number(a) + Number(b) })
    })
    .registerDataEntry({
      key: "server.info",
      name: "Server info",
      description: "Details about this Clyptara demo peer.",
      mediaType: "application/json",
      get: () => ({ name: "clyptara-demo", version: "0.1.0", transport: "local HTTP test endpoint" })
    });
}

export async function startClyptaraServer(port = 3001): Promise<Server> {
  const peer = makeDemoPeer();
  let actualPort = port;
  const server = createServer((req, res) => {
    void (async () => {
      const host = req.headers.host ?? "";
      if (host !== `127.0.0.1:${actualPort}` && host !== `localhost:${actualPort}`) {
        res.writeHead(403, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "local_host_only" }));
        return;
      }
      if (req.method !== "POST" || new URL(req.url ?? "/", "http://127.0.0.1").pathname !== "/clyptara") {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not_found" }));
        return;
      }

      const contentType = (req.headers["content-type"] ?? "").split(";")[0]?.trim();
      if (contentType !== "application/clyptara+json" && contentType !== "application/json") {
        res.writeHead(415, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unsupported_media_type" }));
        return;
      }

      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += part.length;
        if (size > maxBodyBytes) {
          res.writeHead(413, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "message_too_large" }));
          return;
        }
        chunks.push(part);
      }

      let input: unknown;
      try {
        input = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
      } catch {
        res.writeHead(400, { "content-type": "application/clyptara+json" });
        res.end(JSON.stringify(errorResponse("invalid-request", "invalid_json", "Body is not valid JSON.")));
        return;
      }

      const result = await peer.handle(input);
      res.writeHead(200, {
        "content-type": "application/clyptara+json",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      });
      res.end(JSON.stringify(result));
    })().catch(() => {
      if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify(errorResponse("invalid-request", "internal_error", "Clyptara request failed.")));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  actualPort = (server.address() as AddressInfo).port;
  console.log(`Clyptara server listening at http://127.0.0.1:${actualPort}/clyptara`);
  return server;
}
