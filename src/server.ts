import { Ajv } from "ajv";
import { CLYPTARA_PROTOCOL, DEFAULT_MAX_MESSAGE_BYTES, errorResponse, isRecord, isRequestMessage, response, type RequestMessage, type ResponseMessage } from "./protocol.js";

export interface ActionContext { requestId: string }
export interface ActionDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  run(input: Record<string, unknown>, context: ActionContext): unknown | Promise<unknown>;
}
export interface DataEntryDefinition {
  key: string;
  name: string;
  description?: string;
  mediaType?: string;
  get(): unknown | Promise<unknown>;
}
export interface ServerOptions { name?: string; version?: string; maxMessageBytes?: number }

/** A Clyptara peer that publishes callable actions and readable data entries. */
export class ClyptaraServer {
  readonly name: string;
  readonly version: string;
  readonly maxMessageBytes: number;
  private readonly actions = new Map<string, ActionDefinition>();
  private readonly dataEntries = new Map<string, DataEntryDefinition>();
  private readonly ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });

  constructor(options: ServerOptions = {}) {
    this.name = options.name ?? "clyptara-peer";
    this.version = options.version ?? "0.1.0";
    this.maxMessageBytes = options.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES;
  }

  registerAction(action: ActionDefinition): this {
    if (!/^[a-zA-Z][a-zA-Z0-9_.-]{0,127}$/.test(action.name)) throw new Error(`Invalid action name: ${action.name}`);
    if (this.actions.has(action.name)) throw new Error(`Action already registered: ${action.name}`);
    this.ajv.compile(action.inputSchema);
    this.actions.set(action.name, action);
    return this;
  }

  registerDataEntry(entry: DataEntryDefinition): this {
    if (!entry.key || this.dataEntries.has(entry.key)) throw new Error(`Invalid or duplicate data key: ${entry.key}`);
    this.dataEntries.set(entry.key, entry);
    return this;
  }

  async handle(input: unknown): Promise<ResponseMessage> {
    const maybeId = isRecord(input) && typeof input.id === "string" && input.id.length > 0 && input.id.length <= 128 ? input.id : "invalid-request";
    if (!isRecord(input)) return errorResponse(maybeId, "invalid_request", "Request must be a JSON object.");
    if (input.protocol !== CLYPTARA_PROTOCOL) return errorResponse(maybeId, "unsupported_protocol", `Expected protocol ${CLYPTARA_PROTOCOL}.`);
    if (!isRequestMessage(input)) return errorResponse(maybeId, "invalid_request", "Request envelope is invalid.");
    if (Buffer.byteLength(JSON.stringify(input), "utf8") > this.maxMessageBytes) return errorResponse(input.id, "message_too_large", "Request exceeds the configured message size limit.");
    try {
      const result = await this.dispatch(input);
      let jsonResult: unknown = null;
      if (result !== undefined) {
        const serialized = JSON.stringify(result);
        if (serialized === undefined) return errorResponse(input.id, "invalid_result", "Operation returned a non-JSON result.");
        jsonResult = JSON.parse(serialized) as unknown;
      }
      return response(input.id, jsonResult);
    } catch (error) {
      if (error instanceof DispatchError) return errorResponse(input.id, error.code, error.message, error.details);
      return errorResponse(input.id, "internal_error", "Peer operation failed.");
    }
  }

  private async dispatch(request: RequestMessage): Promise<unknown> {
    const params = request.params ?? {};
    switch (request.method) {
      case "link.open": {
        const supported = params.supportedProtocols;
        if (!Array.isArray(supported) || !supported.includes(CLYPTARA_PROTOCOL)) throw new DispatchError("unsupported_protocol", "No mutually supported Clyptara protocol version was provided.");
        const client = isRecord(params.client) ? params.client : {};
        return {
          protocol: CLYPTARA_PROTOCOL,
          peer: { name: this.name, version: this.version },
          client: { name: typeof client.name === "string" ? client.name : "unknown", version: typeof client.version === "string" ? client.version : "unknown" },
          features: ["actions", "data"]
        };
      }
      case "peer.describe":
        return { name: this.name, version: this.version, protocol: CLYPTARA_PROTOCOL, features: ["actions", "data"] };
      case "action.catalog":
        return [...this.actions.values()].map(({ name, description, inputSchema }) => ({ name, ...(description === undefined ? {} : { description }), input: inputSchema }));
      case "action.run": {
        if (typeof params.name !== "string" || !isRecord(params.input)) throw new DispatchError("invalid_params", "action.run requires a name and an input object.");
        const action = this.actions.get(params.name);
        if (!action) throw new DispatchError("action_not_found", `Unknown action: ${params.name}`);
        const validate = this.ajv.compile(action.inputSchema);
        if (!validate(params.input)) throw new DispatchError("invalid_input", "Action input did not match its declared schema.", validate.errors);
        try { return await action.run(params.input, { requestId: request.id }); }
        catch { throw new DispatchError("action_failed", `Action ${action.name} failed.`); }
      }
      case "data.catalog":
        return [...this.dataEntries.values()].map(({ key, name, description, mediaType }) => ({ key, name, ...(description === undefined ? {} : { description }), ...(mediaType === undefined ? {} : { mediaType }) }));
      case "data.fetch": {
        if (typeof params.key !== "string") throw new DispatchError("invalid_params", "data.fetch requires a key string.");
        const entry = this.dataEntries.get(params.key);
        if (!entry) throw new DispatchError("data_not_found", `Unknown data key: ${params.key}`);
        try { return { key: entry.key, ...(entry.mediaType === undefined ? {} : { mediaType: entry.mediaType }), value: await entry.get() }; }
        catch { throw new DispatchError("data_fetch_failed", `Data entry ${entry.key} could not be fetched.`); }
      }
      case "link.close":
        return { closed: true };
      default:
        throw new DispatchError("method_not_found", `Unknown method: ${request.method}`);
    }
  }
}

class DispatchError extends Error {
  constructor(readonly code: string, message: string, readonly details?: unknown) { super(message); }
}
