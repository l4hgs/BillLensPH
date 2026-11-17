import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { discoverPhilHealthPackageWithGemini } from "@/lib/caseRateDiscovery";
import {
  toCatalogPackage,
  upsertCatalogPackages,
} from "@/lib/packageCatalog";

export const maxDuration = 45;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = typeof body.query === "string" ? body.query.trim() : "";

    if (!query || query.length < 2) {
      return NextResponse.json(
        {
          error:
            "Provide a search query (diagnosis, procedure, RVS code, or ICD-10 code) of at least 2 characters.",
        },
        { status: 400 }
      );
    }

    const discoveredSeeds = await discoverPhilHealthPackageWithGemini({
      query,
    });

    if (discoveredSeeds.length === 0) {
      return NextResponse.json(
        {
          error: `No matching PhilHealth Case Rate package could be resolved for "${query}".`,
          packages: [],
        },
        { status: 404 }
      );
    }

    let persistedToDb = false;
    try {
      const supabase = await createClient();
      await upsertCatalogPackages(supabase, discoveredSeeds);
      persistedToDb = true;
    } catch (dbErr) {
      console.warn(
        "Discovered PhilHealth packages could not be cached to Supabase (returning live results):",
        dbErr
      );
    }

    const packages = discoveredSeeds.map((item) =>
      toCatalogPackage(
        {
          case_code: item.case_code,
          procedure_keyword: item.procedure_keyword,
          hci_fee: item.hci_fee,
          prof_fee: item.prof_fee,
          total_case_rate: item.total_case_rate,
          inclusive_items: item.inclusive_items,
          circular_id: item.circular_id,
          effective_from: item.effective_from,
          effective_to: item.effective_to ?? null,
          source_url: item.source_url ?? "ai_grounded:philhealth-acr",
        },
        item.aliases
      )
    );

    return NextResponse.json({
      success: true,
      persistedToDb,
      packages,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to auto-discover PhilHealth case rate.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
