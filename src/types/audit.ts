import type { CompressionResult } from "@/lib/imageCompression";

export interface ScannedPage {
  id: string;
  originalName: string;
  result: CompressionResult;
  storagePath?: string;
}

export type PipelineStage =
  | "idle"
  | "compressing"
  | "ready"
  | "uploading"
  | "staging_db"
  | "completed"
  | "error";

export interface StagedFileMeta {
  path: string;
  signed_url: string | null;
  original_name: string;
  mime_type: string;
  original_size: number;
  compressed_size: number;
  compression_ratio: number;
  width: number;
  height: number;
}

export interface AuditDoc {
  id: string;
  facility: string;
  total: number;
  fileSize: string;
  fileType: "PDF" | "DOCX" | "Scan";
  dateText: string;
  isLive?: boolean;
  tags: {
    label: string;
    variant: "rose" | "emerald" | "slate" | "blue" | "teal";
  }[];
}

