import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  extractMultiPageBillWithGemini,
  type GeminiVisionOptions,
} from "@/lib/gemini";
import { runAuditEngine } from "@/lib/auditEngine";
import { loadPackageCatalog } from "@/lib/packageCatalog";
import { ensureBillPackagesInCatalog } from "@/lib/caseRateDiscovery";
import type { Json } from "@/lib/supabase/database.types";

export const maxDuration = 60; // Allow sufficient time for multimodal AI processing

interface StagedFileRecord {
  path: string;
  mime_type?: string;
  original_name?: string;
}

interface InlinePagePayload {
  imageBase64: string;
  mimeType?: string;
}

function inferMimeType(filePath: string, explicitMime?: string): string {
  if (explicitMime) return explicitMime;
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".webp")) return "image/webp";
  if (filePath.endsWith(".pdf")) return "application/pdf";
  return "image/jpeg";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { auditId, imageBase64, mimeType, pages, isSeniorOrPwd } = body;

    const targetAuditId = auditId || `audit-${Date.now()}`;
    let existingRaw: Record<string, Json | undefined> = {};

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // 1. Load the PhilHealth package catalog from Supabase first.
    //    If the catalog is empty or unreachable, fail fast with a clear error
    //    instead of silently falling back to hardcoded rates.
    const catalog = await loadPackageCatalog(supabase);
    if (catalog.error || catalog.packages.length === 0) {
      return NextResponse.json(
        {
          error:
            catalog.error ||
            "The PhilHealth package catalog is empty. Please seed philhealth_packages before running OCR.",
        },
        { status: 503 }
      );
    }

    // 2. Collect all page payloads (inline `pages[]`, inline `imageBase64`, or all staged files in Supabase Storage)
    const pageInputs: GeminiVisionOptions[] = [];

    if (Array.isArray(pages) && pages.length > 0) {
      for (const p of pages as InlinePagePayload[]) {
        if (p && typeof p.imageBase64 === "string" && p.imageBase64.trim()) {
          pageInputs.push({
            base64Data: p.imageBase64,
            mimeType: p.mimeType || "image/jpeg",
          });
        }
      }
    } else if (typeof imageBase64 === "string" && imageBase64.trim()) {
      pageInputs.push({
        base64Data: imageBase64,
        mimeType: mimeType || "image/jpeg",
      });
    }

    if (auditId && pageInputs.length === 0) {
      const { data: auditRecord, error: auditFetchErr } = await supabase
        .from("audits")
        .select("*")
        .eq("id", auditId)
        .single();

      if (auditFetchErr || !auditRecord) {
        return NextResponse.json(
          {
            error: `Audit record not found: ${auditFetchErr?.message || "Invalid ID"}`,
          },
          { status: 404 }
        );
      }

      existingRaw = (auditRecord.raw_extracted_data ?? {}) as Record<
        string,
        Json | undefined
      >;

      const rawMeta = auditRecord.raw_extracted_data as {
        files?: StagedFileRecord[];
        storage_paths?: string[];
      } | null;

      const stagedFiles: StagedFileRecord[] =
        Array.isArray(rawMeta?.files) && rawMeta.files.length > 0
          ? rawMeta.files
          : Array.isArray(rawMeta?.storage_paths)
            ? rawMeta.storage_paths.map((p) => ({ path: p }))
            : [];

      if (stagedFiles.length === 0) {
        return NextResponse.json(
          { error: "No staged file paths found in this audit record." },
          { status: 400 }
        );
      }

      // Download EVERY staged page in order so multi-page SOAs never drop pages 2..N
      for (const staged of stagedFiles) {
        if (!staged.path) continue;
        const { data: fileBlob, error: downloadErr } = await supabase.storage
          .from("bill-uploads")
          .download(staged.path);

        if (downloadErr || !fileBlob) {
          return NextResponse.json(
            {
              error: `Failed to download staged file "${staged.path}" from storage: ${downloadErr?.message}`,
            },
            { status: 500 }
          );
        }

        const arrayBuffer = await fileBlob.arrayBuffer();
        pageInputs.push({
          base64Data: Buffer.from(arrayBuffer).toString("base64"),
          mimeType: inferMimeType(staged.path, staged.mime_type),
        });
      }
    } else if (auditId) {
      // Preserve existing raw_extracted_data metadata when auditId is passed alongside inline pages
      const { data: auditRecord } = await supabase
        .from("audits")
        .select("raw_extracted_data")
        .eq("id", auditId)
        .maybeSingle();
      if (auditRecord?.raw_extracted_data) {
        existingRaw = auditRecord.raw_extracted_data as Record<
          string,
          Json | undefined
        >;
      }
    }

    if (pageInputs.length === 0) {
      return NextResponse.json(
        {
          error:
            "Missing required bill image (provide auditId with staged files, pages[], or imageBase64).",
        },
        { status: 400 }
      );
    }

    // 3. Run Gemini Flash Vision OCR across all pages and merge
    const extractedData = await extractMultiPageBillWithGemini(pageInputs);

    // 3b. Auto-discover and cache missing PhilHealth Case Rate packages via Gemini
    //     when the bill's diagnosis or RVS/ICD-10 code is not yet in the DB catalog
    const { packages: effectivePackages } = await ensureBillPackagesInCatalog(
      supabase,
      extractedData,
      catalog.packages
    );

    // 4. Run Automated PhilHealth & Statutory Audit Engine
    const auditResult = runAuditEngine(extractedData, {
      auditId: targetAuditId,
      isSeniorOrPwdOverride: isSeniorOrPwd,
      referencePackages: effectivePackages,
      statutoryRule: catalog.statutoryRule,
    });

    // 5. Persist results
    if (auditId && user) {
      const { error: updateErr } = await supabase
        .from("audits")
        .update({
          hospital_name: auditResult.hospital_name,
          total_billed: auditResult.gross_total,
          estimated_out_of_pocket: auditResult.fair_out_of_pocket,
          raw_extracted_data: {
            ...existingRaw,
            status: "ocr_complete",
            page_count: pageInputs.length,
            is_senior_or_pwd: Boolean(isSeniorOrPwd),
            ocr: extractedData as unknown as Json,
            overrides: {},
          },
          audit_results: auditResult as unknown as Json,
        })
        .eq("id", auditId);

      if (updateErr) {
        console.warn(
          "Could not update audit record in database:",
          updateErr.message
        );
      }
    }

    return NextResponse.json({
      success: true,
      auditId: targetAuditId,
      pageCount: pageInputs.length,
      extracted: extractedData,
      audit: auditResult,
    });
  } catch (err: unknown) {
    console.error("OCR Audit API Route error:", err);
    const message =
      err instanceof Error ? err.message : "Internal OCR processing error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
