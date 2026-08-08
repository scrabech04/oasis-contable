import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { oasisGet, defaultProfileId } from "../oasisClient.js";

const profileIdSchema = z.number().int().positive().describe(
  "AccountProfile id to scope the query to. Call list_profiles first if you don't already know it."
);

function asText(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

export function registerReadTools(server: McpServer) {
  server.registerTool(
    "list_profiles",
    {
      title: "List account profiles",
      description: "List every AccountProfile (tenant) in Oasis Software Contable. Use this to find the profileId to pass to every other tool.",
      inputSchema: {},
    },
    async () => asText(await oasisGet("/api/mcp/profiles"))
  );

  server.registerTool(
    "list_expenses",
    {
      title: "List expenses",
      description: "List informal expenses (Purchase records with type=INFORMAL) for a profile, optionally filtered by month/year.",
      inputSchema: {
        profileId: profileIdSchema.optional(),
        month: z.number().int().min(1).max(12).optional(),
        year: z.number().int().optional(),
      },
    },
    async ({ profileId, month, year }) =>
      asText(await oasisGet("/api/mcp/expenses", { profileId: profileId ?? defaultProfileId(), month, year }))
  );

  server.registerTool(
    "list_purchases",
    {
      title: "List formal purchases",
      description: "List formal supplier purchases (Purchase records with type=FORMAL) for a profile, optionally filtered by month/year.",
      inputSchema: {
        profileId: profileIdSchema.optional(),
        month: z.number().int().min(1).max(12).optional(),
        year: z.number().int().optional(),
      },
    },
    async ({ profileId, month, year }) =>
      asText(await oasisGet("/api/mcp/purchases", { profileId: profileId ?? defaultProfileId(), month, year }))
  );

  server.registerTool(
    "list_invoices",
    {
      title: "List sales invoices",
      description: "List sales invoices for a profile, optionally filtered by month/year or a text search on number/NCF/client name.",
      inputSchema: {
        profileId: profileIdSchema.optional(),
        month: z.number().int().min(1).max(12).optional(),
        year: z.number().int().optional(),
        search: z.string().optional(),
      },
    },
    async ({ profileId, month, year, search }) =>
      asText(await oasisGet("/api/mcp/invoices", { profileId: profileId ?? defaultProfileId(), month, year, search }))
  );

  server.registerTool(
    "list_contacts",
    {
      title: "List contacts",
      description: "List clients/suppliers for a profile. type filters to CLIENT, SUPPLIER, or BOTH.",
      inputSchema: {
        profileId: profileIdSchema.optional(),
        search: z.string().optional(),
        type: z.enum(["CLIENT", "SUPPLIER"]).optional(),
      },
    },
    async ({ profileId, search, type }) =>
      asText(await oasisGet("/api/mcp/contacts", { profileId: profileId ?? defaultProfileId(), search, type }))
  );

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "List projects (own and shared) for a profile.",
      inputSchema: {
        profileId: profileIdSchema.optional(),
        month: z.number().int().min(1).max(12).optional(),
        year: z.number().int().optional(),
      },
    },
    async ({ profileId, month, year }) =>
      asText(await oasisGet("/api/mcp/projects", { profileId: profileId ?? defaultProfileId(), month, year }))
  );

  server.registerTool(
    "preview_next_ncf",
    {
      title: "Preview next NCF",
      description: "Read-only preview of the next NCF (fiscal receipt number) a numbering sequence would issue. Does NOT reserve or increment it - the real number is only claimed atomically when create_invoice actually runs.",
      inputSchema: {
        profileId: profileIdSchema.optional(),
        sequenceId: z.number().int().positive(),
      },
    },
    async ({ profileId, sequenceId }) =>
      asText(await oasisGet("/api/mcp/ncf/preview", { profileId: profileId ?? defaultProfileId(), sequenceId }))
  );
}
