# Security Policy

Clyptara is experimental and has not undergone an independent security audit. Do not expose it to untrusted networks or use it for high-impact operations without additional controls.

## Reporting

Please avoid opening public issues containing exploit details, credentials, personal data, or vulnerable production endpoints. Use GitHub's private vulnerability reporting for this repository when enabled, or contact the maintainers privately through GitHub.

## Deployment guidance

- Treat action descriptions and action results as untrusted input.
- Validate every action's input against its JSON Schema.
- Require authentication and authorization for remote requests.
- Apply per-action permission policies and human approval for consequential actions.
- Restrict the capabilities exposed by a server; discovery is not permission.
- Use HTTPS for remote transport and configure the `authorize` hook or an equivalent trusted gateway.
- For WebRTC, authenticate peer identity through a separate signaling/key-verification system. ICE connectivity alone does not authenticate a peer.
- Avoid logging credentials, request bodies containing sensitive data, or internal stack traces.
- Enforce resource limits, timeouts, concurrency caps, and process isolation appropriate to deployed actions.

No exactly-once execution guarantee exists in v0.1. A timeout does not prove a side-effecting operation failed; do not automatically retry writes without idempotency controls.
