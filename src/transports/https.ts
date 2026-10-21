import { createServer, type ServerOptions, type Server as HttpsServer } from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ClyptaraProtocolError, DEFAULT_MAX_MESSAGE_BYTES, decodeResponse, errorResponse, type RequestMessage, type ResponseMessage } from "../protocol.js";
import type { ClyptaraServer } from "../server.js";
import type { RequestTransport } from "../client.js";

export interface HttpsTransportOptions { timeoutMs?: number; headers?: Record<string, string> }

/** Remote transport. HTTPS is enforced to avoid sending action requests or credentials in clear text. */
export class HttpsTransport implements RequestTransport {
  constructor(private readonly endpoint: string, private readonly options: HttpsTransportOptions = {}) {
    if (new URL(endpoint).protocol !== "https:") throw new Error("Clyptara remote endpoints must use HTTPS.");
  }

  async request(message: RequestMessage): Promise<ResponseMessage> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 30_000);
    try {
      const result = await fetch(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/clyptara+json", accept: "application/clyptara+json", ...this.options.headers },
        body: JSON.stringify(message),
        signal: controller.signal,
        redirect: "error"
      });
      const raw = await result.text();
      if (Buffer.byteLength(raw, "utf8") > DEFAULT_MAX_MESSAGE_BYTES) throw new ClyptaraProtocolError("message_too_large", "HTTPS response exceeded the maximum message size.");
      let value: unknown;
      try { value = JSON.parse(raw) as unknown; }
      catch { throw new ClyptaraProtocolError("invalid_response", `HTTPS endpoint returned non-JSON (${result.status}).`); }
      if (!result.ok) throw new ClyptaraProtocolError("http_error", `HTTPS endpoint returned HTTP ${result.status}.`, value);
      return decodeResponse(value, message.id);
    } catch (error) {
      if (error instanceof ClyptaraProtocolError) throw error;
      throw new ClyptaraProtocolError("transport_error", error instanceof Error ? error.message : "HTTPS request failed.");
    } finally { clearTimeout(timer); }
  }
}

export interface ClyptaraHttpsServerOptions {
  tls: ServerOptions;
  path?: string;
  maxBodyBytes?: number;
  /** Implement authentication/authorization here. Deny by default in production deployments. */
  authorize?: (request: IncomingMessage) => boolean | Promise<boolean>;
}

/** Creates an HTTPS server bound to one protocol endpoint. TLS certificates and auth are supplied by the host. */
export function createClyptaraHttpsServer(protocolServer: ClyptaraServer, options: ClyptaraHttpsServerOptions): HttpsServer {
  const path = options.path ?? "/clyptara";
  const max = options.maxBodyBytes ?? DEFAULT_MAX_MESSAGE_BYTES;
  return createServer(options.tls, (req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      if (req.method !== "POST" || new URL(req.url ?? "/", "https://localhost").pathname !== path) {
        res.writeHead(404, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "not_found" })); return;
      }
      if (options.authorize && !(await options.authorize(req))) {
        res.writeHead(401, { "content-type": "application/json", "www-authenticate": "Bearer" }); res.end(JSON.stringify({ error: "unauthorized" })); return;
      }
      const contentType = (req.headers["content-type"] ?? "").split(";")[0]?.trim();
      if (contentType !== "application/clyptara+json" && contentType !== "application/json") {
        res.writeHead(415, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "unsupported_media_type" })); return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > max) { res.writeHead(413, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "message_too_large" })); return; }
        chunks.push(buffer);
      }
      let input: unknown;
      try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
      catch {
        res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify(errorResponse("invalid-request", "invalid_json", "Body is not valid JSON."))); return;
      }
      const result: ResponseMessage = await protocolServer.handle(input);
      res.writeHead(200, { "content-type": "application/clyptara+json", "cache-control": "no-store", "x-content-type-options": "nosniff" });
      res.end(JSON.stringify(result));
    })().catch(() => {
      if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify(errorResponse("invalid-request", "internal_error", "HTTPS endpoint failed to process the request.")));
    });
  });
}
