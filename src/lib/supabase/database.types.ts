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
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
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
        };
        Insert: {
          id?: string;
          procedure_keyword: string;
          case_code: string;
          hci_fee?: number;
          prof_fee?: number;
          total_case_rate?: number;
          inclusive_items?: string[];
        };
        Update: {
          id?: string;
          procedure_keyword?: string;
          case_code?: string;
          hci_fee?: number;
          prof_fee?: number;
          total_case_rate?: number;
          inclusive_items?: string[];
        };
        Relationships: [];
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
