import test from "node:test";
import assert from "node:assert/strict";
import { createWeriftClientTransport, serveWeriftDataChannel, type WeriftDataChannelLike } from "../src/transports/webrtc.js";
import { ClyptaraServer } from "../src/server.js";
import { ClyptaraClient } from "../src/client.js";

class FakeEvent<T extends unknown[]> {
  private readonly handlers = new Set<(...args: T) => void>();
  subscribe(handler: (...args: T) => void) { this.handlers.add(handler); return { unsubscribe: () => this.handlers.delete(handler) }; }
  execute(...args: T) { for (const handler of this.handlers) handler(...args); }
}
class FakeChannel implements WeriftDataChannelLike {
  readyState = "open";
  readonly onMessage = new FakeEvent<[string | Buffer]>();
  peer?: FakeChannel;
  send(data: string | Buffer) { this.peer?.onMessage.execute(data); }
  close() { this.readyState = "closed"; }
}

test("Werift adapter exchanges protocol requests on a data channel", async () => {
  const a = new FakeChannel(); const b = new FakeChannel(); a.peer = b; b.peer = a;
  const server = new ClyptaraServer({ name: "rtc-server" }).registerAction({ name: "ping", inputSchema: { type: "object", properties: {}, additionalProperties: false }, run: () => ({ pong: true }) });
  serveWeriftDataChannel(b, server);
  const client = new ClyptaraClient(createWeriftClientTransport(a));
  const init = await client.connect();
  assert.equal(init.peer.name, "rtc-server");
  assert.deepEqual(await client.runAction("ping"), { pong: true });
  await client.disconnect();
});
