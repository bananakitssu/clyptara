# Clyptara Protocol v0.1 (draft)

Clyptara is an independent, vendor-neutral protocol for applications to discover callable actions and fetch data entries exposed by a peer. This experimental draft defines its own versioned request/response contract and its own link/action/data vocabulary.

**Status:** experimental draft; not a stable standard. Breaking changes may occur before v1.0.

## Core methods

- `link.open`
- `peer.describe`
- `action.catalog`
- `action.run`
- `data.catalog`
- `data.fetch`
- `link.close`

## Draft wire envelope

Request:

```json
{
  "protocol": "clyptara/0.1",
  "type": "request",
  "id": "r-001",
  "method": "action.catalog",
  "params": {}
}
```

Success:

```json
{
  "protocol": "clyptara/0.1",
  "type": "response",
  "id": "r-001",
  "result": []
}
```

Error:

```json
{
  "protocol": "clyptara/0.1",
  "type": "error",
  "id": "r-001",
  "error": {
    "code": "method_not_found",
    "message": "Unknown method."
  }
}
```

## Required behavior

1. Use UTF-8 JSON messages and preserve request IDs in responses.
2. Reject unsupported protocol identifiers and malformed request envelopes.
3. Validate action input against the advertised JSON Schema before execution.
4. Return structured error envelopes; do not expose stack traces or secrets in public errors.
5. Enforce message size and execution time limits.
6. Apply authentication and authorization to each protected remote operation.
7. Never infer user consent solely from an action being discoverable.

## v0.1 boundaries

The core is request/response only. Streaming, prompts, subscriptions, hosted registries, agent delegation, built-in identity, and automatic OAuth are out of scope. Transports must preserve the same protocol semantics. WebRTC is an optional binding for an already-established data channel; signaling and authentication are outside the binding.

## Compatibility

Implementations must not assume unknown methods are supported. Version negotiation succeeds only when client and peer share an exact protocol identifier. Clyptara v0.1 does not define aliases for MCP methods. A bridge, if implemented, is a separate integration layer and must explicitly translate semantics.
