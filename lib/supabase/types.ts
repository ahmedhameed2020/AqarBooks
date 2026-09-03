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
          tax_jurisdiction: string | null;
          tax_enforcement_enabled: boolean;
          tax_enforcement_enabled_at: string | null;
          tax_enforcement_enabled_by: string | null;
          tax_enforcement_disabled_at: string | null;
          tax_enforcement_disabled_by: string | null;
          tax_enforcement_disabled_reason: string | null;
          output_tax_account_id: string | null;
          input_tax_account_id: string | null;
          fx_gain_account_id: string | null;
          fx_loss_account_id: string | null;
          asset_disposal_gain_account_id: string | null;
          asset_disposal_loss_account_id: string | null;
          brand_color: string | null;
          logo_url: string | null;
          commercial_registry: string | null;
          tagline: string | null;
          /**
           * Marks the public demo tenant. Added by migration
           * 20260825084639_organizations_is_demo and used by the demo write
           * policies and the lease-rent sweep. Not in Insert: it is set
           * deliberately by an operator, never as part of creating a tenant.
           */
          is_demo: boolean;
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
          brand_color?: string | null;
          logo_url?: string | null;
          commercial_registry?: string | null;
          tagline?: string | null;
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
          property_type: string;
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
          property_type?: string;
        };
        Update: Partial<Database["public"]["Tables"]["resorts"]["Row"]>;
        Relationships: [];
      };
      properties: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          code: string;
          timezone: string;
          property_type: string;
          address: string | null;
          governorate: string | null;
          phone: string | null;
          email: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          code: string;
          timezone?: string;
          property_type?: string;
          address?: string | null;
          governorate?: string | null;
          phone?: string | null;
          email?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["properties"]["Row"]>;
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
          property_id: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          role_id: string;
          organization_id?: string | null;
          property_id?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["user_role_assignments"]["Row"]>;
        Relationships: [];
      };
      permissions: {
        Row: { id: string; key: string; description: string | null };
        Insert: { id?: string; key: string; description?: string | null };
        Update: Partial<Database["public"]["Tables"]["permissions"]["Row"]>;
        Relationships: [];
      };
      organization_finance_settings: {
        Row: {
          id: string;
          organization_id: string;
          property_id: string;
          online_payments_clearing_account_id: string | null;
          security_deposit_liability_account_id: string | null;
          commission_expense_account_id: string | null;
          commission_payable_account_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          property_id: string;
          online_payments_clearing_account_id?: string | null;
          security_deposit_liability_account_id?: string | null;
          commission_expense_account_id?: string | null;
          commission_payable_account_id?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["organization_finance_settings"]["Row"]
        >;
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
          property_id: string | null;
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
          property_id?: string | null;
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
          property_id: string | null;
          code: string;
          name_ar: string;
          name_en: string;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          property_id?: string | null;
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
          property_id: string | null;
          code: string;
          name_ar: string;
          name_en: string;
          is_active: boolean;
          // Added by the WIP costing work; the table pre-dated it.
          wip_account_id: string | null;
          cost_of_sales_account_id: string | null;
          status: "PLANNING" | "ACTIVE" | "COMPLETED" | "CANCELLED";
          start_date: string | null;
          expected_completion_date: string | null;
          budget_amount: number | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          property_id?: string | null;
          code: string;
          name_ar: string;
          name_en: string;
          is_active?: boolean;
          wip_account_id?: string | null;
          cost_of_sales_account_id?: string | null;
          status?: string;
          start_date?: string | null;
          expected_completion_date?: string | null;
          budget_amount?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["projects"]["Row"]>;
        Relationships: [];
      };
      chart_of_accounts: {
        Row: {
          id: string;
          organization_id: string;
          property_id: string | null;
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
          is_cash_equivalent: boolean;
          cash_flow_section: "OPERATING" | "INVESTING" | "FINANCING" | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          property_id?: string | null;
          code: string;
          name_ar: string;
          name_en: string;
          parent_id?: string | null;
          category: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
          normal_balance: "DEBIT" | "CREDIT";
          is_group?: boolean;
          requires_cost_center?: boolean;
          is_active?: boolean;
          is_cash_equivalent?: boolean;
          cash_flow_section?: "OPERATING" | "INVESTING" | "FINANCING" | null;
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
          property_id: string | null;
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
        Row: { id: string; organization_id: string; property_id: string; name_ar: string; name_en: string };
        Insert: { id?: string; organization_id: string; property_id: string; name_ar: string; name_en: string };
        Update: Partial<Database["public"]["Tables"]["zones"]["Row"]>;
        Relationships: [];
      };
      buildings: {
        Row: {
          id: string;
          organization_id: string;
          property_id: string;
          zone_id: string | null;
          code: string;
          name_ar: string;
          name_en: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          property_id: string;
          zone_id?: string | null;
          code: string;
          name_ar: string;
          name_en: string;
        };
        Update: Partial<Database["public"]["Tables"]["buildings"]["Row"]>;
        Relationships: [];
      };
      service_charge_levies: {
        Row: {
          id: string;
          organization_id: string;
          property_id: string;
          name: string;
          period_start: string;
          period_end: string;
          total_amount: number;
          allocation_basis: "AREA" | "EQUAL" | "CUSTOM";
          due_type_id: string;
          receivable_account_id: string;
          issue_date: string;
          due_date: string;
          status: "DRAFT" | "ISSUED" | "CANCELLED";
          issued_at: string | null;
          issued_by: string | null;
          note: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          property_id: string;
          name: string;
          period_start: string;
          period_end: string;
          total_amount: number;
          allocation_basis: "AREA" | "EQUAL" | "CUSTOM";
          due_type_id: string;
          receivable_account_id: string;
          issue_date: string;
          due_date: string;
          status?: "DRAFT" | "ISSUED" | "CANCELLED";
          note?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["service_charge_levies"]["Row"]>;
        Relationships: [];
      };
      service_charge_allocations: {
        Row: {
          id: string;
          organization_id: string;
          levy_id: string;
          unit_id: string;
          basis_value: number;
          share_amount: number;
          due_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          levy_id: string;
          unit_id: string;
          basis_value: number;
          share_amount?: number;
        };
        Update: Partial<Database["public"]["Tables"]["service_charge_allocations"]["Row"]>;
        Relationships: [];
      };
      units: {
        Row: {
          id: string;
          organization_id: string;
          property_id: string;
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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          property_id: string;
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
          created_at?: string;
          updated_at?: string;
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
          customer_type: string;
          tax_registration_number: string | null;
          identity_document_type: string | null;
          identity_document_number: string | null;
          legal_name: string | null;
          country_code: string | null;
          billing_address: string | null;
          identity_verified_at: string | null;
          identity_verification_source: string | null;
          identity_verification_reference: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          archived_at: string | null;
          archived_by: string | null;
          archive_reason: string | null;
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
          property_id: string;
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
          property_id: string;
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
          property_id: string | null;
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
          property_id?: string | null;
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
      expense_account_input_tax: {
        Row: {
          id: string;
          organization_id: string;
          expense_account_id: string;
          recoverability: string;
          recoverable_ratio: number | null;
          ratio_method: string | null;
          ratio_period: string | null;
          ratio_reference: string | null;
          status: string;
          notes: string | null;
          approved_by: string | null;
          approved_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          expense_account_id: string;
          recoverability: string;
          recoverable_ratio?: number | null;
          ratio_method?: string | null;
          ratio_period?: string | null;
          ratio_reference?: string | null;
          status?: string;
          notes?: string | null;
        };
        Update: {
          recoverability?: string;
          recoverable_ratio?: number | null;
          status?: string;
          approved_by?: string | null;
          approved_at?: string | null;
        };
        Relationships: [];
      };
      input_tax_decisions: {
        Row: {
          id: string;
          organization_id: string;
          source_type: string;
          source_id: string;
          supplier_id: string | null;
          expense_account_id: string;
          invoice_number: string;
          invoice_date: string;
          supply_date: string | null;
          gross_amount: number;
          taxable_base: number;
          tax_amount: number;
          recoverability: string;
          recoverable_ratio: number | null;
          recoverable_amount: number;
          non_recoverable_amount: number;
          input_tax_account_id: string | null;
          decision_snapshot: unknown;
          reverses_decision_id: string | null;
          replaces_decision_id: string | null;
          reason: string | null;
          decided_by: string | null;
          decided_at: string;
        };
        Insert: {
          organization_id: string;
          source_type: string;
          source_id: string;
          expense_account_id: string;
          invoice_number: string;
          invoice_date: string;
          gross_amount: number;
          taxable_base: number;
          tax_amount: number;
          recoverability: string;
          recoverable_amount: number;
          non_recoverable_amount: number;
          decision_snapshot: unknown;
        };
        Update: {
          recoverable_amount?: number;
        };
        Relationships: [];
      };
      exchange_rates: {
        Row: {
          id: string;
          organization_id: string;
          foreign_currency: string;
          base_currency: string;
          rate_date: string;
          base_per_unit: number;
          source: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          foreign_currency: string;
          base_currency: string;
          rate_date: string;
          base_per_unit: number;
          source?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["exchange_rates"]["Row"]>;
        Relationships: [];
      };
      dunning_policies: {
        Row: {
          id: string;
          organization_id: string;
          stage: number;
          name_ar: string;
          name_en: string;
          days_overdue: number;
          minimum_amount: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          stage: number;
          name_ar: string;
          name_en: string;
          days_overdue: number;
          minimum_amount?: number;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["dunning_policies"]["Row"]>;
        Relationships: [];
      };
      dunning_notices: {
        Row: {
          id: string;
          organization_id: string;
          due_id: string;
          member_id: string | null;
          stage: number;
          raised_on: string;
          days_overdue: number;
          outstanding_amount: number;
          status: "RAISED" | "DELIVERED" | "CANCELLED";
          delivered_at: string | null;
          delivery_channel: string | null;
          delivery_reference: string | null;
          raised_by: string | null;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          due_id: string;
          member_id?: string | null;
          stage: number;
          raised_on: string;
          days_overdue: number;
          outstanding_amount: number;
        };
        Update: Partial<Database["public"]["Tables"]["dunning_notices"]["Row"]>;
        Relationships: [];
      };
      fixed_assets: {
        Row: {
          id: string;
          organization_id: string;
          property_id: string | null;
          code: string;
          name_ar: string;
          name_en: string;
          asset_account_id: string;
          accumulated_depreciation_account_id: string;
          depreciation_expense_account_id: string;
          acquisition_date: string;
          acquisition_cost: number;
          salvage_value: number;
          useful_life_months: number;
          method: string;
          status: "ACTIVE" | "FULLY_DEPRECIATED" | "DISPOSED";
          disposal_date: string | null;
          disposal_proceeds: number | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          property_id?: string | null;
          code: string;
          name_ar: string;
          name_en: string;
          asset_account_id: string;
          accumulated_depreciation_account_id: string;
          depreciation_expense_account_id: string;
          acquisition_date: string;
          acquisition_cost: number;
          salvage_value?: number;
          useful_life_months: number;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["fixed_assets"]["Row"]>;
        Relationships: [];
      };
      fixed_asset_depreciation: {
        Row: {
          id: string;
          organization_id: string;
          fixed_asset_id: string;
          fiscal_period_id: string;
          entry_date: string;
          amount: number;
          journal_entry_id: string | null;
          posted_by: string | null;
          posted_at: string;
        };
        Insert: {
          organization_id: string;
          fixed_asset_id: string;
          fiscal_period_id: string;
          entry_date: string;
          amount: number;
        };
        Update: Partial<Database["public"]["Tables"]["fixed_asset_depreciation"]["Row"]>;
        Relationships: [];
      };
      credit_notes: {
        Row: {
          id: string;
          organization_id: string;
          document_type: string;
          document_number: string;
          source_type: string;
          source_id: string;
          tax_decision_id: string;
          credit_date: string;
          gross_amount: number;
          taxable_base: number;
          vat_amount: number;
          reason: string;
          journal_entry_id: string | null;
          decision_snapshot: unknown;
          issued_by: string | null;
          issued_at: string;
        };
        Insert: {
          organization_id: string;
          document_number: string;
          source_id: string;
          tax_decision_id: string;
          credit_date: string;
          gross_amount: number;
          taxable_base: number;
          vat_amount: number;
          reason: string;
          decision_snapshot: unknown;
        };
        Update: { gross_amount?: number };
        Relationships: [];
      };
      catalogue_items: {
        Row: {
          id: string;
          organization_id: string;
          code: string;
          name_ar: string;
          name_en: string;
          unit_code: string;
          item_code_type: string | null;
          item_code: string | null;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          code: string;
          name_ar: string;
          name_en: string;
          unit_code?: string;
          item_code_type?: string | null;
          item_code?: string | null;
          is_active?: boolean;
        };
        Update: {
          name_ar?: string;
          item_code?: string | null;
          item_code_type?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
      document_numbers: {
        Row: {
          id: string;
          organization_id: string;
          document_type: string;
          source_type: string;
          source_id: string;
          year: number;
          sequence_number: number;
          document_number: string;
          issued_at: string;
        };
        Insert: {
          organization_id: string;
          document_type: string;
          source_type: string;
          source_id: string;
          year: number;
          sequence_number: number;
          document_number: string;
        };
        Update: { document_number?: string };
        Relationships: [];
      };
      document_number_counters: {
        Row: {
          organization_id: string;
          document_type: string;
          year: number;
          next_number: number;
        };
        Insert: {
          organization_id: string;
          document_type: string;
          year: number;
          next_number?: number;
        };
        Update: { next_number?: number };
        Relationships: [];
      };
      revenue_natures: {
        Row: {
          code: string;
          name_ar: string;
          name_en: string;
          is_derived: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          code: string;
          name_ar: string;
          name_en: string;
          is_derived?: boolean;
          sort_order: number;
        };
        Update: {
          name_ar?: string;
          name_en?: string;
          is_derived?: boolean;
          sort_order?: number;
        };
        Relationships: [];
      };
      tax_rule_versions: {
        Row: {
          id: string;
          jurisdiction: string;
          revenue_nature: string;
          tax_treatment: string;
          vat_rate: number | null;
          effective_from: string;
          effective_to: string | null;
          e_document_type: string;
          issuer_scope: string;
          version: number;
          rule_hash: string;
          status: string;
          legal_reference: string | null;
          approved_by: string | null;
          approved_at: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          jurisdiction: string;
          revenue_nature: string;
          tax_treatment: string;
          vat_rate?: number | null;
          effective_from: string;
          effective_to?: string | null;
          e_document_type: string;
          issuer_scope: string;
          version: number;
          rule_hash?: string;
          status?: string;
          legal_reference?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          created_by?: string | null;
        };
        Update: {
          effective_to?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      due_type_revenue_natures: {
        Row: {
          id: string;
          organization_id: string;
          due_type_id: string;
          revenue_nature: string;
          status: string;
          notes: string | null;
          amount_basis: string | null;
          approved_by: string | null;
          approved_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          due_type_id: string;
          revenue_nature: string;
          status?: string;
          notes?: string | null;
        };
        Update: {
          revenue_nature?: string;
          status?: string;
          notes?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
        };
        Relationships: [];
      };
      tax_decisions: {
        Row: {
          id: string;
          organization_id: string;
          source_type: string;
          source_id: string;
          revenue_nature: string;
          jurisdiction: string;
          transaction_date: string;
          tax_rule_version_id: string;
          tax_rule_hash: string;
          tax_decision_snapshot: unknown;
          decided_by: string | null;
          decided_at: string;
          reverses_decision_id: string | null;
          replaces_decision_id: string | null;
          reason: string | null;
          amount_basis: string | null;
          taxable_base: number | null;
          vat_amount: number | null;
          gross_amount: number | null;
          output_tax_account_id: string | null;
          buyer_member_id: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          source_type: string;
          source_id: string;
          revenue_nature: string;
          jurisdiction: string;
          transaction_date: string;
          tax_rule_version_id: string;
          tax_rule_hash: string;
          tax_decision_snapshot: unknown;
          decided_by?: string | null;
        };
        Update: {
          tax_rule_hash?: string;
        };
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
          catalogue_item_id: string | null;
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
          property_id: string;
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
          property_id: string;
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
          property_id: string | null;
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
          property_id: string;
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
          source_type: "LEASE_RENT" | "INSTALLMENT_PLAN" | "OPENING_BALANCE" | null;
          source_id: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      einvoice_profiles: {
        Row: {
          id: string;
          organization_id: string;
          property_id: string | null;
          jurisdiction: "EG_ETA" | "SA_ZATCA" | "AE_PEPPOL";
          environment: "SANDBOX" | "PRODUCTION";
          taxpayer_id: string | null;
          branch_code: string | null;
          activity_code: string | null;
          /**
           * Vault references, never the secrets themselves. Deliberately never
           * selected by any page — see the settings screen's query.
           */
          client_id_secret_id: string | null;
          client_secret_secret_id: string | null;
          signing_certificate_secret_id: string | null;
          signing_key_secret_id: string | null;
          status: "DRAFT" | "ACTIVE" | "SUSPENDED";
          enabled: boolean;
          verified_at: string | null;
          last_verification_error: string | null;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          property_id?: string | null;
          jurisdiction: "EG_ETA" | "SA_ZATCA" | "AE_PEPPOL";
          environment?: "SANDBOX" | "PRODUCTION";
          taxpayer_id?: string | null;
          branch_code?: string | null;
          activity_code?: string | null;
          status?: "DRAFT" | "ACTIVE" | "SUSPENDED";
          enabled?: boolean;
          verified_at?: string | null;
          last_verification_error?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["einvoice_profiles"]["Row"]>;
        Relationships: [];
      };
      einvoice_documents: {
        Row: {
          id: string;
          organization_id: string;
          profile_id: string;
          source_type: "SUPPLIER_INVOICE" | "PAYMENT_RECEIPT" | "DUE" | "CREDIT_NOTE" | "DEBIT_NOTE";
          source_id: string;
          document_type: "INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE" | "RECEIPT";
          status: "DRAFT" | "SIGNED" | "SUBMITTED" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "FAILED";
          authority_status: string | null;
          authority_uuid: string | null;
          authority_long_id: string | null;
          qr_payload: string | null;
          idempotency_key: string;
          attempt_count: number;
          last_error_code: string | null;
          last_error_detail: string | null;
          submitted_at: string | null;
          settled_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          profile_id: string;
          source_type: "SUPPLIER_INVOICE" | "PAYMENT_RECEIPT" | "DUE" | "CREDIT_NOTE" | "DEBIT_NOTE";
          source_id: string;
          document_type?: "INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE" | "RECEIPT";
          status?: "DRAFT" | "SIGNED" | "SUBMITTED" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "FAILED";
          idempotency_key: string;
        };
        Update: Partial<Database["public"]["Tables"]["einvoice_documents"]["Row"]>;
        Relationships: [];
      };
      einvoice_submission_attempts: {
        Row: {
          id: string;
          organization_id: string;
          document_id: string;
          attempt_number: number;
          operation: "SUBMIT" | "POLL" | "CANCEL";
          http_status: number | null;
          authority_status: string | null;
          resulting_status: string | null;
          request_summary: Record<string, unknown> | null;
          response_summary: Record<string, unknown> | null;
          occurred_at: string;
        };
        /** Written only through record_einvoice_attempt(). */
        Insert: never;
        Update: never;
        Relationships: [];
      };
      brokers: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          broker_type: "INTERNAL" | "EXTERNAL";
          tax_id: string | null;
          phone: string | null;
          email: string | null;
          default_wht_rate: number;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          broker_type?: "INTERNAL" | "EXTERNAL";
          tax_id?: string | null;
          phone?: string | null;
          email?: string | null;
          default_wht_rate?: number;
          is_active?: boolean;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["brokers"]["Row"]>;
        Relationships: [];
      };
      commissions: {
        Row: {
          id: string;
          organization_id: string;
          property_id: string;
          broker_id: string;
          unit_id: string | null;
          source_type: "LEASE" | "INSTALLMENT_PLAN" | "MANUAL";
          lease_id: string | null;
          installment_plan_id: string | null;
          basis_amount: number;
          rate_percent: number | null;
          gross_amount: number;
          wht_rate: number;
          wht_amount: number;
          net_amount: number;
          earned_date: string;
          status: "ACCRUED" | "PAID" | "CANCELLED";
          accrual_journal_entry_id: string | null;
          payment_journal_entry_id: string | null;
          paid_date: string | null;
          note: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        /** Written only through accrue_commission()/pay_commission(). */
        Insert: never;
        Update: never;
        Relationships: [];
      };
      unit_handovers: {
        Row: {
          id: string;
          organization_id: string;
          property_id: string;
          unit_id: string;
          handed_to_member_id: string | null;
          status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
          scheduled_date: string | null;
          completed_date: string | null;
          electricity_reading: number | null;
          water_reading: number | null;
          gas_reading: number | null;
          note: string | null;
          completed_by: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        /** Written only through schedule_unit_handover()/complete_unit_handover(). */
        Insert: never;
        Update: never;
        Relationships: [];
      };
      unit_handover_snags: {
        Row: {
          id: string;
          organization_id: string;
          handover_id: string;
          description: string;
          severity: "BLOCKING" | "MINOR";
          status: "OPEN" | "RESOLVED";
          resolved_at: string | null;
          resolved_by: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          handover_id: string;
          description: string;
          severity?: "BLOCKING" | "MINOR";
          status?: "OPEN" | "RESOLVED";
        };
        Update: Partial<Database["public"]["Tables"]["unit_handover_snags"]["Row"]>;
        Relationships: [];
      };
      unit_lease_deposit_events: {
        Row: {
          id: string;
          lease_id: string;
          event_type: "RECEIVED" | "REFUNDED" | "DEDUCTED";
          amount: number;
          reason: string | null;
          event_date: string;
          journal_entry_id: string | null;
          settlement_account_id: string | null;
          created_by: string | null;
          created_at: string;
        };
        /** Written only through record_lease_deposit_event(); no client write policy exists. */
        Insert: never;
        Update: never;
        Relationships: [];
      };
      unit_leases: {
        Row: {
          id: string;
          organization_id: string;
          property_id: string;
          unit_id: string;
          tenant_member_id: string;
          due_type_id: string;
          receivable_account_id: string;
          status: "DRAFT" | "ACTIVE" | "ENDED" | "CANCELLED";
          starts_on: string;
          ends_on: string | null;
          rent_amount: number;
          rent_frequency: "MONTHLY" | "QUARTERLY" | "YEARLY";
          security_deposit_amount: number;
          billing_recipient: "OWNER" | "TENANT";
          created_by: string | null;
          created_at: string;
          updated_at: string;
          ended_by: string | null;
          ended_at: string | null;
          end_reason: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      installment_plans: {
        Row: {
          id: string;
          organization_id: string;
          property_id: string;
          unit_id: string;
          buyer_member_id: string;
          due_type_id: string;
          receivable_account_id: string;
          status: "ACTIVE" | "COMPLETED" | "CANCELLED";
          total_price: number;
          down_payment: number;
          installment_count: number;
          installment_frequency: "MONTHLY" | "QUARTERLY" | "YEARLY";
          starts_on: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          cancelled_by: string | null;
          cancelled_at: string | null;
          cancel_reason: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      plan_installments: {
        Row: {
          id: string;
          plan_id: string;
          due_id: string;
          sequence_no: number;
          principal_amount: number;
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
          property_id: string;
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
          property_id: string;
          name: string;
          gl_account_id: string;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          property_id: string;
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
          property_id: string;
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
          property_id: string;
          bank_id: string;
          account_name: string;
          account_number: string;
          gl_account_id: string;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          property_id: string;
          bank_id: string;
          account_name: string;
          account_number: string;
          gl_account_id: string;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["bank_accounts"]["Row"]>;
        Relationships: [];
      };
      bank_statements: {
        Row: {
          id: string;
          organization_id: string;
          bank_account_id: string;
          period_start: string;
          period_end: string;
          opening_balance: number;
          closing_balance: number;
          status: "DRAFT" | "RECONCILED";
          reconciled_at: string | null;
          reconciled_by: string | null;
          note: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          bank_account_id: string;
          period_start: string;
          period_end: string;
          opening_balance: number;
          closing_balance: number;
          status?: "DRAFT" | "RECONCILED";
          note?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["bank_statements"]["Row"]>;
        Relationships: [];
      };
      bank_statement_lines: {
        Row: {
          id: string;
          organization_id: string;
          statement_id: string;
          line_date: string;
          description: string | null;
          reference: string | null;
          /** Signed from the account holder's view: positive = money in. */
          amount: number;
          matched_journal_entry_line_id: string | null;
          match_type: "AUTO" | "MANUAL" | null;
          matched_at: string | null;
          matched_by: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          statement_id: string;
          line_date: string;
          description?: string | null;
          reference?: string | null;
          amount: number;
          sort_order?: number;
        };
        Update: Partial<Database["public"]["Tables"]["bank_statement_lines"]["Row"]>;
        Relationships: [];
      };
      cheques: {
        Row: {
          id: string;
          organization_id: string;
          property_id: string;
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
          property_id: string;
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
          property_id: string;
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
          currency: string | null;
          exchange_rate: number | null;
          foreign_net_amount: number | null;
          foreign_discount_amount: number | null;
          foreign_amount: number | null;
          id: string;
          organization_id: string;
          property_id: string;
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
          property_id: string;
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
          property_id: string;
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
      member_invitations: {
        Row: {
          id: string;
          organization_id: string;
          member_id: string;
          email: string;
          token_hash: string;
          status: "pending" | "accepted" | "expired" | "revoked";
          expires_at: string;
          invited_by: string;
          accepted_at: string | null;
          accepted_user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          member_id: string;
          email: string;
          token_hash: string;
          status?: "pending" | "accepted" | "expired" | "revoked";
          expires_at: string;
          invited_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["member_invitations"]["Row"]>;
        Relationships: [];
      };
      alert_digest_runs: {
        Row: {
          id: string;
          organization_id: string;
          run_date: string;
          status: string;
          recipients_count: number;
          alerts_count: number;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          run_date: string;
          status: string;
          recipients_count?: number;
          alerts_count?: number;
          error_message?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["alert_digest_runs"]["Row"]>;
        Relationships: [];
      };
      alert_dismissals: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          alert_key: string;
          dismissed_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          alert_key: string;
          dismissed_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["alert_dismissals"]["Row"]>;
        Relationships: [];
      };
      alert_settings: {
        Row: {
          organization_id: string;
          cheque_lead_days: number;
          lease_lead_days: number;
          overdue_min_days: number;
          cheques_enabled: boolean;
          leases_enabled: boolean;
          overdue_enabled: boolean;
          unreachable_owners_enabled: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          organization_id: string;
          cheque_lead_days?: number;
          lease_lead_days?: number;
          overdue_min_days?: number;
          cheques_enabled?: boolean;
          leases_enabled?: boolean;
          overdue_enabled?: boolean;
          unreachable_owners_enabled?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["alert_settings"]["Row"]>;
        Relationships: [];
      };
      member_invitation_short_links: {
        Row: {
          slug: string;
          invitation_id: string;
          action_link: string;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          slug: string;
          invitation_id: string;
          action_link: string;
          expires_at: string;
        };
        Update: Partial<Database["public"]["Tables"]["member_invitation_short_links"]["Row"]>;
        Relationships: [];
      };
    };
    Views: {
      units_with_financials: {
        Row: {
          id: string;
          organization_id: string;
          property_id: string;
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
          user_id: string | null;
          archived_at: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      list_projects: {
        Args: { p_organization_id: string };
        Returns: {
          id: string; code: string; name_ar: string; name_en: string;
          status: string; accounts_set: boolean;
          budget_amount: number | null; capitalised: number; released: number;
          wip_balance: number; budget_variance: number | null;
        }[];
      };
      project_wip_summary: {
        Args: { p_project_id: string };
        Returns: { capitalised: number; released: number; wip_balance: number }[];
      };
      capitalise_project_cost: {
        Args: {
          p_project_id: string; p_amount: number; p_credit_account_id: string;
          p_entry_date: string; p_description: string;
        };
        Returns: string;
      };
      release_project_wip: {
        Args: {
          p_project_id: string; p_amount: number;
          p_entry_date: string; p_description?: string | null;
        };
        Returns: string;
      };
      list_dunning_candidates: {
        Args: { p_organization_id: string; p_as_of?: string };
        Returns: {
          due_id: string; description: string; due_date: string;
          days_overdue: number; outstanding: number;
          member_id: string | null; member_name: string | null;
          member_email: string | null; member_phone: string | null;
          stage: number; stage_name_ar: string; stage_name_en: string;
          already_raised: boolean;
        }[];
      };
      list_dunning_notices: {
        Args: { p_organization_id: string };
        Returns: {
          id: string; due_id: string; stage: number;
          stage_name_ar: string | null; stage_name_en: string | null;
          raised_on: string; days_overdue: number; outstanding_amount: number;
          status: string; delivered_at: string | null; delivery_channel: string | null;
          member_name: string | null; member_email: string | null; member_phone: string | null;
          due_description: string; due_date: string; unit_code: string | null;
        }[];
      };
      raise_dunning_notices: {
        Args: { p_organization_id: string; p_stage: number; p_as_of?: string };
        Returns: number;
      };
      record_dunning_delivery: {
        Args: {
          p_notice_id: string; p_channel: string;
          p_reference?: string | null; p_delivered_at?: string;
        };
        Returns: undefined;
      };
      due_outstanding: {
        Args: { p_due_id: string };
        Returns: number;
      };
      post_supplier_invoice_in_currency: {
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
          p_currency: string | null;
          p_exchange_rate?: number | null;
        };
        Returns: string;
      };
      settle_supplier_invoice_fx_difference: {
        Args: {
          p_invoice_id: string;
          p_settlement_date: string;
          p_settlement_rate: number;
        };
        Returns: string;
      };
      set_fx_difference_accounts: {
        Args: {
          p_organization_id: string;
          p_gain_account_id: string | null;
          p_loss_account_id: string | null;
        };
        Returns: undefined;
      };
      check_fx_readiness: {
        Args: { p_organization_id: string };
        Returns: {
          ready: boolean;
          gain_account_id: string | null;
          loss_account_id: string | null;
          reason: string | null;
        }[];
      };
      set_asset_disposal_accounts: {
        Args: {
          p_organization_id: string;
          p_gain_account_id: string | null;
          p_loss_account_id: string | null;
        };
        Returns: undefined;
      };
      check_asset_disposal_readiness: {
        Args: { p_organization_id: string };
        Returns: {
          ready: boolean;
          gain_account_id: string | null;
          loss_account_id: string | null;
          reason: string | null;
        }[];
      };
      dispose_fixed_asset: {
        Args: {
          p_asset_id: string;
          p_disposal_date: string;
          p_proceeds: number;
          p_proceeds_account_id: string;
          p_reason?: string | null;
        };
        Returns: string;
      };
      list_exchange_rates: {
        Args: { p_organization_id: string };
        Returns: {
          id: string;
          foreign_currency: string;
          base_currency: string;
          rate_date: string;
          base_per_unit: number;
          source: string | null;
          is_latest: boolean;
        }[];
      };
      convert_to_base: {
        Args: {
          p_organization_id: string;
          p_amount: number;
          p_currency: string;
          p_date: string;
        };
        Returns: number;
      };
      list_fixed_assets: {
        Args: { p_organization_id: string };
        Returns: {
          id: string;
          code: string;
          name_ar: string;
          name_en: string;
          status: string;
          acquisition_date: string;
          acquisition_cost: number;
          salvage_value: number;
          useful_life_months: number;
          accumulated: number;
          net_book_value: number;
          remaining: number;
          periods_posted: number;
        }[];
      };
      post_depreciation_for_period: {
        Args: { p_organization_id: string; p_fiscal_period_id: string };
        Returns: number;
      };
      depreciable_remaining: {
        Args: { p_asset_id: string };
        Returns: number;
      };
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
      // authenticated, self-permission-checked (unlike get_payment_provider_credentials
      // above) -- see supabase/migrations/20260830000001_payment_provider_settings_verification_credentials.sql
      // and .../20260830000002_record_payment_provider_verification_stale_check.sql (adds updated_at).
      get_payment_provider_settings_credentials: {
        Args: { p_settings_id: string };
        Returns: { api_key: string | null; hmac_secret: string | null; updated_at: string }[];
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
        Args: {
          p_settings_id: string;
          p_success: boolean;
          p_error_message?: string | null;
          p_expected_updated_at?: string | null;
        };
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
          property_id: string | null;
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
          invite_email: string;
          member_email: string | null;
          member_phone: string | null;
          is_synthetic_email: boolean;
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
      create_unit_lease: {
        Args: {
          p_organization_id: string;
          p_unit_id: string;
          p_tenant_member_id: string;
          p_due_type_id: string;
          p_receivable_account_id: string;
          p_rent_amount: number;
          p_rent_frequency: string;
          p_starts_on: string;
          p_ends_on?: string | null;
          p_security_deposit_amount?: number;
          p_billing_recipient?: string;
        };
        Returns: string;
      };
      activate_unit_lease: {
        Args: { p_lease_id: string };
        Returns: undefined;
      };
      end_unit_lease: {
        Args: { p_lease_id: string; p_ends_on: string; p_end_reason: string };
        Returns: undefined;
      };
      cancel_unit_lease: {
        Args: { p_lease_id: string; p_cancel_reason?: string | null };
        Returns: undefined;
      };
      set_unit_lease_billing_recipient: {
        Args: { p_lease_id: string; p_billing_recipient: string };
        Returns: undefined;
      };
      run_lease_rent_generation: {
        Args: Record<string, never>;
        Returns: { generated: number; idempotent: number; blocked: number; skipped: number; errored: number };
      };
      check_and_record_rate_limit: {
        Args: {
          p_action: string;
          p_client_key: string;
          p_limit: number;
          p_window_seconds: number;
        };
        Returns: boolean;
      };
      create_installment_plan: {
        Args: {
          p_organization_id: string;
          p_unit_id: string;
          p_buyer_member_id: string;
          p_due_type_id: string;
          p_receivable_account_id: string;
          p_total_price: number;
          p_down_payment: number;
          p_installment_count: number;
          p_installment_frequency: string;
          p_starts_on: string;
        };
        Returns: string;
      };
      cancel_installment_plan: {
        Args: { p_plan_id: string; p_cancel_reason: string };
        Returns: undefined;
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
      issue_dues: {
        Args: {
          p_organization_id: string;
          p_resort_id: string;
          p_unit_ids: string[];
          p_due_type_id: string;
          p_receivable_account_id: string;
          p_amount: number;
          p_amount_by_unit_type?: Record<string, unknown> | null;
          p_issue_date?: string;
          p_due_date?: string;
          p_description?: string | null;
          p_ip_address?: string | null;
          p_user_agent?: string | null;
        };
        Returns: Record<string, unknown>;
      };
      get_cash_position: {
        Args: { p_organization_id: string; p_as_of_date: string };
        Returns: number;
      };
      /**
       * Finds or creates the organization's «رصيد افتتاحي» due type and its
       * EQUITY offset account. Idempotent. Returns the due type id.
       */
      ensure_opening_balance_due_type: {
        Args: { p_organization_id: string };
        Returns: string;
      };
      /**
       * Records a client's carried-in debt as an OPENING_BALANCE due on one of
       * their units (Dr receivable / Cr opening-balance equity). One per client
       * per unit. Returns the due id.
       */
      record_member_opening_balance: {
        Args: {
          p_organization_id: string;
          p_member_id: string;
          p_unit_id: string;
          p_amount: number;
          p_as_of_date: string;
          p_receivable_account_id?: string | null;
          p_description?: string | null;
        };
        Returns: string;
      };
      recognize_pending_dues: {
        Args: { p_organization_id: string; p_fiscal_period_id: string };
        Returns: number;
      };
      accrue_commission: {
        Args: {
          p_organization_id: string;
          p_broker_id: string;
          p_property_id: string;
          p_source_type: "LEASE" | "INSTALLMENT_PLAN" | "MANUAL";
          p_basis_amount: number;
          p_rate_percent?: number | null;
          p_gross_amount?: number | null;
          p_wht_rate?: number | null;
          p_wht_account_id?: string | null;
          p_unit_id?: string | null;
          p_lease_id?: string | null;
          p_installment_plan_id?: string | null;
          p_earned_date?: string;
          p_note?: string | null;
        };
        Returns: string;
      };
      pay_commission: {
        Args: { p_commission_id: string; p_cash_account_id: string; p_paid_date?: string };
        Returns: string;
      };
      upsert_einvoice_profile: {
        Args: {
          p_organization_id: string;
          p_jurisdiction: "EG_ETA" | "SA_ZATCA" | "AE_PEPPOL";
          p_environment: "SANDBOX" | "PRODUCTION";
          p_taxpayer_id?: string | null;
          p_branch_code?: string | null;
          p_activity_code?: string | null;
          p_property_id?: string | null;
        };
        Returns: string;
      };
      set_einvoice_profile_enabled: {
        Args: { p_profile_id: string; p_enabled: boolean };
        Returns: undefined;
      };
      claim_einvoice_document: {
        Args: {
          p_profile_id: string;
          p_source_type: string;
          p_source_id: string;
          p_document_type?: string;
        };
        Returns: string;
      };
      record_einvoice_attempt: {
        Args: {
          p_document_id: string;
          p_operation: "SUBMIT" | "POLL" | "CANCEL";
          p_resulting_status: string;
          p_http_status?: number | null;
          p_authority_status?: string | null;
          p_authority_uuid?: string | null;
          p_authority_long_id?: string | null;
          p_qr_payload?: string | null;
          p_error_code?: string | null;
          p_error_detail?: string | null;
          p_request_summary?: Record<string, unknown> | null;
          p_response_summary?: Record<string, unknown> | null;
        };
        Returns: undefined;
      };
      set_einvoice_profile_verification: {
        Args: { p_profile_id: string; p_success: boolean; p_error?: string | null };
        Returns: undefined;
      };
      schedule_unit_handover: {
        Args: {
          p_unit_id: string;
          p_scheduled_date: string;
          p_handed_to_member_id?: string | null;
          p_note?: string | null;
        };
        Returns: string;
      };
      complete_unit_handover: {
        Args: {
          p_handover_id: string;
          p_completed_date?: string;
          p_electricity_reading?: number | null;
          p_water_reading?: number | null;
          p_gas_reading?: number | null;
        };
        Returns: undefined;
      };
      record_lease_deposit_event: {
        Args: {
          p_lease_id: string;
          p_event_type: "RECEIVED" | "REFUNDED" | "DEDUCTED";
          p_amount: number;
          p_settlement_account_id: string;
          p_reason?: string | null;
          p_event_date?: string;
        };
        Returns: string;
      };
      get_lease_deposit_summary: {
        Args: { p_lease_id: string };
        Returns: {
          received_total: number;
          refunded_total: number;
          deducted_total: number;
          held_total: number;
          agreed_amount: number;
          event_count: number;
        }[];
      };
      compute_service_charge_allocations: {
        Args: { p_levy_id: string };
        Returns: { unit_count: number; allocated_total: number; levy_total: number }[];
      };
      issue_service_charge_levy: {
        Args: { p_levy_id: string };
        Returns: number;
      };
      get_service_charge_allocations: {
        Args: { p_levy_id: string };
        Returns: {
          allocation_id: string;
          unit_id: string;
          unit_code: string;
          unit_type: string;
          basis_value: number;
          share_amount: number;
          share_percent: number;
          due_id: string | null;
        }[];
      };
      get_unrecognized_dues_summary: {
        Args: { p_organization_id: string };
        Returns: {
          pending_count: number;
          pending_total: number;
          earliest_issue_date: string | null;
          latest_issue_date: string | null;
        }[];
      };
      auto_match_bank_statement: {
        Args: { p_statement_id: string; p_date_tolerance_days?: number };
        Returns: { matched_count: number; ambiguous_count: number; unmatched_count: number }[];
      };
      get_bank_reconciliation_summary: {
        Args: { p_statement_id: string };
        Returns: {
          book_balance: number;
          closing_balance: number;
          opening_balance: number;
          unmatched_gl_total: number;
          unmatched_statement_total: number;
          unmatched_gl_count: number;
          unmatched_statement_count: number;
          difference: number;
        }[];
      };
      get_bank_match_candidates: {
        Args: { p_statement_line_id: string; p_date_tolerance_days?: number };
        Returns: {
          journal_entry_line_id: string;
          entry_id: string;
          entry_number: number | null;
          entry_date: string;
          description: string | null;
          signed_amount: number;
          date_distance: number;
        }[];
      };
      finalize_bank_reconciliation: {
        Args: { p_statement_id: string };
        Returns: undefined;
      };
      reopen_bank_reconciliation: {
        Args: { p_statement_id: string };
        Returns: undefined;
      };
      get_cash_flow_statement: {
        Args: { p_organization_id: string; p_start_date: string; p_end_date: string };
        Returns: {
          section: "OPERATING" | "INVESTING" | "FINANCING";
          account_id: string;
          code: string;
          name_ar: string;
          name_en: string;
          category: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
          is_classified: boolean;
          net_amount: number;
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
      set_due_type_revenue_nature: {
        Args: {
          p_due_type_id: string;
          p_revenue_nature: string;
          p_notes?: string | null;
          p_amount_basis?: string | null;
        };
        Returns: string;
      };
      approve_due_type_revenue_nature: {
        Args: { p_mapping_id: string };
        Returns: undefined;
      };
      revoke_due_type_revenue_nature_approval: {
        Args: { p_mapping_id: string; p_reason?: string | null };
        Returns: undefined;
      };
      list_due_type_tax_mappings: {
        Args: { p_organization_id: string };
        Returns: {
          due_type_id: string;
          due_type_name_ar: string;
          due_type_name_en: string;
          mapping_id: string | null;
          revenue_nature: string | null;
          nature_name_ar: string | null;
          nature_name_en: string | null;
          status: string;
          notes: string | null;
          approved_at: string | null;
          updated_at: string | null;
        }[];
      };
      resolve_tax_rule: {
        Args: {
          p_jurisdiction: string;
          p_revenue_nature: string;
          p_transaction_date: string;
        };
        Returns: Database["public"]["Tables"]["tax_rule_versions"]["Row"];
      };
      record_tax_decision_for_due: {
        Args: { p_due_id: string };
        Returns: string;
      };
      reverse_tax_decision: {
        Args: { p_decision_id: string; p_reason: string };
        Returns: string;
      };
      check_tax_enforcement_readiness: {
        Args: { p_organization_id: string };
        Returns: { gap_code: string; detail: string }[];
      };
      list_tax_enforcement_lapses: {
        Args: Record<PropertyKey, never>;
        Returns: {
          organization_id: string;
          organization_name: string;
          enabled_at: string | null;
          disabled_at: string | null;
          disabled_by: string | null;
          disabled_reason: string | null;
          dues_without_decision: number;
        }[];
      };
      issue_credit_note: {
        Args: {
          p_due_id: string;
          p_gross_amount: number;
          p_reason: string;
          p_credit_date?: string;
        };
        Returns: string;
      };
      creditable_remaining: {
        Args: { p_due_id: string };
        Returns: number;
      };
      get_einvoice_source_for_credit_note: {
        Args: { p_credit_note_id: string };
        Returns: unknown;
      };
      list_catalogue_items: {
        Args: { p_organization_id: string };
        Returns: {
          id: string;
          code: string;
          name_ar: string;
          name_en: string;
          unit_code: string;
          item_code_type: string | null;
          item_code: string | null;
          is_active: boolean;
          linked_due_types: number;
        }[];
      };
      list_due_type_catalogue_links: {
        Args: { p_organization_id: string };
        Returns: {
          due_type_id: string;
          due_type_name_ar: string;
          due_type_name_en: string;
          catalogue_item_id: string | null;
          item_name_ar: string | null;
          item_code: string | null;
          item_code_type: string | null;
          unit_code: string | null;
        }[];
      };
      upsert_catalogue_item: {
        Args: {
          p_organization_id: string;
          p_code: string;
          p_name_ar: string;
          p_name_en: string;
          p_unit_code?: string | null;
          p_item_code_type?: string | null;
          p_item_code?: string | null;
        };
        Returns: string;
      };
      set_due_type_catalogue_item: {
        Args: { p_due_type_id: string; p_catalogue_item_id: string | null };
        Returns: undefined;
      };
      check_einvoice_emission_readiness: {
        Args: { p_organization_id: string };
        Returns: { gap_code: string; detail: string }[];
      };
      get_einvoice_source_for_due: {
        Args: { p_due_id: string };
        Returns: unknown;
      };
      allocate_document_number: {
        Args: {
          p_organization_id: string;
          p_document_type: string;
          p_source_type: string;
          p_source_id: string;
          p_issue_date: string;
        };
        Returns: string;
      };
      set_member_tax_identity: {
        Args: {
          p_member_id: string;
          p_customer_type: string;
          p_tax_registration_number?: string | null;
          p_identity_document_type?: string | null;
          p_identity_document_number?: string | null;
          p_legal_name?: string | null;
          p_country_code?: string | null;
          p_billing_address?: string | null;
        };
        Returns: undefined;
      };
      set_expense_account_input_tax: {
        Args: {
          p_expense_account_id: string;
          p_recoverability: string;
          p_recoverable_ratio?: number | null;
          p_ratio_method?: string | null;
          p_ratio_period?: string | null;
          p_ratio_reference?: string | null;
          p_notes?: string | null;
        };
        Returns: string;
      };
      approve_expense_account_input_tax: {
        Args: { p_id: string };
        Returns: undefined;
      };
      record_input_tax_decision: {
        Args: { p_invoice_id: string };
        Returns: string;
      };
      check_input_tax_readiness: {
        Args: { p_organization_id: string };
        Returns: { gap_code: string; detail: string }[];
      };
      set_input_tax_account: {
        Args: { p_organization_id: string; p_account_id: string | null };
        Returns: undefined;
      };
      set_output_tax_account: {
        Args: { p_organization_id: string; p_account_id: string | null };
        Returns: undefined;
      };
      set_tax_enforcement: {
        Args: {
          p_organization_id: string;
          p_enabled: boolean;
          p_reason?: string | null;
          p_acknowledged_undecided_dues?: number | null;
        };
        Returns: undefined;
      };
      get_tax_decision_coverage: {
        Args: { p_organization_id: string };
        Returns: {
          total_dues: number;
          dues_with_decision: number;
          dues_without_decision: number;
          earliest_undecided_issue_date: string | null;
          latest_undecided_issue_date: string | null;
          undecided_amount: number;
          enforcement_enabled: boolean;
          enforcement_enabled_at: string | null;
        }[];
      };
      create_tax_rule_draft: {
        Args: {
          p_jurisdiction: string;
          p_revenue_nature: string;
          p_tax_treatment: string;
          p_vat_rate: number | null;
          p_effective_from: string;
          p_e_document_type: string;
          p_issuer_scope: string;
          p_legal_reference?: string | null;
        };
        Returns: string;
      };
      approve_tax_rule: {
        Args: { p_rule_id: string };
        Returns: undefined;
      };
      supersede_tax_rule: {
        Args: {
          p_rule_id: string;
          p_effective_from: string;
          p_tax_treatment: string;
          p_vat_rate: number | null;
          p_e_document_type: string;
          p_issuer_scope: string;
          p_legal_reference?: string | null;
        };
        Returns: string;
      };
    };
  };
};
