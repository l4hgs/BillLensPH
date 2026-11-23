import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RawFileEntry {
  path?: unknown;
}

function extractAuditStoragePaths(rawExtractedData: unknown): string[] {
  if (!rawExtractedData || typeof rawExtractedData !== "object") {
    return [];
  }
  const raw = rawExtractedData as {
    files?: RawFileEntry[];
    storage_paths?: unknown[];
  };

  const paths = new Set<string>();

  if (Array.isArray(raw.files)) {
    for (const file of raw.files) {
      if (file && typeof file.path === "string" && file.path.trim()) {
        paths.add(file.path.trim());
      }
    }
  }

  if (Array.isArray(raw.storage_paths)) {
    for (const entry of raw.storage_paths) {
      if (typeof entry === "string" && entry.trim()) {
        paths.add(entry.trim());
      }
    }
  }

  return Array.from(paths);
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!id || !id.trim()) {
      return NextResponse.json(
        { error: "Audit ID is required." },
        { status: 400 }
      );
    }

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

    const { data: auditRow, error: fetchErr } = await supabase
      .from("audits")
      .select("id, raw_extracted_data")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchErr) {
      console.error("Failed to look up audit for deletion:", fetchErr);
      return NextResponse.json(
        { error: "Could not verify audit record. Please try again." },
        { status: 500 }
      );
    }

    if (!auditRow) {
      return NextResponse.json(
        { error: "Audit record not found." },
        { status: 404 }
      );
    }

    const storagePaths = extractAuditStoragePaths(auditRow.raw_extracted_data);
    let removedFiles = 0;

    if (storagePaths.length > 0) {
      const { error: removeErr } = await supabase.storage
        .from("bill-uploads")
        .remove(storagePaths);

      if (removeErr) {
        console.warn(
          `Could not remove one or more storage objects for audit ${id}:`,
          removeErr.message
        );
      } else {
        removedFiles = storagePaths.length;
      }
    }

    const { error: deleteErr } = await supabase
      .from("audits")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (deleteErr) {
      console.error(`Failed to delete audit ${id}:`, deleteErr);
      return NextResponse.json(
        { error: "Failed to delete audit record. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      deletedId: id,
      removedFiles,
    });
  } catch (err: unknown) {
    console.error("DELETE /api/audit/[id] error:", err);
    return NextResponse.json(
      { error: "Unable to delete audit right now. Please try again." },
      { status: 500 }
    );
  }
}
