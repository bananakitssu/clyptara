# WebRTC data-channel transport binding (optional draft)

WebRTC is an optional binding for peers that already have an established, authenticated-enough data channel under their application policy. It does not change Clyptara request/response semantics.

- One complete UTF-8 JSON envelope is sent as one data-channel message.
- Each peer must correlate responses by request ID; requests may be concurrently in flight.
- v0.1 limits messages to 1 MiB by default. Large data entries should use an application-specific transfer mechanism rather than assuming arbitrary data-channel message sizes are safe.
- The data channel must be open before sending. The transport rejects requests on closed channels and times out unanswered requests.
- A browser `RTCDataChannel` may be used directly. In Node.js, Werift may be used through the optional adapter in `src/transports/webrtc.ts`.
- This binding does not specify SDP/ICE signaling, rendezvous, candidate exchange, TURN services, peer identity, or trust establishment. Applications MUST define and secure those layers separately before exposing actions.
- Do not treat a successful ICE connection as authorization. Bind peer identity to an authenticated signaling or key-verification mechanism, and apply normal action permissions on the server.
- v0.1 does not define ordered/unordered negotiation or partial-reliability requirements. Use an ordered reliable data channel for the default behavior.
