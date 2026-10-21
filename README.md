# Clyptara Protocol

**An independent open protocol for AI applications, actions, and data.**

Clyptara lets compatible clients discover callable **actions** and fetch named **data entries** from independent peers. It defines its own versioned message format and deliberately uses a different API vocabulary from MCP; it does not require any AI provider or hosted service.

> **Status: experimental v0.1 draft.** This is an early reference implementation, not a stable or security-audited standard. Expect breaking changes.

## What's implemented

- Versioned JSON request/response envelopes and structured errors.
- Link negotiation and peer description.
- Action registration, JSON Schema input validation, and execution.
- Data-entry catalogs and data fetching.
- In-process transport for tests and embedding.
- stdio transport using newline-delimited JSON.
- HTTPS client/server transport with TLS configuration and authorization hooks.
- Optional browser WebRTC data-channel and Werift adapters.
- Protocol schemas, example clients/servers, tests, and GitHub Actions CI.

## Quick start

Requires Node.js 22 or later.

```sh
npm install
npm run check
npm run example
```

The example creates a peer, registers a `greet` action and one data entry, connects a local client, and runs the action.

## API sketch

```ts
import { ClyptaraClient, ClyptaraServer, LocalTransport } from "clyptara-protocol";

const peer = new ClyptaraServer({ name: "example", version: "0.1.0" });
peer.registerAction({
  name: "greet",
  description: "Greets a person",
  inputSchema: {
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"],
    additionalProperties: false
  },
  run: ({ name }) => ({ greeting: `Hello, ${String(name)}!` })
});

const client = new ClyptaraClient(new LocalTransport(peer));
await client.connect();
console.log(await client.getActions());
console.log(await client.runAction("greet", { name: "World" }));
await client.disconnect();
```

The public API is organized around **links, actions, and data**:

| Client method | Purpose |
|---|---|
| `connect()` | Negotiate the Clyptara version and open a logical link. |
| `describePeer()` | Retrieve peer identity and advertised features. |
| `getActions()` | Read the action catalog. |
| `runAction(name, input)` | Execute an action using schema-validated input. |
| `getDataCatalog()` | List available data entries. |
| `fetchData(key)` | Fetch a data entry by its key. |
| `disconnect()` | Close the logical link and underlying transport. |

## Wire API

A request uses `protocol`, `type`, `id`, `method`, and optional `params`. The v0.1 methods are:

- `link.open`
- `peer.describe`
- `action.catalog`
- `action.run`
- `data.catalog`
- `data.fetch`
- `link.close`

Example:

```json
{
  "protocol": "clyptara/0.1",
  "type": "request",
  "id": "r-01",
  "method": "action.run",
  "params": {
    "name": "greet",
    "input": { "name": "World" }
  }
}
```

Clyptara does not accept MCP method names as aliases. Protocol-specific bridges can be built separately; the core stays independently defined.

## Transports

- **stdio:** `serveStdio(peer)` and `StdioClientTransport(command, args)`.
- **HTTPS:** `HttpsTransport("https://host.example/clyptara")` and `createClyptaraHttpsServer(peer, { tls, authorize })`.
- **WebRTC:** `createWebRtcClientTransport(channel)` for browser `RTCDataChannel`, or `createWeriftClientTransport(channel)` for Werift. Server-side helpers are `serveWebRtcDataChannel` and `serveWeriftDataChannel`.

WebRTC signaling, peer identity, ICE/TURN, and trust establishment are deliberately not bundled. A successful connection is not authorization. Do not expose privileged actions over an unauthenticated peer connection. The optional adapter speaks Clyptara, not MCP; an MCP client needs a separate compatibility bridge.

Optional Werift installation:

```sh
npm install werift
```

## Local MCP bridge demo

The demo starts a Clyptara peer and an MCP server together. MCP tools are mapped to Clyptara actions, while extra tools expose the peer details and its data entries.

Run it with:

    npm install
    npm run test:bridge

By default, the MCP endpoint is http://127.0.0.1:3000/mcp and the Clyptara endpoint is http://127.0.0.1:3001/clyptara. Point your MCP client or local tunnel at the MCP URL, not the Clyptara URL. Press Ctrl+C to stop both servers.

The sample peer publishes greet and add_numbers, plus clyptara_peer_info, clyptara_data_catalog, and clyptara_fetch_data on the MCP side. Change MCP_PORT, CLYPTARA_PORT, or CLYPTARA_URL to use different ports. Both listeners bind to loopback; this demo is for local testing, not public deployment.

On devices where another service already uses port 3000, run:

    MCP_PORT=3002 CLYPTARA_PORT=3003 CLYPTARA_URL=http://127.0.0.1:3003/clyptara npm run test:bridge

## Documentation

- [v0.1 draft overview](spec/v0.1/README.md)
- [Core semantics](spec/v0.1/protocol.md)
- [stdio binding](spec/v0.1/transports/stdio.md)
- [HTTPS binding](spec/v0.1/transports/https.md)
- [WebRTC/Werift binding](spec/v0.1/transports/webrtc.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)
- [Governance](GOVERNANCE.md)

## Design goals

1. Independent, language-neutral protocol semantics.
2. A small core with version negotiation.
3. Schema validation before action execution.
4. Transport-independent message meaning.
5. Security boundaries documented rather than implied by discovery.

## Roadmap

- Stabilize the v0.1 specification and conformance fixtures.
- Add real HTTPS integration tests with temporary certificates.
- Add real browser/Werift peer tests with authenticated signaling.
- Build a Python SDK against the same schemas.
- Define cancellation and optional streaming extensions.
- Package the MCP bridge separately so using MCP stays optional.
- Evaluate domain and trademark clearance before a stable release.

## License

Apache-2.0. See [LICENSE](LICENSE).
