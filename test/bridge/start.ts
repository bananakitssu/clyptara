import type { Server } from "node:http";
import { startClyptaraServer } from "./clyptara.js";
import { startMcpBridge } from "./mcp.js";

let clyptara: Server | undefined;
let mcp: Server | undefined;
let stopping = false;

async function stop() {
  if (stopping) return;
  stopping = true;
  await Promise.all([
    new Promise<void>((resolve) => mcp?.close(() => resolve()) ?? resolve()),
    new Promise<void>((resolve) => clyptara?.close(() => resolve()) ?? resolve())
  ]);
}

try {
  clyptara = await startClyptaraServer(Number(process.env.CLYPTARA_PORT ?? 3001));
  mcp = await startMcpBridge({
    port: Number(process.env.MCP_PORT ?? 3000),
    clyptaraUrl: process.env.CLYPTARA_URL ?? "http://127.0.0.1:3001/clyptara"
  });
  console.log("");
  console.log("Ready. Point the MCP client at http://127.0.0.1:" + (process.env.MCP_PORT ?? "3000") + "/mcp");
  console.log("Press Ctrl+C to stop both servers.");
  process.on("SIGINT", () => void stop().then(() => process.exit(0)));
  process.on("SIGTERM", () => void stop().then(() => process.exit(0)));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  await stop();
  process.exitCode = 1;
}
