import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { createInterface } from "node:readline";
import { ClyptaraProtocolError, DEFAULT_MAX_MESSAGE_BYTES, decodeResponse, errorResponse, isRecord, type RequestMessage, type ResponseMessage } from "../protocol.js";
import type { ClyptaraServer } from "../server.js";
import type { RequestTransport } from "../client.js";

export interface StdioServerOptions { maxLineBytes?: number }

/** Serves newline-delimited Clyptara JSON messages on stdin/stdout. Keep stdout free of logs. */
export function serveStdio(server: ClyptaraServer, input: NodeJS.ReadableStream = process.stdin, output: NodeJS.WritableStream = process.stdout, options: StdioServerOptions = {}): void {
  const max = options.maxLineBytes ?? DEFAULT_MAX_MESSAGE_BYTES;
  const lines = createInterface({ input, crlfDelay: Infinity });
  lines.on("line", (line) => {
    void (async () => {
      let incoming: unknown;
      if (Buffer.byteLength(line, "utf8") > max) {
        incoming = { protocol: "clyptara/0.1", type: "request", id: "invalid-request", method: "invalid", params: {} };
        output.write(`${JSON.stringify(errorResponse("invalid-request", "message_too_large", "Frame exceeded the configured size limit."))}\n`);
        return;
      }
      try { incoming = JSON.parse(line) as unknown; }
      catch {
        output.write(`${JSON.stringify(errorResponse("invalid-request", "invalid_json", "Frame is not valid JSON."))}\n`);
        return;
      }
      const result = await server.handle(incoming);
      output.write(`${JSON.stringify(result)}\n`);
    })().catch(() => {
      output.write(`${JSON.stringify(errorResponse("invalid-request", "internal_error", "Server failed to process a frame."))}\n`);
    });
  });
}

export interface StdioClientOptions extends SpawnOptions { timeoutMs?: number; maxLineBytes?: number }

/** Spawns a Clyptara stdio server. Each outstanding request is correlated by its request ID. */
export class StdioClientTransport implements RequestTransport {
  private readonly child: ChildProcess;
  private readonly pending = new Map<string, { resolve: (value: ResponseMessage) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private readonly timeoutMs: number;
  private readonly maxLineBytes: number;
  private closed = false;

  constructor(command: string, args: string[] = [], options: StdioClientOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxLineBytes = options.maxLineBytes ?? DEFAULT_MAX_MESSAGE_BYTES;
    const { timeoutMs: _timeout, maxLineBytes: _max, ...spawnOptions } = options;
    this.child = spawn(command, args, { stdio: ["pipe", "pipe", "inherit"], ...spawnOptions });
    const lines = createInterface({ input: this.child.stdout!, crlfDelay: Infinity });
    lines.on("line", (line) => {
      if (Buffer.byteLength(line, "utf8") > this.maxLineBytes) { this.failAll(new ClyptaraProtocolError("message_too_large", "Server response exceeded the configured size limit.")); return; }
      try {
        const raw = JSON.parse(line) as unknown;
        if (!isRecord(raw) || typeof raw.id !== "string") throw new Error("Missing response ID");
        const pending = this.pending.get(raw.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(raw.id);
        pending.resolve(decodeResponse(raw, raw.id));
      } catch (error) { this.failAll(error instanceof Error ? error : new Error("Invalid server response.")); }
    });
    this.child.on("error", (error) => this.failAll(error));
    this.child.on("exit", (code, signal) => {
      this.closed = true;
      this.failAll(new ClyptaraProtocolError("server_exited", `stdio server exited (code=${code}, signal=${signal}).`));
    });
  }

  request(message: RequestMessage): Promise<ResponseMessage> {
    if (this.closed || !this.child.stdin || this.child.stdin.destroyed) return Promise.reject(new ClyptaraProtocolError("transport_closed", "stdio transport is closed."));
    const serialized = JSON.stringify(message);
    if (Buffer.byteLength(serialized, "utf8") > this.maxLineBytes) return Promise.reject(new ClyptaraProtocolError("message_too_large", "Request exceeds the configured frame size limit."));
    if (this.pending.has(message.id)) return Promise.reject(new ClyptaraProtocolError("duplicate_request_id", "A request with this ID is already pending."));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(message.id);
        reject(new ClyptaraProtocolError("timeout", "stdio request timed out."));
      }, this.timeoutMs);
      this.pending.set(message.id, { resolve, reject, timer });
      this.child.stdin!.write(`${serialized}\n`, (error) => {
        if (error) {
          const item = this.pending.get(message.id);
          if (item) { clearTimeout(item.timer); this.pending.delete(message.id); item.reject(error); }
        }
      });
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.child.stdin?.end();
    this.child.kill();
    this.failAll(new ClyptaraProtocolError("transport_closed", "stdio transport closed."));
  }

  private failAll(error: Error): void {
    for (const [id, item] of this.pending) { clearTimeout(item.timer); item.reject(error); this.pending.delete(id); }
  }
}
