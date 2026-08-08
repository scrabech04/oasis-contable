import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";

// Resolve relative to this file, not process.cwd() - Claude Code may launch this
// process from the repo root rather than from mcp-server/.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
const { registerReadTools } = await import("./tools/read.js");
const { registerWriteTools } = await import("./tools/write.js");

const server = new McpServer({ name: "oasis-contable", version: "0.1.0" });

registerReadTools(server);
registerWriteTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
