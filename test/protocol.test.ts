import test from "node:test";
import assert from "node:assert/strict";
import { CLYPTARA_PROTOCOL, decodeResponse, errorResponse, response } from "../src/protocol.js";

test("success envelope preserves protocol and ID", () => {
  assert.deepEqual(response("r1", { ok: true }), { protocol: CLYPTARA_PROTOCOL, type: "response", id: "r1", result: { ok: true } });
});

test("decoder rejects mismatched IDs", () => {
  assert.throws(() => decodeResponse(response("other", {}), "wanted"), /Response ID/);
});

test("error envelope includes a machine-readable code", () => {
  assert.deepEqual(errorResponse("r2", "bad_request", "Not valid."), { protocol: CLYPTARA_PROTOCOL, type: "error", id: "r2", error: { code: "bad_request", message: "Not valid." } });
});
