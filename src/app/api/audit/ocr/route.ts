import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractBillWithGemini } from "@/lib/gemini";
import { runAuditEngine, toMatchedPackage } from "@/lib/auditEngine";
import type { MatchedCasePackage } from "@/types/audit";
import type { Json } from "@/lib/supabase/database.types";

export const maxDuration = 60; // Allow sufficient time for multimodal AI processing

interface StagedFileRecord {
  path: string;
  mime_type?: string;
  original_name?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { auditId, imageBase64, mimeType, isSeniorOrPwd } = body;

    let base64Payload = imageBase64;
    let finalMimeType = mimeType || "image/jpeg";
    const targetAuditId = auditId || `audit-${Date.now()}`;
    let existingRaw: Record<string, Json | undefined> = {};

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // 1. If auditId is provided but no imageBase64, retrieve file from Supabase storage
    if (auditId && !base64Payload) {
      const { data: auditRecord, error: auditFetchErr } = await supabase
        .from("audits")
        .select("*")
        .eq("id", auditId)
        .single();

      if (auditFetchErr || !auditRecord) {
        return NextResponse.json(
          { error: `Audit record not found: ${auditFetchErr?.message || "Invalid ID"}` },
          { status: 404 }
        );
      }

      // The scanner stages uploads as `files` (metadata) and `storage_paths`.
      const rawMeta = auditRecord.raw_extracted_data as {
        files?: StagedFileRecord[];
        storage_paths?: string[];
      } | null;

      const stagedFile = rawMeta?.files?.[0];
      const filePath = stagedFile?.path || rawMeta?.storage_paths?.[0];

      if (!filePath) {
        return NextResponse.json(
          { error: "No staged file path found in this audit record." },
          { status: 400 }
        );
      }

      existingRaw = (auditRecord.raw_extracted_data ?? {}) as Record<string, Json | undefined>;

      finalMimeType =
        stagedFile?.mime_type ||
        (filePath.endsWith(".png")
          ? "image/png"
          : filePath.endsWith(".pdf")
          ? "application/pdf"
          : "image/jpeg");

      // Download file from private `bill-uploads` bucket
      const { data: fileBlob, error: downloadErr } = await supabase.storage
        .from("bill-uploads")
        .download(filePath);

      if (downloadErr || !fileBlob) {
        return NextResponse.json(
          { error: `Failed to download file from storage: ${downloadErr?.message}` },
          { status: 500 }
        );
      }

      const arrayBuffer = await fileBlob.arrayBuffer();
      base64Payload = Buffer.from(arrayBuffer).toString("base64");
    }

    if (!base64Payload) {
      return NextResponse.json(
        { error: "Missing required bill image (either auditId with staged file or imageBase64)." },
        { status: 400 }
      );
    }

    // 2. Run Gemini Flash Vision OCR
    const extractedData = await extractBillWithGemini({
      base64Data: base64Payload,
      mimeType: finalMimeType,
    });

    // 3. Fetch reference PhilHealth packages from database for matching
    let referencePackages: MatchedCasePackage[] = [];
    try {
      const { data: dbPackages } = await supabase
        .from("philhealth_packages")
        .select("*");

      if (dbPackages && dbPackages.length > 0) {
        referencePackages = dbPackages.map(toMatchedPackage);
      }
    } catch {
      // Fallback in auditEngine handles empty referencePackages
    }

    // 4. Run Automated PhilHealth & Statutory Audit Engine
    const auditResult = runAuditEngine(extractedData, {
      auditId: targetAuditId,
      isSeniorOrPwdOverride: isSeniorOrPwd,
      referencePackages,
    });

    // 5. Persist results. Staged-file metadata is preserved (the Studio needs it
    //    to re-analyze) and the pristine OCR output is kept under `ocr`, so user
    //    overrides can always be reset to what the AI originally read.
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
            is_senior_or_pwd: Boolean(isSeniorOrPwd),
            ocr: extractedData as unknown as Json,
            overrides: {},
          },
          audit_results: auditResult as unknown as Json,
        })
        .eq("id", auditId);

      if (updateErr) {
        console.warn("Could not update audit record in database:", updateErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      auditId: targetAuditId,
      extracted: extractedData,
      audit: auditResult,
    });
  } catch (err: unknown) {
    console.error("OCR Audit API Route error:", err);
    const message = err instanceof Error ? err.message : "Internal OCR processing error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
