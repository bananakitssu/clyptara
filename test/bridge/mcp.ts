import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from "@modelcontextprotocol/node";
import * as z from "zod/v4";
import { ClyptaraClient, type RequestTransport } from "../../src/index.js";
import { decodeResponse, type RequestMessage, type ResponseMessage } from "../../src/protocol.js";

class LocalHttpTransport implements RequestTransport {
  constructor(private readonly endpoint: string) {}

  async request(message: RequestMessage): Promise<ResponseMessage> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/clyptara+json", accept: "application/clyptara+json" },
      body: JSON.stringify(message),
      redirect: "error"
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`Clyptara server returned HTTP ${response.status}: ${body}`);
    return decodeResponse(JSON.parse(body) as unknown, message.id);
  }
}

function asZod(schema: Record<string, unknown>): z.ZodTypeAny {
  if (Array.isArray(schema.enum) && schema.enum.length > 0 && schema.enum.every((item) => typeof item === "string")) {
    return z.enum(schema.enum as [string, ...string[]]);
  }

  const type = schema.type;
  if (type === "string") {
    let value = z.string();
    if (typeof schema.minLength === "number") value = value.min(schema.minLength);
    if (typeof schema.maxLength === "number") value = value.max(schema.maxLength);
    if (typeof schema.pattern === "string") value = value.regex(new RegExp(schema.pattern));
    if (typeof schema.description === "string") value = value.describe(schema.description);
    return value;
  }
  if (type === "number" || type === "integer") {
    let value = z.number();
    if (type === "integer") value = value.int();
    if (typeof schema.minimum === "number") value = value.min(schema.minimum);
    if (typeof schema.maximum === "number") value = value.max(schema.maximum);
    if (typeof schema.description === "string") value = value.describe(schema.description);
    return value;
  }
  if (type === "boolean") return z.boolean();
  if (type === "null") return z.null();
  if (type === "array") {
    const itemSchema = typeof schema.items === "object" && schema.items !== null
      ? asZod(schema.items as Record<string, unknown>)
      : z.unknown();
    let value = z.array(itemSchema);
    if (typeof schema.minItems === "number") value = value.min(schema.minItems);
    if (typeof schema.maxItems === "number") value = value.max(schema.maxItems);
    return value;
  }
  if (type === "object" || schema.properties !== undefined) {
    const properties = typeof schema.properties === "object" && schema.properties !== null
      ? schema.properties as Record<string, Record<string, unknown>>
      : {};
    const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : [];
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, propertySchema] of Object.entries(properties)) {
      const parsed = asZod(propertySchema);
      shape[key] = required.includes(key) ? parsed : parsed.optional();
    }
    let value = z.object(shape);
    if (schema.additionalProperties === false) value = value.strict();
    else value = value.passthrough();
    if (typeof schema.description === "string") value = value.describe(schema.description);
    return value;
  }
  return z.unknown();
}

function toolResult(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text" as const, text: text ?? "null" }] };
}

export interface BridgeOptions {
  clyptaraUrl?: string;
  port?: number;
}

export async function startMcpBridge(options: BridgeOptions = {}): Promise<Server> {
  const port = options.port ?? 3000;
  const client = new ClyptaraClient(new LocalHttpTransport(options.clyptaraUrl ?? "http://127.0.0.1:3001/clyptara"), {
    name: "clyptara-mcp-bridge",
    version: "0.1.0"
  });
  await client.connect();
  const actions = await client.getActions();
  const dataEntries = await client.getDataCatalog();

  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: "clyptara-mcp-bridge", version: "0.1.0" });
    for (const action of actions) {
      server.registerTool(action.name, {
        description: action.description ?? `Run the Clyptara action "${action.name}".`,
        inputSchema: asZod(action.input)
      }, async (input) => {
        try {
          return toolResult(await client.runAction(action.name, input as Record<string, unknown>));
        } catch (error) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: error instanceof Error ? error.message : "Clyptara action failed." }]
          };
        }
      });
    }

    server.registerTool("clyptara_peer_info", {
      description: "Get details about the connected Clyptara peer."
    }, async () => {
      try {
        return toolResult(await client.describePeer());
      } catch (error) {
        return { isError: true, content: [{ type: "text" as const, text: error instanceof Error ? error.message : "Could not read peer info." }] };
      }
    });

    server.registerTool("clyptara_data_catalog", {
      description: "List data entries published by the Clyptara peer."
    }, async () => toolResult(dataEntries));

    server.registerTool("clyptara_fetch_data", {
      description: "Read a data entry published by the Clyptara peer.",
      inputSchema: z.object({ key: z.string().min(1).describe("Key from clyptara_data_catalog") })
    }, async ({ key }) => {
      try {
        return toolResult(await client.fetchData(key));
      } catch (error) {
        return { isError: true, content: [{ type: "text" as const, text: error instanceof Error ? error.message : "Could not fetch Clyptara data." }] };
      }
    });

    return server;
  });

  const nodeHandler = toNodeHandler(handler);
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();
  const httpServer = createServer((req, res) => {
    const request = req as typeof req & { method: string; url: string };
    if (!validateHost(request, res) || !validateOrigin(request, res)) return;
    void nodeHandler(request as unknown as Parameters<typeof nodeHandler>[0], res);
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, "127.0.0.1", () => {
      httpServer.off("error", reject);
      resolve();
    });
  });
  const actualPort = (httpServer.address() as AddressInfo).port;
  console.log(`MCP bridge listening at http://127.0.0.1:${actualPort}/mcp`);
  console.log(`Loaded ${actions.length} actions and ${dataEntries.length} data entries from Clyptara.`);
  return httpServer;
}
