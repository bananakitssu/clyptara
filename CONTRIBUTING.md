# Contributing

Clyptara is an independent open protocol project. Contributions should improve interoperable behavior, documentation, implementation quality, or security.

## Before submitting

1. Read `spec/v0.1/README.md` and `spec/v0.1/protocol.md`.
2. For changes to wire behavior, update the specification and JSON Schemas first or in the same change as the implementation.
3. Add conformance tests for normative behavior and failure cases.
4. Keep transport-specific logic out of the protocol core.
5. Do not add secret-bearing fixtures, credentials, or private environment configuration.

## Development

```sh
npm install
npm run check
npm run example
```

TypeScript is the first reference SDK. Python is planned to validate that the written protocol is language-neutral rather than SDK-defined.

## Change proposals

Wire-breaking changes require an explicit versioning discussion. Optional extensions must not redefine existing core methods. The v0.1 draft is experimental and can change before v1.0.
