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
    const message =
      err instanceof Error ? err.message : "Failed to load PhilHealth catalog.";
    return NextResponse.json({ error: message }, { status: 500 });
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

    const body = await req.json();
    let inputs: SeedPackageInput[] = [];

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
      inputs = [normalizeSeedPackage(body as Record<string, unknown>)];
    } else {
      return NextResponse.json(
        {
          error:
            "Provide `package` (object), `packages` (array), or `csv` (string) to sync.",
        },
        { status: 400 }
      );
    }

    const stats = await upsertCatalogPackages(supabase, inputs);
    const updatedCatalog = await loadPackageCatalog(supabase);

    return NextResponse.json({
      success: true,
      ...stats,
      packages: updatedCatalog.packages,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to sync PhilHealth circular rates.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
