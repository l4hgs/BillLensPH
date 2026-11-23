import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  loadPackageCatalog,
  normalizeSeedPackage,
  parseCatalogCsv,
  upsertCatalogPackages,
  type SeedPackageInput,
} from "@/lib/packageCatalog";

export async function GET() {
  try {
    const supabase = await createClient();
    const catalog = await loadPackageCatalog(supabase);
    if (catalog.error) {
      return NextResponse.json(
        { error: catalog.error, packages: [] },
        { status: 503 }
      );
    }
    return NextResponse.json({
      packages: catalog.packages,
      statutoryRule: catalog.statutoryRule ?? null,
    });
  } catch (err: unknown) {
    console.error("GET /api/rates error:", err);
    return NextResponse.json(
      { error: "Failed to load PhilHealth catalog. Please try again." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          error:
            "Authentication required. Sign in to add or sync PhilHealth circular rates.",
        },
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
            "Forbidden: Only administrators (profiles.role = 'admin') can add or update PhilHealth catalog rates.",
        },
        { status: 403 }
      );
    }

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

    let inputs: SeedPackageInput[] = [];
    try {
      if (typeof body.csv === "string" && body.csv.trim()) {
        inputs = parseCatalogCsv(body.csv);
      } else if (Array.isArray(body.packages)) {
        inputs = body.packages.map((item: unknown) =>
          normalizeSeedPackage((item ?? {}) as Record<string, unknown>)
        );
      } else if (body.package && typeof body.package === "object") {
        inputs = [
          normalizeSeedPackage(body.package as Record<string, unknown>),
        ];
      } else if (body.case_code || body.code) {
        inputs = [normalizeSeedPackage(body)];
      } else {
        return NextResponse.json(
          {
            error:
              "Provide `package` (object), `packages` (array), or `csv` (string) to sync.",
          },
          { status: 400 }
        );
      }
    } catch (parseErr: unknown) {
      const validationMessage =
        parseErr instanceof Error
          ? parseErr.message
          : "Invalid PhilHealth package payload.";
      return NextResponse.json({ error: validationMessage }, { status: 400 });
    }

    const stats = await upsertCatalogPackages(supabase, inputs);
    const updatedCatalog = await loadPackageCatalog(supabase);

    return NextResponse.json({
      success: true,
      ...stats,
      packages: updatedCatalog.packages,
    });
  } catch (err: unknown) {
    console.error("POST /api/rates error:", err);
    return NextResponse.json(
      { error: "Failed to sync PhilHealth circular rates. Please try again." },
      { status: 500 }
    );
  }
}
