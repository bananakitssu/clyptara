import type { RequestMessage, ResponseMessage } from "../protocol.js";
import type { ClyptaraServer } from "../server.js";
import type { RequestTransport } from "../client.js";

/** In-process transport for tests, examples, and embedding. */
export class LocalTransport implements RequestTransport {
  constructor(private readonly server: ClyptaraServer) {}
  request(message: RequestMessage): Promise<ResponseMessage> { return this.server.handle(message); }
}
