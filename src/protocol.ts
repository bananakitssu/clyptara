/** Clyptara Protocol draft identifier. Wire compatibility is defined by the specification. */
export const CLYPTARA_PROTOCOL = "clyptara/0.1" as const;
export const DEFAULT_MAX_MESSAGE_BYTES = 1_048_576;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface RequestMessage {
  protocol: typeof CLYPTARA_PROTOCOL;
  type: "request";
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface SuccessMessage {
  protocol: typeof CLYPTARA_PROTOCOL;
  type: "response";
  id: string;
  result: unknown;
}

export interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ErrorMessage {
  protocol: typeof CLYPTARA_PROTOCOL;
  type: "error";
  id: string;
  error: ErrorBody;
}

export type ResponseMessage = SuccessMessage | ErrorMessage;

export class ClyptaraProtocolError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ClyptaraProtocolError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isRequestMessage(value: unknown): value is RequestMessage {
  return isRecord(value)
    && value.protocol === CLYPTARA_PROTOCOL
    && value.type === "request"
    && typeof value.id === "string"
    && value.id.length > 0
    && value.id.length <= 128
    && typeof value.method === "string"
    && value.method.length > 0
    && value.method.length <= 128
    && (value.params === undefined || isRecord(value.params));
}

export function response(id: string, result: unknown): SuccessMessage {
  return { protocol: CLYPTARA_PROTOCOL, type: "response", id, result };
}

export function errorResponse(id: string, code: string, message: string, details?: unknown): ErrorMessage {
  const error: ErrorBody = { code, message };
  if (details !== undefined) error.details = details;
  return { protocol: CLYPTARA_PROTOCOL, type: "error", id, error };
}

export function decodeResponse(value: unknown, expectedId?: string): ResponseMessage {
  if (!isRecord(value) || value.protocol !== CLYPTARA_PROTOCOL || typeof value.id !== "string") {
    throw new ClyptaraProtocolError("invalid_response", "Peer returned an invalid Clyptara response envelope.");
  }
  if (expectedId !== undefined && value.id !== expectedId) {
    throw new ClyptaraProtocolError("response_id_mismatch", "Response ID did not match the outstanding request.");
  }
  if (value.type === "response" && Object.hasOwn(value, "result")) return value as unknown as SuccessMessage;
  if (value.type === "error" && isRecord(value.error) && typeof value.error.code === "string" && typeof value.error.message === "string") {
    return value as unknown as ErrorMessage;
  }
  throw new ClyptaraProtocolError("invalid_response", "Peer returned an invalid Clyptara response envelope.");
}
