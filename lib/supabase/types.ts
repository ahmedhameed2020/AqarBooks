// Hand-written types covering what the app queries through Phase 2.
// Regenerate the authoritative version once the schema stabilizes:
//   npx supabase gen types typescript --project-id <ref> --schema public > lib/supabase/types.ts

type OrgStatus = "TRIAL" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";
type SubscriptionStatus = "ACTIVE" | "CANCELED" | "PAST_DUE";
type PlanKey = "STARTER" | "PROFESSIONAL" | "ENTERPRISE";
type OrgEntityType =
  | "DEVELOPER"
  | "FACILITY_MANAGEMENT"
  | "OWNERS_ASSOCIATION"
  | "INDIVIDUAL_OWNER"
  | "TOURIST_RESORT"
  | "TOURIST_VILLAGE"
  | "RESIDENTIAL_COMPOUND"
  | "OTHER";

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          status: OrgStatus;
          default_currency: string;
          entity_type: OrgEntityType | null;
          entity_type_custom_label: string | null;
          address: string | null;
          governorate: string | null;
          city: string | null;
          phone: string | null;
          email: string | null;
          tax_id: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          status?: OrgStatus;
          default_currency?: string;
          entity_type?: OrgEntityType | null;
          entity_type_custom_label?: string | null;
          address?: string | null;
          governorate?: string | null;
          city?: string | null;
          phone?: string | null;
          email?: string | null;
          tax_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["organizations"]["Row"]>;
        Relationships: [];
      };
      resorts: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          code: string;
          timezone: string;
          address: string | null;
          governorate: string | null;
          phone: string | null;
          email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          code: string;
          timezone?: string;
          address?: string | null;
          governorate?: string | null;
          phone?: string | null;
          email?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["resorts"]["Row"]>;
        Relationships: [];
      };
      plans: {
        Row: {
          id: string;
          key: PlanKey;
          name_ar: string;
          name_en: string;
          sort_order: number;
        };
        Insert: { id?: string; key: PlanKey; name_ar: string; name_en: string; sort_order?: number };
        Update: Partial<Database["public"]["Tables"]["plans"]["Row"]>;
        Relationships: [];
      };
      plan_entitlements: {
        Row: {
          id: string;
          plan_id: string;
          key: string;
          value: unknown;
        };
        Insert: { id?: string; plan_id: string; key: string; value: unknown };
        Update: Partial<Database["public"]["Tables"]["plan_entitlements"]["Row"]>;
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          organization_id: string;
          plan_id: string;
          status: SubscriptionStatus;
          current_period_start: string;
          current_period_end: string | null;
          created_at: string;
        };
        Insert: { id?: string; organization_id: string; plan_id: string; status?: SubscriptionStatus };
        Update: Partial<Database["public"]["Tables"]["subscriptions"]["Row"]>;
        Relationships: [];
      };
      roles: {
        Row: {
          id: string;
          organization_id: string | null;
          key: string;
          name_ar: string;
          name_en: string;
          is_system: boolean;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          key: string;
          name_ar: string;
          name_en: string;
          is_system?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["roles"]["Row"]>;
        Relationships: [];
      };
      organization_memberships: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          status: "active" | "invited" | "suspended";
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          status?: "active" | "invited" | "suspended";
        };
        Update: Partial<Database["public"]["Tables"]["organization_memberships"]["Row"]>;
        Relationships: [];
      };
      user_role_assignments: {
        Row: {
          id: string;
          user_id: string;
          role_id: string;
          organization_id: string | null;
          resort_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          role_id: string;
          organization_id?: string | null;
          resort_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["user_role_assignments"]["Row"]>;
        Relationships: [];
      };
      role_permissions: {
        Row: { role_id: string; permission_id: string };
        Insert: { role_id: string; permission_id: string };
        Update: Partial<Database["public"]["Tables"]["role_permissions"]["Row"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
          locale: "ar" | "en";
        };
        Insert: { id: string; full_name?: string | null; locale?: "ar" | "en" };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      platform_audit_logs: {
        Row: {
          id: string;
          actor_id: string | null;
          organization_id: string | null;
          resort_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          reason: string | null;
          safe_change_summary: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          organization_id?: string | null;
          resort_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          reason?: string | null;
          safe_change_summary?: Record<string, unknown> | null;
        };
        Update: Partial<Database["public"]["Tables"]["platform_audit_logs"]["Row"]>;
        Relationships: [];
      };
      cost_centers: {
        Row: {
          id: string;
          organization_id: string;
          resort_id: string | null;
          code: string;
          name_ar: string;
          name_en: string;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          resort_id?: string | null;
          code: string;
          name_ar: string;
          name_en: string;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["cost_centers"]["Row"]>;
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          organization_id: string;
          resort_id: string | null;
          code: string;
          name_ar: string;
          name_en: string;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          resort_id?: string | null;
          code: string;
          name_ar: string;
          name_en: string;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["projects"]["Row"]>;
        Relationships: [];
      };
      chart_of_accounts: {
        Row: {
          id: string;
          organization_id: string;
          resort_id: string | null;
          code: string;
          name_ar: string;
          name_en: string;
          parent_id: string | null;
          category: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
          normal_balance: "DEBIT" | "CREDIT";
          is_group: boolean;
          requires_cost_center: boolean;
          is_active: boolean;
          is_used: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          resort_id?: string | null;
          code: string;
          name_ar: string;
          name_en: string;
          parent_id?: string | null;
          category: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
          normal_balance: "DEBIT" | "CREDIT";
          is_group?: boolean;
          requires_cost_center?: boolean;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["chart_of_accounts"]["Row"]>;
        Relationships: [];
      };
      fiscal_years: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          start_date: string;
          end_date: string;
          status: "PLANNED" | "OPEN" | "CLOSED" | "LOCKED";
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          start_date: string;
          end_date: string;
          status?: "PLANNED" | "OPEN" | "CLOSED" | "LOCKED";
        };
        Update: Partial<Database["public"]["Tables"]["fiscal_years"]["Row"]>;
        Relationships: [];
      };
      fiscal_periods: {
        Row: {
          id: string;
          organization_id: string;
          fiscal_year_id: string;
          period_number: number;
          name: string;
          start_date: string;
          end_date: string;
          status: "PLANNED" | "OPEN" | "CLOSED" | "LOCKED";
        };
        Insert: {
          id?: string;
          organization_id: string;
          fiscal_year_id: string;
          period_number: number;
          name: string;
          start_date: string;
          end_date: string;
          status?: "PLANNED" | "OPEN" | "CLOSED" | "LOCKED";
        };
        Update: Partial<Database["public"]["Tables"]["fiscal_periods"]["Row"]>;
        Relationships: [];
      };
      journal_entries: {
        Row: {
          id: string;
          organization_id: string;
          resort_id: string | null;
          fiscal_period_id: string;
          entry_number: number | null;
          entry_date: string;
          description: string;
          source_type: "JOURNAL_VOUCHER" | "RECEIPT_VOUCHER" | "PAYMENT_VOUCHER";
          source_id: string | null;
          status: "DRAFT" | "UNDER_REVIEW" | "POSTED" | "REVERSED";
          idempotency_key: string | null;
          reversed_entry_id: string | null;
          created_by: string | null;
          reviewed_by: string | null;
          posted_by: string | null;
          posted_at: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      journal_entry_lines: {
        Row: {
          id: string;
          journal_entry_id: string;
          line_number: number;
          account_id: string;
          description: string | null;
          debit: number;
          credit: number;
          cost_center_id: string | null;
          project_id: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      zones: {
        Row: { id: string; organization_id: string; resort_id: string; name_ar: string; name_en: string };
        Insert: { id?: string; organization_id: string; resort_id: string; name_ar: string; name_en: string };
        Update: Partial<Database["public"]["Tables"]["zones"]["Row"]>;
        Relationships: [];
      };
      buildings: {
        Row: {
          id: string;
          organization_id: string;
          resort_id: string;
          zone_id: string | null;
          code: string;
          name_ar: string;
          name_en: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          resort_id: string;
          zone_id?: string | null;
          code: string;
          name_ar: string;
          name_en: string;
        };
        Update: Partial<Database["public"]["Tables"]["buildings"]["Row"]>;
        Relationships: [];
      };
      units: {
        Row: {
          id: string;
          organization_id: string;
          resort_id: string;
          building_id: string | null;
          zone_id: string | null;
          code: string;
          unit_type: "VILLA" | "CHALET" | "APARTMENT" | "SHOP" | "OFFICE" | "SERVICE" | "OTHER";
          floor_number: number | null;
          area: number | null;
          is_active: boolean;
          custom_type_label: string | null;
          archived_at: string | null;
          archived_by: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          resort_id: string;
          building_id?: string | null;
          zone_id?: string | null;
          code: string;
          unit_type?: "VILLA" | "CHALET" | "APARTMENT" | "SHOP" | "OFFICE" | "SERVICE" | "OTHER";
          floor_number?: number | null;
          area?: number | null;
          is_active?: boolean;
          custom_type_label?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["units"]["Row"]>;
        Relationships: [];
      };
      members: {
        Row: {
          id: string;
          organization_id: string;
          full_name: string;
          is_company: boolean;
          email: string | null;
          phone: string | null;
          user_id: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          full_name: string;
          is_company?: boolean;
          email?: string | null;
          phone?: string | null;
          user_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["members"]["Row"]>;
        Relationships: [];
      };
      online_payment_transactions: {
        Row: {
          id: string;
          organization_id: string;
          resort_id: string;
          member_id: string;
          client_request_id: string;
          provider: "PAYMOB" | "FAWRY";
          provider_reference: string | null;
          provider_payload: unknown;
          amount: number;
          status: "PENDING" | "PAID" | "FAILED" | "EXPIRED";
          failure_code: string | null;
          failure_message: string | null;
          payment_id: string | null;
          webhook_event_id: string | null;
          webhook_received_at: string | null;
          paid_at: string | null;
          failed_at: string | null;
          expires_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          resort_id: string;
          member_id: string;
          client_request_id: string;
          provider: "PAYMOB" | "FAWRY";
          provider_reference?: string | null;
          provider_payload?: unknown;
          amount: number;
          status?: "PENDING" | "PAID" | "FAILED" | "EXPIRED";
          failure_code?: string | null;
          failure_message?: string | null;
          payment_id?: string | null;
          webhook_event_id?: string | null;
          webhook_received_at?: string | null;
          paid_at?: string | null;
          failed_at?: string | null;
          expires_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["online_payment_transactions"]["Row"]>;
        Relationships: [];
      };
      member_tags: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          color: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          color?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["member_tags"]["Row"]>;
        Relationships: [];
      };
      member_tag_assignments: {
        Row: {
          member_id: string;
          tag_id: string;
          organization_id: string;
          created_at: string;
        };
        Insert: {
          member_id: string;
          tag_id: string;
          organization_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["member_tag_assignments"]["Row"]>;
        Relationships: [];
      };
      member_saved_filters: {
        Row: {
          id: string;
          organization_id: string;
          created_by: string | null;
          name: string;
          query: Record<string, string>;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          created_by?: string | null;
          name: string;
          query?: Record<string, string>;
        };
        Update: Partial<Database["public"]["Tables"]["member_saved_filters"]["Row"]>;
        Relationships: [];
      };
      member_activity_log: {
        Row: {
          id: string;
          organization_id: string;
          member_id: string;
          actor_id: string | null;
          type: "note" | "call" | "whatsapp_reminder" | "email_reminder";
          body: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          member_id: string;
          actor_id?: string | null;
          type: "note" | "call" | "whatsapp_reminder" | "email_reminder";
          body?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["member_activity_log"]["Row"]>;
        Relationships: [];
      };
      member_phones: {
        Row: {
          id: string;
          organization_id: string;
          member_id: string;
          phone_number: string;
          normalized_phone: string;
          label: "PERSONAL" | "WORK" | "WHATSAPP" | "HOME" | "OTHER";
          is_primary: boolean;
          can_receive_whatsapp: boolean;
          is_verified: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          member_id: string;
          phone_number: string;
          normalized_phone: string;
          label?: "PERSONAL" | "WORK" | "WHATSAPP" | "HOME" | "OTHER";
          is_primary?: boolean;
          can_receive_whatsapp?: boolean;
          is_verified?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["member_phones"]["Row"]>;
        Relationships: [];
      };
      member_documents: {
        Row: {
          id: string;
          organization_id: string;
          member_id: string;
          file_path: string;
          file_name: string;
          file_size: number | null;
          mime_type: string | null;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          member_id: string;
          file_path: string;
          file_name: string;
          file_size?: number | null;
          mime_type?: string | null;
          uploaded_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["member_documents"]["Row"]>;
        Relationships: [];
      };
      supplier_invoice_attachments: {
        Row: {
          id: string;
          organization_id: string;
          invoice_id: string;
          file_path: string;
          file_name: string;
          file_size: number | null;
          mime_type: string | null;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          invoice_id: string;
          file_path: string;
          file_name: string;
          file_size?: number | null;
          mime_type?: string | null;
          uploaded_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["supplier_invoice_attachments"]["Row"]>;
        Relationships: [];
      };
      property_import_logs: {
        Row: {
          id: string;
          organization_id: string;
          resort_id: string | null;
          import_kind: "units" | "members";
          imported_rows: number;
          skipped_rows: number;
          allow_partial: boolean;
          failures: { row?: number; error?: string }[];
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          resort_id?: string | null;
          import_kind: "units" | "members";
          imported_rows: number;
          skipped_rows: number;
          allow_partial: boolean;
          failures?: { row?: number; error?: string }[];
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["property_import_logs"]["Row"]>;
        Relationships: [];
      };
      unit_ownerships: {
        Row: {
          id: string;
          organization_id: string;
          unit_id: string;
          member_id: string;
          share_percentage: number;
          is_primary_contact: boolean;
          start_date: string;
          end_date: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          unit_id: string;
          member_id: string;
          share_percentage?: number;
          is_primary_contact?: boolean;
          start_date?: string;
          end_date?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["unit_ownerships"]["Row"]>;
        Relationships: [];
      };
      due_types: {
        Row: {
          id: string;
          organization_id: string;
          name_ar: string;
          name_en: string;
          default_revenue_account_id: string;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name_ar: string;
          name_en: string;
          default_revenue_account_id: string;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["due_types"]["Row"]>;
        Relationships: [];
      };
      due_schedules: {
        Row: {
          id: string;
          organization_id: string;
          resort_id: string;
          name: string;
          description_ar: string | null;
          description_en: string | null;
          due_type_id: string;
          receivable_account_id: string;
          amount: number;
          amount_by_unit_type: Record<string, number> | null;
          frequency: "MONTHLY" | "YEARLY";
          day_of_month: number;
          month_of_year: number | null;
          scope: Record<string, unknown>;
          due_offset_days: number;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          resort_id: string;
          name: string;
          description_ar?: string | null;
          description_en?: string | null;
          due_type_id: string;
          receivable_account_id: string;
          amount: number;
          amount_by_unit_type?: Record<string, number> | null;
          frequency: "MONTHLY" | "YEARLY";
          day_of_month?: number;
          month_of_year?: number | null;
          scope?: Record<string, unknown>;
          due_offset_days?: number;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["due_schedules"]["Insert"]>;
        Relationships: [];
      };
      due_generation_runs: {
        Row: {
          id: string;
          organization_id: string;
          schedule_id: string;
          period: string;
          generated_units_count: number;
          total_amount: number;
          generated_by: string | null;
          generated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      financial_audit_logs: {
        Row: {
          id: string;
          organization_id: string;
          resort_id: string | null;
          actor_user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          request_id: string | null;
          occurred_at: string;
          ip_address: string | null;
          user_agent: string | null;
          metadata: Record<string, unknown>;
          previous_hash: string | null;
          event_hash: string;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      dues: {
        Row: {
          id: string;
          organization_id: string;
          resort_id: string;
          unit_id: string;
          due_type_id: string;
          receivable_account_id: string;
          amount: number;
          issue_date: string;
          due_date: string;
          description: string | null;
          status: "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "VOID";
          journal_entry_id: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          organization_id: string;
          resort_id: string | null;
          member_id: string | null;
          unit_id: string | null;
          amount: number;
          method: "CASH" | "BANK_TRANSFER" | "CHEQUE" | "OTHER" | "ONLINE";
          payment_date: string;
          receipt_number: number | null;
          receipt_no: string | null;
          memo: string | null;
          unallocated_amount: number;
          deposit_account_id: string | null;
          journal_entry_id: string | null;
          idempotency_key: string | null;
          status: "POSTED" | "REVERSED";
          created_by: string | null;
          created_at: string;
          reversed_at: string | null;
          reversed_by: string | null;
          reversal_reason: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      payment_allocations: {
        Row: {
          id: string;
          payment_id: string;
          due_id: string;
          amount: number;
          reversed_at: string | null;
          reversed_by: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      budgets: {
        Row: {
          id: string;
          organization_id: string;
          fiscal_period_id: string;
          account_id: string;
          amount: number;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          fiscal_period_id: string;
          account_id: string;
          amount: number;
          created_by?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["budgets"]["Row"]>;
        Relationships: [];
      };
      cashboxes: {
        Row: {
          id: string;
          organization_id: string;
          resort_id: string;
          name: string;
          gl_account_id: string;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          resort_id: string;
          name: string;
          gl_account_id: string;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["cashboxes"]["Row"]>;
        Relationships: [];
      };
      cashier_sessions: {
        Row: {
          id: string;
          organization_id: string;
          resort_id: string;
          cashbox_id: string;
          opened_by: string;
          opening_balance: number;
          status: "OPEN" | "CLOSED" | "RECONCILED";
          expected_closing_balance: number | null;
          actual_closing_balance: number | null;
          variance: number | null;
          opened_at: string;
          closed_by: string | null;
          closed_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      cash_transactions: {
        Row: {
          id: string;
          organization_id: string;
          session_id: string;
          type: "RECEIPT" | "PAYMENT";
          amount: number;
          payment_id: string | null;
          description: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      banks: {
        Row: { id: string; organization_id: string; name_ar: string; name_en: string };
        Insert: { id?: string; organization_id: string; name_ar: string; name_en: string };
        Update: Partial<Database["public"]["Tables"]["banks"]["Row"]>;
        Relationships: [];
      };
      bank_accounts: {
        Row: {
          id: string;
          organization_id: string;
          resort_id: string;
          bank_id: string;
          account_name: string;
          account_number: string;
          gl_account_id: string;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          resort_id: string;
          bank_id: string;
          account_name: string;
          account_number: string;
          gl_account_id: string;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["bank_accounts"]["Row"]>;
        Relationships: [];
      };
      cheques: {
        Row: {
          id: string;
          organization_id: string;
          resort_id: string;
          bank_account_id: string;
          direction: "INCOMING" | "OUTGOING";
          cheque_number: string;
          amount: number;
          member_id: string | null;
          cheque_date: string;
          due_date: string;
          status: "DRAFT" | "ISSUED" | "RECEIVED" | "DEPOSITED" | "CLEARED" | "RETURNED" | "CANCELLED";
          payment_id: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      cheque_status_history: {
        Row: {
          id: string;
          cheque_id: string;
          from_status: string | null;
          to_status: string;
          changed_by: string | null;
          changed_at: string;
          note: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      suppliers: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          contact_email: string | null;
          contact_phone: string | null;
          secondary_phone: string | null;
          contact_person: string | null;
          tax_number: string | null;
          commercial_registry: string | null;
          address: string | null;
          bank_account_details: string | null;
          payable_account_id: string;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          contact_email?: string | null;
          contact_phone?: string | null;
          secondary_phone?: string | null;
          contact_person?: string | null;
          tax_number?: string | null;
          commercial_registry?: string | null;
          address?: string | null;
          bank_account_details?: string | null;
          payable_account_id: string;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["suppliers"]["Row"]>;
        Relationships: [];
      };
      expense_categories: {
        Row: {
          id: string;
          organization_id: string;
          name_ar: string;
          name_en: string;
          default_expense_account_id: string;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name_ar: string;
          name_en: string;
          default_expense_account_id: string;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["expense_categories"]["Row"]>;
        Relationships: [];
      };
      purchase_requests: {
        Row: {
          id: string;
          organization_id: string;
          resort_id: string;
          description: string;
          estimated_amount: number;
          status: "SUBMITTED" | "APPROVED" | "REJECTED";
          requested_by: string | null;
          approved_by: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      purchase_orders: {
        Row: {
          id: string;
          organization_id: string;
          resort_id: string;
          supplier_id: string;
          purchase_request_id: string | null;
          order_number: number | null;
          description: string;
          amount: number;
          order_date: string;
          status: "DRAFT" | "APPROVED" | "RECEIVED" | "CANCELLED";
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      supplier_invoices: {
        Row: {
          id: string;
          organization_id: string;
          resort_id: string;
          supplier_id: string;
          purchase_order_id: string | null;
          invoice_number: string;
          expense_account_id: string;
          payable_account_id: string;
          amount: number;
          net_amount: number;
          discount_amount: number;
          vat_rate: number;
          vat_amount: number;
          vat_account_id: string | null;
          wht_rate: number;
          wht_amount: number;
          wht_account_id: string | null;
          invoice_date: string;
          due_date: string;
          status: "POSTED" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";
          journal_entry_id: string | null;
          reversed_at: string | null;
          reversed_by: string | null;
          reversal_reason: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      supplier_payments: {
        Row: {
          id: string;
          organization_id: string;
          resort_id: string;
          supplier_id: string;
          amount: number;
          wht_amount: number;
          wht_account_id: string | null;
          method: "CASH" | "BANK_TRANSFER" | "CHEQUE" | "OTHER";
          payment_date: string;
          voucher_number: number | null;
          payment_account_id: string;
          journal_entry_id: string | null;
          reversed_at: string | null;
          reversed_by: string | null;
          reversal_reason: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      supplier_payment_allocations: {
        Row: {
          id: string;
          payment_id: string;
          invoice_id: string;
          amount: number;
          reversed_at: string | null;
          reversed_by: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      expenses: {
        Row: {
          id: string;
          organization_id: string;
          resort_id: string;
          expense_category_id: string;
          description: string;
          amount: number;
          expense_date: string;
          payment_account_id: string;
          voucher_number: number | null;
          journal_entry_id: string | null;
          cashier_session_id: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      contact_requests: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          phone: string | null;
          message: string;
          status: "NEW" | "CONTACTED" | "CLOSED";
          created_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          email: string;
          phone?: string | null;
          message: string;
          status?: "NEW" | "CONTACTED" | "CLOSED";
        };
        Update: Partial<Database["public"]["Tables"]["contact_requests"]["Row"]>;
        Relationships: [];
      };
      coa_templates: {
        Row: { key: string; name_ar: string; name_en: string };
        Insert: { key: string; name_ar: string; name_en: string };
        Update: Partial<Database["public"]["Tables"]["coa_templates"]["Row"]>;
        Relationships: [];
      };
      demo_leads: {
        Row: {
          id: string;
          full_name: string;
          company: string | null;
          role_title: string | null;
          organization_name: string | null;
          units_count: number | null;
          gates_count: number | null;
          email: string;
          phone: string | null;
          preferred_contact_method: "email" | "phone" | null;
          message: string | null;
          status: "NEW" | "CONTACTED" | "QUALIFIED" | "CLOSED";
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["demo_leads"]["Row"], "id" | "created_at" | "status"> & {
          id?: string;
          status?: "NEW" | "CONTACTED" | "QUALIFIED" | "CLOSED";
        };
        Update: Partial<Database["public"]["Tables"]["demo_leads"]["Row"]>;
        Relationships: [];
      };
    };
    Views: {
      units_with_financials: {
        Row: {
          id: string;
          organization_id: string;
          resort_id: string;
          building_id: string | null;
          zone_id: string | null;
          code: string;
          unit_type: "VILLA" | "CHALET" | "APARTMENT" | "SHOP" | "OFFICE" | "SERVICE" | "OTHER";
          floor_number: number | null;
          area: number | null;
          is_active: boolean;
          building_name_ar: string | null;
          building_name_en: string | null;
          zone_name_ar: string | null;
          zone_name_en: string | null;
          owner_id: string | null;
          owner_name: string | null;
          occupancy_status: "OCCUPIED" | "VACANT";
          total_due: number;
          total_paid: number;
          balance: number;
          has_arrears: boolean;
          custom_type_label: string | null;
          owner_phone: string | null;
          archived_at: string | null;
        };
        Relationships: [];
      };
      members_with_financials: {
        Row: {
          id: string;
          organization_id: string;
          full_name: string;
          is_company: boolean;
          email: string | null;
          phone: string | null;
          units_count: number;
          total_balance: number;
          has_arrears: boolean;
          last_payment_amount: number | null;
          last_payment_date: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      current_member_id: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
      create_online_payment_checkout_transaction: {
        Args: { p_due_ids: string[]; p_provider: string };
        Returns: {
          transaction_id: string;
          amount: number;
        }[];
      };
      record_online_payment: {
        Args: { p_transaction_id: string; p_webhook_event_id: string; p_provider_payload?: unknown };
        Returns: {
          status: string;
          payment_id: string | null;
          failure_code: string | null;
          failure_message: string | null;
        }[];
      };
      // service_role only -- see supabase/migrations/20260816170000_payment_provider_settings_schema.sql
      // and .../20260816180000_payment_provider_settings_no_tenant_setting_distinction.sql.
      get_payment_provider_credentials: {
        Args: { p_organization_id: string; p_resort_id: string | null; p_provider: string; p_environment: string };
        Returns: {
          merchant_identifier: string;
          public_key: string | null;
          api_key: string;
          hmac_secret: string;
          settings_id: string;
        }[];
      };
      upsert_payment_provider_settings: {
        Args: {
          p_organization_id: string;
          p_resort_id: string | null;
          p_provider: string;
          p_environment: string;
          p_merchant_identifier: string | null;
          p_public_key: string | null;
          p_api_key: string | null;
          p_hmac_secret: string | null;
        };
        Returns: string;
      };
      record_payment_provider_verification: {
        Args: { p_settings_id: string; p_success: boolean; p_error_message?: string | null };
        Returns: undefined;
      };
      enable_payment_provider: {
        Args: { p_settings_id: string };
        Returns: undefined;
      };
      disable_payment_provider: {
        Args: { p_settings_id: string };
        Returns: undefined;
      };
      list_payment_provider_settings: {
        Args: { p_organization_id: string };
        Returns: {
          id: string;
          resort_id: string | null;
          provider: string;
          environment: string;
          merchant_identifier: string | null;
          public_key: string | null;
          has_api_key: boolean;
          has_hmac_secret: boolean;
          status: string;
          enabled: boolean;
          verified_at: string | null;
          last_verification_error: string | null;
        }[];
      };
      get_own_organization_display: {
        Args: Record<PropertyKey, never>;
        Returns: {
          name: string;
          default_currency: string;
        }[];
      };
      create_member_invitation: {
        Args: { p_member_id: string };
        Returns: {
          invitation_id: string;
          raw_token: string;
          member_email: string;
          member_phone: string | null;
        }[];
      };
      accept_member_invitation: {
        Args: { p_invitation_id: string; p_token: string };
        Returns: string;
      };
      expire_stale_member_invitations: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      expire_stale_online_payment_transactions: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      is_platform_admin: { Args: { p_user_id: string }; Returns: boolean };
      is_org_member: {
        Args: { p_user_id: string; p_organization_id: string };
        Returns: boolean;
      };
      is_resort_member: {
        Args: { p_user_id: string; p_resort_id: string };
        Returns: boolean;
      };
      organization_is_active: {
        Args: { p_organization_id: string };
        Returns: boolean;
      };
      has_permission: {
        Args: {
          p_user_id: string;
          p_organization_id: string;
          p_permission_key: string;
        };
        Returns: boolean;
      };
      get_entitlement: {
        Args: { p_organization_id: string; p_key: string };
        Returns: unknown;
      };
      create_organization: {
        Args: {
          p_name: string;
          p_slug: string;
          p_default_currency: string;
          p_plan_key: string | null;
        };
        Returns: string;
      };
      set_organization_status: {
        Args: { p_organization_id: string; p_status: string; p_reason: string | null };
        Returns: undefined;
      };
      assign_subscription: {
        Args: { p_organization_id: string; p_plan_key: string };
        Returns: string;
      };
      create_resort: {
        Args: {
          p_organization_id: string;
          p_name: string;
          p_code: string;
          p_timezone: string | null;
          p_address?: string | null;
          p_governorate?: string | null;
          p_phone?: string | null;
          p_email?: string | null;
        };
        Returns: string;
      };
      update_resort: {
        Args: {
          p_resort_id: string;
          p_name: string;
          p_code: string;
          p_timezone: string | null;
          p_address?: string | null;
          p_governorate?: string | null;
          p_phone?: string | null;
          p_email?: string | null;
        };
        Returns: undefined;
      };
      delete_resort: {
        Args: { p_resort_id: string };
        Returns: undefined;
      };
      update_unit: {
        Args: {
          p_organization_id: string;
          p_unit_id: string;
          p_code: string;
          p_unit_type: string;
          p_custom_type_label?: string | null;
          p_building_id?: string | null;
          p_zone_id?: string | null;
          p_floor_number?: number | null;
          p_area?: number | null;
        };
        Returns: undefined;
      };
      archive_unit: {
        Args: { p_organization_id: string; p_unit_id: string; p_reason?: string | null };
        Returns: undefined;
      };
      restore_unit: {
        Args: { p_organization_id: string; p_unit_id: string };
        Returns: undefined;
      };
      add_organization_member: {
        Args: { p_organization_id: string; p_user_id: string; p_role_key: string };
        Returns: undefined;
      };
      next_sequence_value: {
        Args: { p_organization_id: string; p_resort_id: string | null; p_sequence_type: string };
        Returns: number;
      };
      clone_chart_of_accounts_template: {
        Args: { p_organization_id: string; p_template_key: string };
        Returns: undefined;
      };
      create_fiscal_year: {
        Args: {
          p_organization_id: string;
          p_name: string;
          p_start_date: string;
          p_end_date: string;
        };
        Returns: string;
      };
      set_fiscal_period_status: {
        Args: { p_fiscal_period_id: string; p_status: string; p_reason: string | null };
        Returns: undefined;
      };
      create_journal_entry: {
        Args: {
          p_organization_id: string;
          p_resort_id: string | null;
          p_fiscal_period_id: string;
          p_entry_date: string;
          p_description: string;
          p_source_type: string;
          p_lines: unknown;
          p_idempotency_key: string | null;
        };
        Returns: string;
      };
      submit_journal_entry_for_review: {
        Args: { p_journal_entry_id: string };
        Returns: undefined;
      };
      post_journal_entry: {
        Args: { p_journal_entry_id: string };
        Returns: undefined;
      };
      reverse_journal_entry: {
        Args: {
          p_journal_entry_id: string;
          p_reversal_fiscal_period_id: string;
          p_reversal_date: string;
          p_reason: string | null;
        };
        Returns: string;
      };
      issue_due: {
        Args: {
          p_organization_id: string;
          p_resort_id: string;
          p_unit_id: string;
          p_due_type_id: string;
          p_receivable_account_id: string;
          p_amount: number;
          p_issue_date: string;
          p_due_date: string;
          p_description: string | null;
          p_fiscal_period_id: string;
        };
        Returns: string;
      };
      record_payment: {
        Args: {
          p_organization_id: string;
          p_resort_id: string;
          p_member_id: string | null;
          p_unit_id: string | null;
          p_amount: number;
          p_method: string;
          p_payment_date: string;
          p_deposit_account_id: string;
          p_fiscal_period_id: string;
          p_allocations: unknown;
          p_idempotency_key: string | null;
          p_cashier_session_id?: string | null;
        };
        Returns: string;
      };
      create_cashbox: {
        Args: { p_organization_id: string; p_resort_id: string; p_name: string; p_gl_account_id: string };
        Returns: string;
      };
      open_cashier_session: {
        Args: {
          p_organization_id: string;
          p_resort_id: string;
          p_cashbox_id: string;
          p_opening_balance: number;
        };
        Returns: string;
      };
      close_cashier_session: {
        Args: { p_session_id: string; p_actual_closing_balance: number };
        Returns: {
          expected_closing_balance: number;
          actual_closing_balance: number;
          variance: number;
        };
      };
      reconcile_cashier_session: {
        Args: { p_session_id: string; p_note: string | null };
        Returns: undefined;
      };
      create_bank: {
        Args: { p_organization_id: string; p_name_ar: string; p_name_en: string };
        Returns: string;
      };
      create_bank_account: {
        Args: {
          p_organization_id: string;
          p_resort_id: string;
          p_bank_id: string;
          p_account_name: string;
          p_account_number: string;
          p_gl_account_id: string;
        };
        Returns: string;
      };
      record_incoming_cheque: {
        Args: {
          p_organization_id: string;
          p_resort_id: string;
          p_bank_account_id: string;
          p_cheque_number: string;
          p_amount: number;
          p_member_id: string | null;
          p_cheque_date: string;
          p_due_date: string;
        };
        Returns: string;
      };
      set_cheque_status: {
        Args: { p_cheque_id: string; p_new_status: string; p_note: string | null };
        Returns: undefined;
      };
      clear_incoming_cheque: {
        Args: {
          p_cheque_id: string;
          p_clearing_date: string;
          p_fiscal_period_id: string;
          p_allocations: unknown;
        };
        Returns: string;
      };
      create_purchase_request: {
        Args: {
          p_organization_id: string;
          p_resort_id: string;
          p_description: string;
          p_estimated_amount: number;
        };
        Returns: string;
      };
      decide_purchase_request: {
        Args: { p_request_id: string; p_approve: boolean; p_reason: string | null };
        Returns: undefined;
      };
      create_purchase_order: {
        Args: {
          p_organization_id: string;
          p_resort_id: string;
          p_supplier_id: string;
          p_purchase_request_id: string | null;
          p_description: string;
          p_amount: number;
          p_order_date: string;
        };
        Returns: string;
      };
      approve_purchase_order: {
        Args: { p_purchase_order_id: string };
        Returns: undefined;
      };
      set_purchase_order_status: {
        Args: { p_purchase_order_id: string; p_new_status: string };
        Returns: undefined;
      };
      post_supplier_invoice: {
        Args: {
          p_organization_id: string;
          p_resort_id: string;
          p_supplier_id: string;
          p_purchase_order_id: string | null;
          p_invoice_number: string;
          p_expense_account_id: string;
          p_net_amount: number;
          p_discount_amount: number;
          p_vat_rate: number;
          p_vat_account_id: string | null;
          p_wht_rate: number;
          p_wht_account_id: string | null;
          p_invoice_date: string;
          p_due_date: string;
          p_fiscal_period_id: string;
        };
        Returns: string;
      };
      record_supplier_payment: {
        Args: {
          p_organization_id: string;
          p_resort_id: string;
          p_supplier_id: string;
          p_amount: number;
          p_method: string;
          p_payment_date: string;
          p_payment_account_id: string;
          p_fiscal_period_id: string;
          p_allocations: unknown;
          p_idempotency_key: string | null;
          p_cashier_session_id?: string | null;
        };
        Returns: string;
      };
      cancel_supplier_invoice: {
        Args: {
          p_organization_id: string;
          p_invoice_id: string;
          p_fiscal_period_id: string;
          p_reason: string;
        };
        Returns: string;
      };
      void_supplier_payment: {
        Args: {
          p_organization_id: string;
          p_payment_id: string;
          p_fiscal_period_id: string;
          p_reason: string;
        };
        Returns: string;
      };
      get_trial_balance: {
        Args: { p_organization_id: string; p_start_date: string; p_end_date: string };
        Returns: {
          account_id: string;
          code: string;
          name_ar: string;
          name_en: string;
          category: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
          normal_balance: "DEBIT" | "CREDIT";
          total_debit: number;
          total_credit: number;
          balance: number;
        }[];
      };
      get_account_ledger: {
        Args: {
          p_organization_id: string;
          p_account_id: string;
          p_start_date: string;
          p_end_date: string;
        };
        Returns: {
          entry_id: string;
          entry_number: number | null;
          entry_date: string;
          description: string | null;
          debit: number;
          credit: number;
          running_balance: number;
        }[];
      };
      link_unit_ownership: {
        Args: {
          p_organization_id: string;
          p_unit_id: string;
          p_member_id: string;
          p_share_percentage: number;
          p_is_primary_contact?: boolean;
          p_start_date?: string;
          p_end_date?: string | null;
        };
        Returns: {
          success: boolean;
          ownership_id: string;
        };
      };
      record_expense: {
        Args: {
          p_organization_id: string;
          p_resort_id: string;
          p_expense_category_id: string;
          p_description: string;
          p_amount: number;
          p_expense_date: string;
          p_payment_account_id: string;
          p_fiscal_period_id: string;
          p_cashier_session_id?: string | null;
        };
        Returns: string;
      };
      get_journal_entry_for_view: {
        Args: {
          p_entry_id: string;
        };
        Returns: Database["public"]["Tables"]["journal_entries"]["Row"];
      };
    };
  };
};
