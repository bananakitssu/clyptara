# Clyptara Protocol v0.1 — Core semantics (draft)

## 1. Roles and vocabulary

A **client** initiates requests. A **peer** is an endpoint that responds to requests and publishes capabilities. An **action** is an operation that may have side effects. A **data entry** is a named, addressable item a peer permits a client to fetch. A **link** is the logical protocol relationship established by `link.open`. A transport carries serialized envelopes but does not redefine their meaning.

## 2. Message envelope

Every request is a JSON object containing:

- `protocol`: exactly `clyptara/0.1`;
- `type`: exactly `request`;
- `id`: a non-empty string of at most 128 characters, unique among that client's outstanding requests;
- `method`: a non-empty string of at most 128 characters;
- `params`: an optional JSON object, defaulting to `{}`.

A success response contains `protocol`, `type: "response"`, the original `id`, and `result`. An error response contains `protocol`, `type: "error"`, the original `id`, and `error`, an object with string `code` and `message` and optional `details`. Errors must not contain stack traces, credentials, or sensitive implementation data.

JSON object members are case-sensitive. This draft permits receivers to ignore unknown envelope members; method-specific parameter schemas may be stricter. Duplicate JSON object keys should be rejected by strict implementations; this remains an interoperability issue for the draft.

## 3. Core methods

### `link.open`

Parameters: `client` object with optional `name` and `version`, and `supportedProtocols`, an array of protocol identifiers. The peer accepts the link only if it supports `clyptara/0.1`. Result: selected `protocol`, peer `{name, version}`, echoed client identity, and advertised `features` such as `actions` and `data`.

### `peer.describe`

No parameters required. Returns `{name, version, protocol, features}` describing the remote peer.

### `action.catalog`

No parameters required. Returns an array of action descriptors `{name, description?, input}`. `input` is a JSON Schema object describing the accepted input object. Names are case-sensitive.

### `action.run`

Parameters: `{name, input}`. The peer must validate `input` against the action's declared schema before execution. Result is action-defined JSON data. Permission checks and any required human approval must occur before side effects.

### `data.catalog`

No parameters required. Returns data descriptors `{key, name, description?, mediaType?}`.

### `data.fetch`

Parameters: `{key}`. Returns `{key, mediaType?, value}`. The peer must limit data access to entries authorized for the caller.

### `link.close`

No parameters required. Returns `{closed:true}`. Closing the logical link does not necessarily close the underlying transport unless its transport binding says so.

## 4. Error codes

The reference implementation defines `invalid_request`, `invalid_json`, `unsupported_protocol`, `invalid_params`, `method_not_found`, `action_not_found`, `invalid_input`, `action_failed`, `data_not_found`, `data_fetch_failed`, `message_too_large`, `link_not_open`, `timeout`, and transport-specific errors. Implementations may define additional lowercase snake_case codes; clients must safely handle unknown codes.

## 5. Limits and execution

Default maximum JSON message size is 1 MiB. Servers should apply execution deadlines, concurrency limits, and independent data-access checks. v0.1 does not guarantee exactly-once action execution or automatic retry behavior.

## 6. Security considerations

Discoverability is not authorization. Peers should expose only intended actions, validate inputs, isolate execution where appropriate, redact diagnostics, and avoid logging secret values. Clients should treat action descriptions and results as untrusted data, require confirmation for consequential operations, and avoid granting ambient credentials. Remote peers must authenticate callers and authorize each protected operation.
