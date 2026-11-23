import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  loadPackageCatalog,
  selectActivePackagesForDate,
} from "@/lib/packageCatalog";
import {
  compilePhilHealthCircularWithGemini,
  computeCircularDiff,
} from "@/lib/circularCompiler";

export const maxDuration = 60;
const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr || profile?.role !== "admin") {
      return NextResponse.json(
        {
          error:
            "Forbidden: Only administrators (profiles.role = 'admin') can compile PhilHealth circulars.",
        },
        { status: 403 }
      );
    }

    const contentType = req.headers.get("content-type") || "";
    let rawText: string | undefined;
    let pdfBase64: string | undefined;
    let mimeType: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      const textField = formData.get("text");

      if (typeof textField === "string" && textField.trim()) {
        rawText = textField.trim();
      }

      if (file && file instanceof Blob) {
        if (file.size === 0) {
          return NextResponse.json(
            { error: "Uploaded file is empty." },
            { status: 400 }
          );
        }
        if (file.size > MAX_PDF_BYTES) {
          return NextResponse.json(
            { error: "Circular PDF exceeds the 10 MB size limit." },
            { status: 413 }
          );
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        pdfBase64 = buffer.toString("base64");
        mimeType = file.type || "application/pdf";
      }
    } else {
      let body: Record<string, unknown>;
      try {
        const parsed = await req.json();
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return NextResponse.json(
            { error: "Invalid JSON request body." },
            { status: 400 }
          );
        }
        body = parsed as Record<string, unknown>;
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON request body." },
          { status: 400 }
        );
      }

      if (typeof body.text === "string" && body.text.trim()) {
        rawText = body.text.trim();
      }
      if (typeof body.pdfBase64 === "string" && body.pdfBase64.trim()) {
        pdfBase64 = body.pdfBase64.trim();
        mimeType =
          typeof body.mimeType === "string" ? body.mimeType : "application/pdf";
      }
    }

    if (!rawText && !pdfBase64) {
      return NextResponse.json(
        { error: "Upload a circular PDF or paste circular/annex text to compile." },
        { status: 400 }
      );
    }

    const catalog = await loadPackageCatalog(supabase);
    const activePackages = catalog.error
      ? []
      : selectActivePackagesForDate(
          catalog.packages,
          new Date().toISOString().slice(0, 10)
        );

    const compiled = await compilePhilHealthCircularWithGemini({
      rawText,
      pdfBase64,
      mimeType,
    });

    const diff = computeCircularDiff(compiled.packages, activePackages);

    return NextResponse.json({
      circular_number: compiled.circular_number,
      effective_from: compiled.effective_from,
      supersedes_circular: compiled.supersedes_circular,
      summary_notes: compiled.summary_notes,
      diff,
    });
  } catch (err: unknown) {
    console.error("POST /api/rates/compile error:", err);
    return NextResponse.json(
      { error: "Failed to compile PhilHealth circular. Please try again." },
      { status: 500 }
    );
  }
}
