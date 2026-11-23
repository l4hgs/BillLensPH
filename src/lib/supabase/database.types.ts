export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          role: "member" | "staff" | "admin";
          contributor_type: "direct" | "indirect_nbb" | "lifetime" | "unknown";
          accommodation_type: "basic_ward" | "non_basic_private" | "unknown";
          has_mdr_or_pin: boolean;
          facility_level: "level_1" | "level_2" | "level_3" | "asc" | "unknown";
          facility_ownership: "government" | "private";
          no_ward_bed_available: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          role?: "member" | "staff" | "admin";
          contributor_type?: "direct" | "indirect_nbb" | "lifetime" | "unknown";
          accommodation_type?: "basic_ward" | "non_basic_private" | "unknown";
          has_mdr_or_pin?: boolean;
          facility_level?: "level_1" | "level_2" | "level_3" | "asc" | "unknown";
          facility_ownership?: "government" | "private";
          no_ward_bed_available?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          role?: "member" | "staff" | "admin";
          contributor_type?: "direct" | "indirect_nbb" | "lifetime" | "unknown";
          accommodation_type?: "basic_ward" | "non_basic_private" | "unknown";
          has_mdr_or_pin?: boolean;
          facility_level?: "level_1" | "level_2" | "level_3" | "asc" | "unknown";
          facility_ownership?: "government" | "private";
          no_ward_bed_available?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      audits: {
        Row: {
          id: string;
          user_id: string;
          hospital_name: string;
          total_billed: number;
          estimated_out_of_pocket: number;
          statutory_discount_type: "regular" | "senior" | "pwd";
          eligibility_snapshot?: Json | null;
          raw_extracted_data: Json | null;
          audit_results: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          hospital_name: string;
          total_billed?: number;
          estimated_out_of_pocket?: number;
          statutory_discount_type?: "regular" | "senior" | "pwd";
          eligibility_snapshot?: Json | null;
          raw_extracted_data?: Json | null;
          audit_results?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          hospital_name?: string;
          total_billed?: number;
          estimated_out_of_pocket?: number;
          statutory_discount_type?: "regular" | "senior" | "pwd";
          eligibility_snapshot?: Json | null;
          raw_extracted_data?: Json | null;
          audit_results?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      philhealth_packages: {
        Row: {
          id: string;
          procedure_keyword: string;
          case_code: string;
          hci_fee: number;
          prof_fee: number;
          total_case_rate: number;
          inclusive_items: string[];
          circular_id: string;
          circular_number: string | null;
          effective_from: string;
          effective_to: string | null;
          superseded_by: string | null;
          source_url: string | null;
          is_verified: boolean;
        };
        Insert: {
          id?: string;
          procedure_keyword: string;
          case_code: string;
          hci_fee?: number;
          prof_fee?: number;
          total_case_rate?: number;
          inclusive_items?: string[];
          circular_id?: string;
          circular_number?: string | null;
          effective_from?: string;
          effective_to?: string | null;
          superseded_by?: string | null;
          source_url?: string | null;
          is_verified?: boolean;
        };
        Update: {
          id?: string;
          procedure_keyword?: string;
          case_code?: string;
          hci_fee?: number;
          prof_fee?: number;
          total_case_rate?: number;
          inclusive_items?: string[];
          circular_id?: string;
          circular_number?: string | null;
          effective_from?: string;
          effective_to?: string | null;
          superseded_by?: string | null;
          source_url?: string | null;
          is_verified?: boolean;
        };
        Relationships: [];
      };
      statutory_rules: {
        Row: {
          id: string;
          rule_code: string;
          label: string;
          vat_divisor: number;
          discount_rate: number;
          incomplete_threshold: number;
          eligible_categories: string[];
          citation: string;
          circular_number: string | null;
          effective_from: string;
          effective_to: string | null;
          superseded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          rule_code: string;
          label: string;
          vat_divisor?: number;
          discount_rate?: number;
          incomplete_threshold?: number;
          eligible_categories?: string[];
          citation?: string;
          circular_number?: string | null;
          effective_from?: string;
          effective_to?: string | null;
          superseded_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          rule_code?: string;
          label?: string;
          vat_divisor?: number;
          discount_rate?: number;
          incomplete_threshold?: number;
          eligible_categories?: string[];
          citation?: string;
          circular_number?: string | null;
          effective_from?: string;
          effective_to?: string | null;
          superseded_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      package_item_aliases: {
        Row: {
          id: string;
          package_id: string;
          alias: string;
          kind: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          package_id: string;
          alias: string;
          kind?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          package_id?: string;
          alias?: string;
          kind?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "package_item_aliases_package_id_fkey";
            columns: ["package_id"];
            isOneToOne: false;
            referencedRelation: "philhealth_packages";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
