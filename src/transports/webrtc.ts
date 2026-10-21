import { ClyptaraProtocolError, DEFAULT_MAX_MESSAGE_BYTES, decodeResponse, errorResponse, isRecord, type RequestMessage, type ResponseMessage } from "../protocol.js";
import type { ClyptaraServer } from "../server.js";
import type { RequestTransport } from "../client.js";

export interface DataChannelAdapter {
  send(text: string): void;
  close(): void;
  isOpen(): boolean;
  subscribe(handler: (data: unknown) => void): () => void;
}

/** Minimal structural shape of Werift's RTCDataChannel; importing Werift is optional. */
export interface WeriftDataChannelLike {
  readyState: string;
  send(data: string | Buffer): void;
  close(): void;
  onMessage: { subscribe(handler: (data: string | Buffer) => void): unknown };
}

/** Adapt the browser WebRTC RTCDataChannel API. The data channel must already be negotiated and open before requests. */
export function fromBrowserDataChannel(channel: RTCDataChannel): DataChannelAdapter {
  return {
    send: (text) => channel.send(text),
    close: () => channel.close(),
    isOpen: () => channel.readyState === "open",
    subscribe: (handler) => {
      const listener = (event: MessageEvent) => handler(event.data);
      channel.addEventListener("message", listener);
      return () => channel.removeEventListener("message", listener);
    }
  };
}

/** Adapt Werift's `onMessage.subscribe` events without bundling the optional Werift dependency. */
export function fromWeriftDataChannel(channel: WeriftDataChannelLike): DataChannelAdapter {
  return {
    send: (text) => channel.send(text),
    close: () => channel.close(),
    isOpen: () => channel.readyState === "open",
    subscribe: (handler) => {
      const subscription = channel.onMessage.subscribe((data) => handler(data));
      return () => {
        if (subscription && typeof subscription === "object" && "unsubscribe" in subscription && typeof subscription.unsubscribe === "function") subscription.unsubscribe();
      };
    }
  };
}

function decodeData(data: unknown): unknown {
  if (typeof data === "string") {
    if (new TextEncoder().encode(data).byteLength > DEFAULT_MAX_MESSAGE_BYTES) throw new ClyptaraProtocolError("message_too_large", "WebRTC data-channel message exceeded the size limit.");
    try { return JSON.parse(data) as unknown; }
    catch { throw new ClyptaraProtocolError("invalid_json", "WebRTC data-channel message was not valid JSON."); }
  }
  if (data instanceof Uint8Array) {
    if (data.byteLength > DEFAULT_MAX_MESSAGE_BYTES) throw new ClyptaraProtocolError("message_too_large", "WebRTC data-channel message exceeded the size limit.");
    return decodeData(new TextDecoder().decode(data));
  }
  throw new ClyptaraProtocolError("invalid_message", "WebRTC transport only accepts text or UTF-8 byte messages.");
}

/** Client-side request transport over an already-open WebRTC data channel. */
export class WebRtcTransport implements RequestTransport {
  private readonly pending = new Map<string, { resolve: (value: ResponseMessage) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private readonly unsubscribe: () => void;
  constructor(private readonly channel: DataChannelAdapter, private readonly timeoutMs = 30_000) {
    this.unsubscribe = channel.subscribe((data) => {
      let raw: unknown;
      try { raw = decodeData(data); }
      catch { return; }
      if (!isRecord(raw) || typeof raw.id !== "string") return;
      const item = this.pending.get(raw.id);
      if (!item) return;
      clearTimeout(item.timer); this.pending.delete(raw.id);
      try { item.resolve(decodeResponse(raw, raw.id)); }
      catch (error) { item.reject(error instanceof Error ? error : new Error("Invalid Clyptara response.")); }
    });
  }

  request(message: RequestMessage): Promise<ResponseMessage> {
    if (!this.channel.isOpen()) return Promise.reject(new ClyptaraProtocolError("channel_not_open", "WebRTC data channel must be open before issuing requests."));
    const serialized = JSON.stringify(message);
    if (new TextEncoder().encode(serialized).byteLength > DEFAULT_MAX_MESSAGE_BYTES) return Promise.reject(new ClyptaraProtocolError("message_too_large", "Request exceeds the WebRTC message size limit."));
    if (this.pending.has(message.id)) return Promise.reject(new ClyptaraProtocolError("duplicate_request_id", "A request with this ID is already pending."));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(message.id); reject(new ClyptaraProtocolError("timeout", "WebRTC request timed out.")); }, this.timeoutMs);
      this.pending.set(message.id, { resolve, reject, timer });
      try { this.channel.send(serialized); }
      catch (error) { clearTimeout(timer); this.pending.delete(message.id); reject(error instanceof Error ? error : new Error("WebRTC send failed.")); }
    });
  }

  close(): void {
    this.unsubscribe();
    this.channel.close();
    const error = new ClyptaraProtocolError("transport_closed", "WebRTC transport closed.");
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(error); }
    this.pending.clear();
  }
}

export function createWebRtcClientTransport(channel: RTCDataChannel, timeoutMs?: number): WebRtcTransport {
  return new WebRtcTransport(fromBrowserDataChannel(channel), timeoutMs);
}

export function createWeriftClientTransport(channel: WeriftDataChannelLike, timeoutMs?: number): WebRtcTransport {
  return new WebRtcTransport(fromWeriftDataChannel(channel), timeoutMs);
}

/** Attach a protocol server to a browser data channel on the receiving side. */
export function serveWebRtcDataChannel(channel: RTCDataChannel, server: ClyptaraServer): () => void {
  return serveDataChannel(fromBrowserDataChannel(channel), server);
}

/** Attach a protocol server to a Werift data channel on the receiving side. */
export function serveWeriftDataChannel(channel: WeriftDataChannelLike, server: ClyptaraServer): () => void {
  return serveDataChannel(fromWeriftDataChannel(channel), server);
}

function serveDataChannel(channel: DataChannelAdapter, server: ClyptaraServer): () => void {
  const unsubscribe = channel.subscribe((data) => {
    void (async () => {
      let incoming: unknown;
      try { incoming = decodeData(data); }
      catch { channel.send(JSON.stringify(errorResponse("invalid-request", "invalid_message", "WebRTC message was invalid."))); return; }
      const response = await server.handle(incoming);
      safeSend(channel, JSON.stringify(response));
    })().catch(() => safeSend(channel, JSON.stringify(errorResponse("invalid-request", "internal_error", "WebRTC server failed to process a request."))));
  });
  return unsubscribe;
}

function safeSend(channel: DataChannelAdapter, payload: string): void {
  if (!channel.isOpen()) return;
  try { channel.send(payload); } catch { /* The peer may close the channel between the state check and send. */ }
}
