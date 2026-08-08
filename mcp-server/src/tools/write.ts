import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { oasisPatch, oasisPost, defaultProfileId } from "../oasisClient.js";

const profileIdSchema = z.number().int().positive().describe(
  "AccountProfile id this record belongs to. Call list_profiles first if you don't already know it."
);

const itemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  price: z.number(),
  taxRate: z.number().optional().describe("Percent, e.g. 18 for 18%. Defaults to 0 if omitted."),
  itemType: z.enum(["ITEM", "HEADING", "SUBHEADING"]).optional(),
});

// Second, independent gate on top of whatever the calling model does: the server
// refuses to submit unless confirm is explicitly true. The Next.js route (Fase 2)
// re-checks this again server-side, and the per-call MCP tool-approval prompt is a
// third, host-level layer - do not treat any single one of these as sufficient alone.
function assertConfirmed(confirm: boolean) {
  if (confirm !== true) {
    throw new Error(
      "confirm must be true. Before calling this tool with confirm: true, show the user the full computed " +
      "summary (line items, subtotal, tax, total, NCF if applicable, counterparty) and get an explicit " +
      "affirmative response from them in this same turn. Never set confirm: true speculatively."
    );
  }
}

const confirmSchema = z.boolean().describe(
  "Must be true to actually create the record. Only set true after showing the user the full computed " +
  "summary (items, subtotal, tax, total, NCF if applicable, counterparty) and getting their explicit approval " +
  "in this same conversation turn."
);

const updateConfirmSchema = z.boolean().describe(
  "Must be true to actually apply the update. Only set true after showing the user the full computed " +
  "summary of the resulting record (items, subtotal, tax, total, counterparty, project) and getting their " +
  "explicit approval in this same conversation turn."
);

const idSchema = z.number().int().positive().describe("id of the existing record to update.");

const updateNote =
  " This is a full update: any field you omit is preserved from the current record (call list_expenses / " +
  "list_purchases / list_invoices first if you need to see current values), but items - when you DO pass " +
  "items - fully replace the existing line items rather than merging with them. To just relink the record " +
  "to a different project or change the counterparty, pass only projectId/projectName or contactId/contactName " +
  "plus id, profileId and confirm - the rest carries over.";

export function registerWriteTools(server: McpServer) {
  server.registerTool(
    "create_expense",
    {
      title: "Create expense",
      description:
        "Create an informal expense (Purchase record with type=INFORMAL, no fiscal credit) in Oasis Software Contable. " +
        "REQUIRES explicit user confirmation: show the full computed summary (items, subtotal, tax, total, supplier) " +
        "and get an explicit yes from the user before calling this with confirm: true.",
      inputSchema: {
        profileId: profileIdSchema.optional(),
        contactId: z.union([z.number(), z.literal("new"), z.literal("manual")]).optional(),
        contactName: z.string().optional(),
        contactTaxId: z.string().optional(),
        supplierWebsiteUrl: z.string().optional(),
        projectId: z.union([z.number(), z.literal("new"), z.literal("manual"), z.literal("none")]).optional(),
        projectName: z.string().optional(),
        items: z.array(itemSchema).min(1),
        currency: z.enum(["DOP", "USD"]).optional(),
        exchangeRate: z.number().optional(),
        date: z.string().describe("YYYY-MM-DD"),
        dueDate: z.string().optional().describe("YYYY-MM-DD"),
        ncf: z.string().optional(),
        notes: z.string().optional(),
        confirm: confirmSchema,
      },
    },
    async (input) => {
      assertConfirmed(input.confirm);
      const { confirm, ...rest } = input;
      const body = { ...rest, profileId: input.profileId ?? defaultProfileId(), confirm };
      const result = await oasisPost("/api/mcp/expenses", body);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "create_purchase",
    {
      title: "Create formal purchase",
      description:
        "Create a formal supplier purchase (Purchase record with type=FORMAL, fiscal credit eligible) in Oasis Software " +
        "Contable. REQUIRES explicit user confirmation: show the full computed summary (items, subtotal, tax, total, " +
        "supplier, NCF/RNC) and get an explicit yes from the user before calling this with confirm: true.",
      inputSchema: {
        profileId: profileIdSchema.optional(),
        contactId: z.union([z.number(), z.literal("new"), z.literal("manual")]).optional(),
        contactName: z.string().optional(),
        contactTaxId: z.string().optional(),
        supplierWebsiteUrl: z.string().optional(),
        projectId: z.union([z.number(), z.literal("new"), z.literal("manual"), z.literal("none")]).optional(),
        projectName: z.string().optional(),
        items: z.array(itemSchema).min(1),
        currency: z.enum(["DOP", "USD"]).optional(),
        exchangeRate: z.number().optional(),
        date: z.string().describe("YYYY-MM-DD"),
        dueDate: z.string().optional().describe("YYYY-MM-DD"),
        ncf: z.string().optional().describe("Supplier's NCF on the purchase document, if any. Free text - purchases are not numbered by our own sequences."),
        costType: z.string().optional().describe("DGII 606 cost-type code, e.g. 02"),
        taxTreatment: z.enum(["LOCAL_CREDIT", "LOCAL_NO_CREDIT", "FOREIGN_EXPENSE", "IMPORT_GOODS", "FOREIGN_WITHHOLDING"]).optional(),
        notes: z.string().optional(),
        confirm: confirmSchema,
      },
    },
    async (input) => {
      assertConfirmed(input.confirm);
      const { confirm, ...rest } = input;
      const body = { ...rest, profileId: input.profileId ?? defaultProfileId(), confirm };
      const result = await oasisPost("/api/mcp/purchases", body);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "create_invoice",
    {
      title: "Create sales invoice",
      description:
        "Create a sales invoice in Oasis Software Contable, optionally issuing an official NCF from a numbering " +
        "sequence. REQUIRES explicit user confirmation: show the full computed summary (items, subtotal, tax, total, " +
        "client, and the NCF that will be issued if ncfSequenceId is given) and get an explicit yes from the user " +
        "before calling this with confirm: true. Prefer ncfSequenceId over a free-typed ncf - it atomically claims " +
        "the next number from the chosen sequence so two concurrent invoices can never collide on the same NCF; a " +
        "free-typed ncf is not validated against any sequence.",
      inputSchema: {
        profileId: profileIdSchema.optional(),
        contactId: z.union([z.number(), z.literal("new")]).describe("Client contact id, or \"new\" with contactName to create one."),
        contactName: z.string().optional(),
        contactTaxId: z.string().optional(),
        projectId: z.union([z.number(), z.literal("new"), z.literal("none")]).optional(),
        projectName: z.string().optional(),
        items: z.array(itemSchema).min(1),
        ncfSequenceId: z.number().int().positive().optional().describe("Preferred: atomically issues the next NCF from this sequence. Use preview_next_ncf first to show the user what it will be."),
        date: z.string().describe("YYYY-MM-DD"),
        dueDate: z.string().describe("YYYY-MM-DD"),
        incomeType: z.string().optional().describe("DGII 606/607 income-type code, e.g. 01"),
        title: z.string().optional(),
        subtitle: z.string().optional(),
        notes: z.string().optional(),
        termsAndConditions: z.string().optional(),
        includeCoverPage: z.boolean().optional(),
        includeTermsPage: z.boolean().optional(),
        confirm: confirmSchema,
      },
    },
    async (input) => {
      assertConfirmed(input.confirm);
      const { confirm, ...rest } = input;
      const body = { ...rest, profileId: input.profileId ?? defaultProfileId(), confirm };
      const result = await oasisPost("/api/mcp/invoices", body);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "update_expense",
    {
      title: "Update expense",
      description:
        "Update an existing informal expense (Purchase record with type=INFORMAL) in Oasis Software Contable, " +
        "including relinking it to a different project (projectId/projectName) or changing its counterparty " +
        "(contactId/contactName)." +
        updateNote +
        " REQUIRES explicit user confirmation: show the full computed summary and get an explicit yes from the " +
        "user before calling this with confirm: true.",
      inputSchema: {
        id: idSchema,
        profileId: profileIdSchema.optional(),
        contactId: z.union([z.number(), z.literal("new"), z.literal("manual")]).optional(),
        contactName: z.string().optional(),
        contactTaxId: z.string().optional(),
        supplierWebsiteUrl: z.string().optional(),
        projectId: z.union([z.number(), z.literal("new"), z.literal("manual"), z.literal("none")]).optional(),
        projectName: z.string().optional(),
        items: z.array(itemSchema).min(1).optional(),
        currency: z.enum(["DOP", "USD"]).optional(),
        exchangeRate: z.number().optional(),
        date: z.string().optional().describe("YYYY-MM-DD"),
        dueDate: z.string().optional().describe("YYYY-MM-DD"),
        ncf: z.string().optional(),
        notes: z.string().optional(),
        confirm: updateConfirmSchema,
      },
    },
    async ({ id, ...input }) => {
      assertConfirmed(input.confirm);
      const { confirm, ...rest } = input;
      const body = { ...rest, profileId: input.profileId ?? defaultProfileId(), confirm };
      const result = await oasisPatch(`/api/mcp/expenses/${id}`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "update_purchase",
    {
      title: "Update formal purchase",
      description:
        "Update an existing formal supplier purchase (Purchase record with type=FORMAL) in Oasis Software " +
        "Contable, including relinking it to a different project (projectId/projectName) or changing its " +
        "supplier (contactId/contactName)." +
        updateNote +
        " REQUIRES explicit user confirmation: show the full computed summary and get an explicit yes from the " +
        "user before calling this with confirm: true.",
      inputSchema: {
        id: idSchema,
        profileId: profileIdSchema.optional(),
        contactId: z.union([z.number(), z.literal("new"), z.literal("manual")]).optional(),
        contactName: z.string().optional(),
        contactTaxId: z.string().optional(),
        supplierWebsiteUrl: z.string().optional(),
        projectId: z.union([z.number(), z.literal("new"), z.literal("manual"), z.literal("none")]).optional(),
        projectName: z.string().optional(),
        items: z.array(itemSchema).min(1).optional(),
        currency: z.enum(["DOP", "USD"]).optional(),
        exchangeRate: z.number().optional(),
        date: z.string().optional().describe("YYYY-MM-DD"),
        dueDate: z.string().optional().describe("YYYY-MM-DD"),
        ncf: z.string().optional().describe("Supplier's NCF on the purchase document, if any. Free text - purchases are not numbered by our own sequences."),
        costType: z.string().optional().describe("DGII 606 cost-type code, e.g. 02"),
        taxTreatment: z.enum(["LOCAL_CREDIT", "LOCAL_NO_CREDIT", "FOREIGN_EXPENSE", "IMPORT_GOODS", "FOREIGN_WITHHOLDING"]).optional(),
        notes: z.string().optional(),
        confirm: updateConfirmSchema,
      },
    },
    async ({ id, ...input }) => {
      assertConfirmed(input.confirm);
      const { confirm, ...rest } = input;
      const body = { ...rest, profileId: input.profileId ?? defaultProfileId(), confirm };
      const result = await oasisPatch(`/api/mcp/purchases/${id}`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "update_invoice",
    {
      title: "Update sales invoice",
      description:
        "Update an existing sales invoice in Oasis Software Contable, including relinking it to a different " +
        "project (projectId/projectName) or changing its client (contactId/contactName). The invoice's NCF is " +
        "never changed by this tool - it always keeps the NCF that was issued at creation." +
        updateNote +
        " REQUIRES explicit user confirmation: show the full computed summary and get an explicit yes from the " +
        "user before calling this with confirm: true.",
      inputSchema: {
        id: idSchema,
        profileId: profileIdSchema.optional(),
        contactId: z.union([z.number(), z.literal("new")]).optional().describe("Client contact id, or \"new\" with contactName to create one."),
        contactName: z.string().optional(),
        contactTaxId: z.string().optional(),
        projectId: z.union([z.number(), z.literal("new"), z.literal("none")]).optional(),
        projectName: z.string().optional(),
        items: z.array(itemSchema).min(1).optional(),
        date: z.string().optional().describe("YYYY-MM-DD"),
        dueDate: z.string().optional().describe("YYYY-MM-DD"),
        incomeType: z.string().optional().describe("DGII 606/607 income-type code, e.g. 01"),
        title: z.string().optional(),
        subtitle: z.string().optional(),
        notes: z.string().optional(),
        termsAndConditions: z.string().optional(),
        includeCoverPage: z.boolean().optional(),
        includeTermsPage: z.boolean().optional(),
        confirm: updateConfirmSchema,
      },
    },
    async ({ id, ...input }) => {
      assertConfirmed(input.confirm);
      const { confirm, ...rest } = input;
      const body = { ...rest, profileId: input.profileId ?? defaultProfileId(), confirm };
      const result = await oasisPatch(`/api/mcp/invoices/${id}`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
