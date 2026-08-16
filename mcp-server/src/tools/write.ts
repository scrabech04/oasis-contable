import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { oasisPatch, oasisPost, defaultProfileId } from "../oasisClient.js";
import { loadAttachment } from "../attachment.js";

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

const attachmentPathSchema = z
  .string()
  .optional()
  .describe(
    "Path on this machine to the supplier's invoice or receipt backing this purchase (PDF, JPG, PNG or WEBP, " +
    "up to 10 MB). It is stored as the purchase's supporting document, the same slot the app's AI import fills. " +
    "Pass it whenever you read the amounts off such a file: a purchase entered from a document but filed without " +
    "it leaves numbers nobody can check against anything. On an update it REPLACES the current support, since a " +
    "purchase has a single supplier invoice."
  );

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
        attachmentPath: attachmentPathSchema,
        confirm: confirmSchema,
      },
    },
    async (input) => {
      assertConfirmed(input.confirm);
      const { confirm, attachmentPath, ...rest } = input;
      const attachment = attachmentPath ? await loadAttachment(attachmentPath) : undefined;
      const body = { ...rest, attachment, profileId: input.profileId ?? defaultProfileId(), confirm };
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
        attachmentPath: attachmentPathSchema,
        confirm: confirmSchema,
      },
    },
    async (input) => {
      assertConfirmed(input.confirm);
      const { confirm, attachmentPath, ...rest } = input;
      const attachment = attachmentPath ? await loadAttachment(attachmentPath) : undefined;
      const body = { ...rest, attachment, profileId: input.profileId ?? defaultProfileId(), confirm };
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
    "create_quotation",
    {
      title: "Create quotation",
      description:
        "Create a quotation (cotizacion) in Oasis Software Contable. A quotation is a commercial offer: it carries no " +
        "NCF and moves no money, and its number (COT-xxxx) is assigned automatically unless you pass one. " +
        "REQUIRES explicit user confirmation: show the full computed summary (items, subtotal, tax, total, client) " +
        "and get an explicit yes from the user before calling this with confirm: true.",
      inputSchema: {
        profileId: profileIdSchema.optional(),
        contactId: z.union([z.number(), z.literal("new")]).describe("Client contact id, or \"new\" with contactName to create one."),
        contactName: z.string().optional(),
        contactTaxId: z.string().optional(),
        projectId: z.union([z.number(), z.literal("new"), z.literal("none")]).optional(),
        projectName: z.string().optional(),
        items: z.array(itemSchema).min(1),
        number: z.string().optional().describe("Leave unset to let the app assign the next COT-xxxx for this profile."),
        date: z.string().describe("YYYY-MM-DD"),
        validUntil: z.string().optional().describe("YYYY-MM-DD"),
        status: z.enum(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "INVOICED"]).optional(),
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
      const result = await oasisPost("/api/mcp/quotations", body);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "create_proforma",
    {
      title: "Create proforma invoice",
      description:
        "Create a proforma invoice (prefactura) in Oasis Software Contable. A proforma can receive payments but " +
        "carries no NCF; the fiscal document is the sales invoice it is later converted into, so use create_invoice " +
        "instead when the client needs a comprobante fiscal now. Its number (PRO-xxxx) is assigned automatically. " +
        "REQUIRES explicit user confirmation: show the full computed summary (items, subtotal, tax, total, client) " +
        "and get an explicit yes from the user before calling this with confirm: true.",
      inputSchema: {
        profileId: profileIdSchema.optional(),
        contactId: z.union([z.number(), z.literal("new")]).describe("Client contact id, or \"new\" with contactName to create one."),
        contactName: z.string().optional(),
        contactTaxId: z.string().optional(),
        projectId: z.union([z.number(), z.literal("new"), z.literal("none")]).optional(),
        projectName: z.string().optional(),
        items: z.array(itemSchema).min(1),
        date: z.string().describe("YYYY-MM-DD"),
        dueDate: z.string().optional().describe("YYYY-MM-DD"),
        status: z.enum(["DRAFT", "SENT", "PARTIAL", "PAID", "CANCELLED"]).optional(),
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
      const result = await oasisPost("/api/mcp/proformas", body);
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
        attachmentPath: attachmentPathSchema,
        confirm: updateConfirmSchema,
      },
    },
    async ({ id, ...input }) => {
      assertConfirmed(input.confirm);
      const { confirm, attachmentPath, ...rest } = input;
      const attachment = attachmentPath ? await loadAttachment(attachmentPath) : undefined;
      const body = { ...rest, attachment, profileId: input.profileId ?? defaultProfileId(), confirm };
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
        attachmentPath: attachmentPathSchema,
        confirm: updateConfirmSchema,
      },
    },
    async ({ id, ...input }) => {
      assertConfirmed(input.confirm);
      const { confirm, attachmentPath, ...rest } = input;
      const attachment = attachmentPath ? await loadAttachment(attachmentPath) : undefined;
      const body = { ...rest, attachment, profileId: input.profileId ?? defaultProfileId(), confirm };
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

  server.registerTool(
    "update_quotation",
    {
      title: "Update quotation",
      description:
        "Update an existing quotation (cotizacion) in Oasis Software Contable, including relinking it to a " +
        "different project (projectId/projectName), changing its client (contactId/contactName) or moving its " +
        "status (e.g. DRAFT -> SENT -> ACCEPTED)." +
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
        validUntil: z.string().optional().describe("YYYY-MM-DD"),
        status: z.enum(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "INVOICED"]).optional(),
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
      const result = await oasisPatch(`/api/mcp/quotations/${id}`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "update_proforma",
    {
      title: "Update proforma invoice",
      description:
        "Update an existing proforma invoice (prefactura) in Oasis Software Contable, including relinking it to a " +
        "different project (projectId/projectName) or changing its client (contactId/contactName). A proforma " +
        "already converted to a fiscal invoice (status CONVERTED) cannot be edited, and the status you pass is " +
        "reconciled against how much has already been paid." +
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
        status: z.enum(["DRAFT", "SENT", "PARTIAL", "PAID", "CANCELLED"]).optional(),
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
      const result = await oasisPatch(`/api/mcp/proformas/${id}`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "record_payment",
    {
      title: "Record a payment",
      description:
        "Record a payment or partial payment (abono) against a sales invoice, a proforma invoice or a supplier " +
        "purchase in Oasis Software Contable, and attach the receipt that backs it. The document's paid amount and " +
        "status (PENDING / PARTIAL / PAID) are recomputed from its payments afterwards.\n\n" +
        "WORKFLOW when the user hands you a receipt (bank transfer screenshot, deposit slip, PDF voucher):\n" +
        "1. READ the file yourself first and extract amount, date, method and reference from it. Do not ask the " +
        "user to retype what the receipt already says, and do not guess a field the receipt does not show.\n" +
        "2. Show the user what you read, next to the document it will be applied to (its number, total and " +
        "outstanding balance), and get an explicit yes.\n" +
        "3. Call this with confirm: true AND attachmentPath pointing at that same file, so the receipt is stored " +
        "as the payment's supporting document. The file is read from disk by this server - pass the path, never " +
        "the file contents. Always pass the receipt you read; a payment extracted from a document but filed " +
        "without it leaves an amount nobody can trace back.\n\n" +
        "Withholdings (retenciones) count toward the amount settled: a 1,000 payment with a 180 ITBIS withholding " +
        "settles 1,180 of the document.",
      inputSchema: {
        profileId: profileIdSchema.optional(),
        targetType: z.enum(["INVOICE", "PROFORMA", "PURCHASE"]).describe(
          "What is being paid: INVOICE (a sales invoice you issued), PROFORMA (a prefactura), or PURCHASE (a supplier bill you are paying)."
        ),
        targetId: z.number().int().positive().describe("id of the invoice / proforma / purchase. Use the list_* tools to find it."),
        amount: z.number().positive().describe("Amount actually moved, in the document's currency. For a partial payment, only what was paid now."),
        date: z.string().describe("YYYY-MM-DD - the date on the receipt, not today's date."),
        method: z.enum(["CASH", "BANK_TRANSFER", "CHECK", "CARD"]).optional().describe("Defaults to BANK_TRANSFER."),
        reference: z.string().optional().describe("Transaction number, check number or confirmation code from the receipt."),
        notes: z.string().optional(),
        withholdings: z
          .array(z.object({ type: z.string(), amount: z.number() }))
          .optional()
          .describe("Retenciones withheld by the payer, e.g. [{\"type\":\"ITBIS 30%\",\"amount\":180}]."),
        attachmentPath: z
          .string()
          .optional()
          .describe(
            "Path on this machine to the receipt that proves the payment (PDF or image). It is stored with the " +
            "payment as its supporting document. Pass it whenever such a file exists."
          ),
        confirm: confirmSchema,
      },
    },
    async (input) => {
      assertConfirmed(input.confirm);
      const { confirm, attachmentPath, ...rest } = input;
      const attachment = attachmentPath ? await loadAttachment(attachmentPath) : undefined;
      const body = { ...rest, attachment, profileId: input.profileId ?? defaultProfileId(), confirm };
      const result = await oasisPost("/api/mcp/payments", body);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "convert_proforma_to_invoice",
    {
      title: "Convert proforma to fiscal invoice",
      description:
        "Convert a fully paid proforma invoice (prefactura) into a sales invoice with an official NCF. This is the " +
        "step that turns a non-fiscal document into a fiscal one, so it is irreversible: the proforma is left as " +
        "CONVERTED and can no longer be edited, its payments move to the new invoice, and the NCF is consumed from " +
        "the numbering sequence.\n\n" +
        "The proforma must be paid in full first - if it is not, record the missing payment with record_payment " +
        "before calling this. Leave ncf unset so the number is issued atomically from the profile's preferred " +
        "sequence; only pass one when reproducing a number that was already given to the client on paper.\n\n" +
        "REQUIRES explicit user confirmation: show the proforma (number, client, total, paid amount) and say which " +
        "invoice will be created, then get an explicit yes before calling this with confirm: true.",
      inputSchema: {
        id: idSchema.describe("id of the proforma invoice to convert."),
        profileId: profileIdSchema.optional(),
        date: z.string().optional().describe("YYYY-MM-DD for the new invoice. Defaults to today."),
        dueDate: z.string().optional().describe("YYYY-MM-DD. Defaults to today - the invoice is created already paid."),
        incomeType: z.string().optional().describe("DGII 606/607 income-type code, e.g. 01"),
        ncf: z.string().optional().describe("Only to reproduce an NCF already handed to the client. Normally leave unset."),
        confirm: updateConfirmSchema,
      },
    },
    async ({ id, ...input }) => {
      assertConfirmed(input.confirm);
      const { confirm, ...rest } = input;
      const body = { ...rest, profileId: input.profileId ?? defaultProfileId(), confirm };
      const result = await oasisPost(`/api/mcp/proformas/${id}/convert`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "add_contact_person",
    {
      title: "Add a person to a contact",
      description:
        "Add one person (contacto de la empresa) to an existing client or supplier in Oasis Software Contable - " +
        "the human you actually call or email at that company. This only adds: the people already registered on " +
        "that contact are left untouched. Use list_contacts first to find the contact's id and to check the person " +
        "is not already there; adding a name that already exists is refused rather than duplicated.",
      inputSchema: {
        contactId: z.number().int().positive().describe("id of the client/supplier the person belongs to. Find it with list_contacts."),
        profileId: profileIdSchema.optional(),
        name: z.string().min(1).describe("Person's full name."),
        phone: z.string().optional(),
        email: z.string().optional(),
        position: z.string().optional().describe("Cargo, e.g. \"Encargada de compras\"."),
        isMain: z.boolean().optional().describe("Mark as the main contact. Doing so clears the flag on whoever held it before."),
        confirm: confirmSchema,
      },
    },
    async ({ contactId, ...input }) => {
      assertConfirmed(input.confirm);
      const { confirm, ...rest } = input;
      const body = { ...rest, profileId: input.profileId ?? defaultProfileId(), confirm };
      const result = await oasisPost(`/api/mcp/contacts/${contactId}/persons`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
