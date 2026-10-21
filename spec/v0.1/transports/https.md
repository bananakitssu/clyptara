# HTTPS transport binding (v0.1 draft)

- A client sends one request envelope in an HTTP `POST` body to the configured endpoint.
- Request and response media type is `application/clyptara+json`; `application/json` may be accepted by servers for interoperability.
- Remote endpoints MUST use HTTPS. Clients must reject redirects by default and must not send credentials to a different origin.
- Successful protocol responses use HTTP 200 with a Clyptara response/error envelope. HTTP statuses represent transport/authentication/request-body errors, not action results.
- Servers must enforce body limits, authenticate and authorize each request, avoid caching, and return `Cache-Control: no-store` for action responses.
- The reference server factory accepts an `authorize` callback. A production service must configure it or enforce equivalent authentication in a trusted reverse proxy.
- Streaming, server-sent events, reconnect, and automatic retry are outside v0.1. A timed-out invocation may still have completed; writes must not be retried blindly.
