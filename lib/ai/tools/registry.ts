export type ToolPermissionKey = 
  | "finance.receivables.read"
  | "finance.reports.read"
  | "finance.suppliers.read"
  | "finance.bank_reconciliation.read"
  | "finance.accounts.read"
  | "finance.expenses.read"
  | "finance.cashier.read"
  | "property.units.read";

export type GroundingFact = {
  factId: string;
  toolName: string;
  metricName: string;
  value: number | string | Record<string, any>;
  formattedValue: string;
  currency?: string;
  period?: { from?: string; to?: string; name?: string };
  entityScope?: { type: string; id: string; name: string };
  sourceType: string;
  generatedAt: string;
};

export type ToolDefinition = {
  name: string;
  description: string;
  requiredPermission: ToolPermissionKey;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: "string" | "number" | "boolean" | "array" | "object";
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
};

/**
 * P0 Invariant: Zero `tenantId` in tool parameters.
 * Tenant ID and user authorization are strictly enforced by the server context.
 */
export const FINANCIAL_TOOL_REGISTRY: Record<string, ToolDefinition> = {
  get_collection_rate: {
    name: "get_collection_rate",
    description: "Calculates the exact collection rate percentage (نسبة التحصيل), total billed, and total collected for a given property and period.",
    requiredPermission: "finance.receivables.read",
    parameters: {
      type: "object",
      properties: {
        propertyId: { type: "string", description: "Optional Property/Resort UUID filter." },
        periodFrom: { type: "string", description: "Start date in ISO format YYYY-MM-DD." },
        periodTo: { type: "string", description: "End date in ISO format YYYY-MM-DD." },
      },
    },
  },
  get_receivables_summary: {
    name: "get_receivables_summary",
    description: "Retrieves total receivables, overdue amounts, paid amounts, and dues collection progress.",
    requiredPermission: "finance.receivables.read",
    parameters: {
      type: "object",
      properties: {
        propertyId: { type: "string", description: "Optional Property/Resort UUID filter." },
        dueType: { type: "string", description: "Optional due type filter: MAINTENANCE, INSTALLMENT, SERVICE, UTILITY." },
      },
    },
  },
  get_top_debtors: {
    name: "get_top_debtors",
    description: "Returns top overdue members/debtors with highest outstanding balances and associated unit numbers.",
    requiredPermission: "finance.receivables.read",
    parameters: {
      type: "object",
      properties: {
        propertyId: { type: "string", description: "Optional Property UUID filter." },
        limit: { type: "number", description: "Number of top debtors to return (default 5, max 10)." },
      },
    },
  },
  get_overdue_receivables: {
    name: "get_overdue_receivables",
    description: "Returns aging breakdown of unpaid receivables (0-30 days, 31-60 days, 61-90 days, >90 days overdue).",
    requiredPermission: "finance.receivables.read",
    parameters: {
      type: "object",
      properties: {
        propertyId: { type: "string", description: "Optional Property UUID filter." },
        agingBucket: { type: "string", description: "Optional bucket: 'CURRENT', '30_DAYS', '60_DAYS', '90_PLUS_DAYS'." },
      },
    },
  },
  get_cash_position: {
    name: "get_cash_position",
    description: "Returns current verified cash & bank balances across all liquid bank accounts and petty cash funds.",
    requiredPermission: "finance.reports.read",
    parameters: {
      type: "object",
      properties: {
        asOf: { type: "string", description: "Optional as of date (YYYY-MM-DD)." },
      },
    },
  },
  get_supplier_aging: {
    name: "get_supplier_aging",
    description: "Retrieves accounts payable (AP) aging for suppliers and unpaid contractor invoices.",
    requiredPermission: "finance.suppliers.read",
    parameters: {
      type: "object",
      properties: {
        supplierId: { type: "string", description: "Optional specific supplier UUID." },
        bucket: { type: "string", description: "Optional aging bucket: 'CURRENT', '30_DAYS', '60_DAYS', '90_PLUS_DAYS'." },
      },
    },
  },
  get_bank_reconciliation_status: {
    name: "get_bank_reconciliation_status",
    description: "Returns the latest bank statement reconciliation progress, unmatched transactions count, and ledger differences.",
    requiredPermission: "finance.bank_reconciliation.read",
    parameters: {
      type: "object",
      properties: {
        bankAccountId: { type: "string", description: "Optional Bank Account UUID." },
      },
    },
  },
  get_trial_balance_summary: {
    name: "get_trial_balance_summary",
    description: "Fetches verified trial balance totals (Assets, Liabilities, Equity, Revenue, Expenses) and confirms debit/credit equality.",
    requiredPermission: "finance.reports.read",
    parameters: {
      type: "object",
      properties: {
        fiscalPeriodId: { type: "string", description: "Optional Fiscal Period UUID." },
      },
    },
  },
  get_expense_variance: {
    name: "get_expense_variance",
    description: "Compares operating expenses (OPEX) across categories (Maintenance, Utilities, Security, Admin) between two periods.",
    requiredPermission: "finance.expenses.read",
    parameters: {
      type: "object",
      properties: {
        propertyId: { type: "string", description: "Optional Property UUID filter." },
        period: { type: "string", description: "Primary period name or date range." },
        comparisonPeriod: { type: "string", description: "Comparison period name or date range." },
      },
    },
  },
  compare_property_expenses: {
    name: "compare_property_expenses",
    description: "Compares total expenses and cost efficiency metrics across different properties in the organization.",
    requiredPermission: "finance.expenses.read",
    parameters: {
      type: "object",
      properties: {
        propertyId: { type: "string", description: "Property UUID." },
      },
    },
  },
  get_financial_kpi_snapshot: {
    name: "get_financial_kpi_snapshot",
    description: "Returns executive high-level financial summary: Total Revenue, Total OPEX, Net Operating Income (NOI), Cash, and Collection Rate.",
    requiredPermission: "finance.reports.read",
    parameters: {
      type: "object",
      properties: {
        propertyId: { type: "string", description: "Optional Property UUID filter." },
      },
    },
  },
  get_unit_financial_statement: {
    name: "get_unit_financial_statement",
    description: "Returns comprehensive financial statement for a specific unit: dues billed, payments received, and current outstanding balance.",
    requiredPermission: "property.units.read",
    parameters: {
      type: "object",
      properties: {
        unitId: { type: "string", description: "Unit UUID." },
      },
      required: ["unitId"],
    },
  },
};
