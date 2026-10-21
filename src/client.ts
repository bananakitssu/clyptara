import { CLYPTARA_PROTOCOL, ClyptaraProtocolError, decodeResponse, type RequestMessage, type ResponseMessage } from "./protocol.js";

export interface RequestTransport {
  request(message: RequestMessage): Promise<ResponseMessage>;
  close?(): void | Promise<void>;
}

export interface ClientInfo { name: string; version: string }
export interface PeerInfo { name: string; version: string }
export interface ConnectionInfo {
  protocol: typeof CLYPTARA_PROTOCOL;
  peer: PeerInfo;
  client: ClientInfo;
  features: string[];
}
export interface PeerDescription { name: string; version: string; protocol: typeof CLYPTARA_PROTOCOL; features: string[] }
export interface ActionDescriptor {
  name: string;
  description?: string;
  input: Record<string, unknown>;
}
export interface DataEntryDescriptor {
  key: string;
  name: string;
  description?: string;
  mediaType?: string;
}

/** A Clyptara client. Calls use Clyptara's own link/action/data vocabulary. */
export class ClyptaraClient {
  private sequence = 0;
  private connected = false;
  private connectionInfo: ConnectionInfo | undefined;

  constructor(
    private readonly transport: RequestTransport,
    private readonly info: ClientInfo = { name: "clyptara-typescript-client", version: "0.1.0" }
  ) {}

  private async call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = `${Date.now().toString(36)}-${(++this.sequence).toString(36)}`;
    const request: RequestMessage = { protocol: CLYPTARA_PROTOCOL, type: "request", id, method, params };
    const result = decodeResponse(await this.transport.request(request), id);
    if (result.type === "error") throw new ClyptaraProtocolError(result.error.code, result.error.message, result.error.details);
    return result.result as T;
  }

  /** Open the logical Clyptara link and negotiate the protocol version. */
  async connect(): Promise<ConnectionInfo> {
    if (this.connected && this.connectionInfo) return this.connectionInfo;
    const result = await this.call<ConnectionInfo>("link.open", {
      client: this.info,
      supportedProtocols: [CLYPTARA_PROTOCOL]
    });
    if (result.protocol !== CLYPTARA_PROTOCOL) throw new ClyptaraProtocolError("unsupported_protocol", "Peer did not negotiate the requested Clyptara protocol version.");
    this.connected = true;
    this.connectionInfo = result;
    return result;
  }

  private ensureConnected(): void {
    if (!this.connected) throw new ClyptaraProtocolError("link_not_open", "Call connect() before using this client.");
  }

  async describePeer(): Promise<PeerDescription> {
    this.ensureConnected();
    return this.call("peer.describe");
  }

  async getActions(): Promise<ActionDescriptor[]> {
    this.ensureConnected();
    return this.call("action.catalog");
  }

  async runAction<T = unknown>(name: string, input: Record<string, unknown> = {}): Promise<T> {
    this.ensureConnected();
    return this.call<T>("action.run", { name, input });
  }

  async getDataCatalog(): Promise<DataEntryDescriptor[]> {
    this.ensureConnected();
    return this.call("data.catalog");
  }

  async fetchData<T = unknown>(key: string): Promise<T> {
    this.ensureConnected();
    return this.call<T>("data.fetch", { key });
  }

  async disconnect(): Promise<void> {
    try {
      if (this.connected) await this.call("link.close");
    } finally {
      this.connected = false;
      this.connectionInfo = undefined;
      await this.transport.close?.();
    }
  }
}
