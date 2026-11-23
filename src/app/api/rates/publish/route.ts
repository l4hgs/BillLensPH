import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  formatCircularNumber,
  reconcilePackageSplit,
} from "@/lib/packageCatalog";
import { subtractOneDay, type CircularDiffRow } from "@/lib/circularCompiler";

interface PublishPayload {
  circular_number: string;
  effective_from: string;
  supersedes_circular?: string | null;
  items: Array<
    Partial<CircularDiffRow> & {
      case_code: string;
      procedure_keyword: string;
      new_total_case_rate?: number;
      new_hci_fee?: number;
      new_prof_fee?: number;
      total_case_rate?: number;
      hci_fee?: number;
      prof_fee?: number;
    }
  >;
}

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
            "Forbidden: Only administrators (profiles.role = 'admin') can publish PhilHealth circulars.",
        },
        { status: 403 }
      );
    }

    let body: PublishPayload;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json(
          { error: "Invalid JSON request body." },
          { status: 400 }
        );
      }
      body = parsed as PublishPayload;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body." },
        { status: 400 }
      );
    }

    const circularNumber = formatCircularNumber(body.circular_number);
    const effectiveFrom =
      typeof body.effective_from === "string"
        ? body.effective_from.trim().slice(0, 10)
        : "";

    if (!circularNumber) {
      return NextResponse.json(
        { error: "A valid circular_number (e.g. PC-2024-0037) is required." },
        { status: 400 }
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      return NextResponse.json(
        { error: "A valid effective_from date (YYYY-MM-DD) is required." },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: "Select at least one circular rate row to publish." },
        { status: 400 }
      );
    }

    const previousDay = subtractOneDay(effectiveFrom);
    const circularId = circularNumber.replace(/^PC-/i, "");
    const sourceUrl = `official_circular:${circularNumber}`;

    let publishedCount = 0;
    let supersededCount = 0;

    for (const item of body.items) {
      const caseCode = String(item.case_code || "").trim();
      const procedureKeyword = String(item.procedure_keyword || "").trim();
      if (!caseCode || !procedureKeyword) continue;
      if (item.status === "UNCHANGED") continue;

      const split = reconcilePackageSplit(
        Number(item.new_hci_fee ?? item.hci_fee ?? 0),
        Number(item.new_prof_fee ?? item.prof_fee ?? 0),
        Number(item.new_total_case_rate ?? item.total_case_rate ?? 0),
        { case_code: caseCode, is_verified: true }
      );

      if (split.total_case_rate <= 0) continue;

      // 1. Chain/close currently active pre-existing rows for RATE_UPDATED codes
      if (item.status === "RATE_UPDATED") {
        const { data: activeRows } = await supabase
          .from("philhealth_packages")
          .select("id, effective_from, effective_to")
          .eq("case_code", caseCode)
          .lt("effective_from", effectiveFrom);

        const toSupersede = (activeRows ?? []).filter(
          (row) => !row.effective_to || row.effective_to >= effectiveFrom
        );

        for (const oldRow of toSupersede) {
          let { error: closeErr } = await supabase
            .from("philhealth_packages")
            .update({
              effective_to: previousDay,
              superseded_by: circularNumber,
            })
            .eq("id", oldRow.id);

          if (closeErr && /superseded_by/i.test(closeErr.message)) {
            const retry = await supabase
              .from("philhealth_packages")
              .update({ effective_to: previousDay })
              .eq("id", oldRow.id);
            closeErr = retry.error;
          }

          if (!closeErr) {
            supersededCount++;
          }
        }
      }

      // 2. Insert or update the new verified circular version row
      const { data: existingSameDate } = await supabase
        .from("philhealth_packages")
        .select("id")
        .eq("case_code", caseCode)
        .eq("effective_from", effectiveFrom)
        .maybeSingle();

      const rowPayload = {
        case_code: caseCode,
        procedure_keyword: procedureKeyword,
        circular_id: circularId,
        circular_number: circularNumber,
        effective_from: effectiveFrom,
        effective_to: null,
        superseded_by: null,
        source_url: sourceUrl,
        is_verified: true,
        hci_fee: split.hci_fee,
        prof_fee: split.prof_fee,
        total_case_rate: split.total_case_rate,
        inclusive_items: Array.isArray(item.inclusive_items)
          ? item.inclusive_items.map(String)
          : [],
      };

      let packageId = existingSameDate?.id;

      if (packageId) {
        let { error: updateErr } = await supabase
          .from("philhealth_packages")
          .update(rowPayload)
          .eq("id", packageId);

        if (
          updateErr &&
          /(circular_number|superseded_by)/i.test(updateErr.message)
        ) {
          const fallback = { ...rowPayload };
          delete (fallback as Record<string, unknown>).circular_number;
          delete (fallback as Record<string, unknown>).superseded_by;
          const retry = await supabase
            .from("philhealth_packages")
            .update(fallback)
            .eq("id", packageId);
          updateErr = retry.error;
        }

        if (updateErr) {
          throw new Error(
            `Failed to update package ${caseCode}: ${updateErr.message}`
          );
        }
      } else {
        let { data: inserted, error: insertErr } = await supabase
          .from("philhealth_packages")
          .insert(rowPayload)
          .select("id")
          .single();

        if (
          insertErr &&
          /(circular_number|superseded_by)/i.test(insertErr.message)
        ) {
          const fallback = { ...rowPayload };
          delete (fallback as Record<string, unknown>).circular_number;
          delete (fallback as Record<string, unknown>).superseded_by;
          const retry = await supabase
            .from("philhealth_packages")
            .insert(fallback)
            .select("id")
            .single();
          inserted = retry.data;
          insertErr = retry.error;
        }

        if (insertErr || !inserted) {
          throw new Error(
            `Failed to insert package ${caseCode}: ${insertErr?.message}`
          );
        }
        packageId = inserted.id;
      }

      publishedCount++;

      // 3. Upsert matcher aliases if provided
      if (packageId && Array.isArray(item.aliases) && item.aliases.length > 0) {
        for (const rawAlias of item.aliases) {
          const alias = String(rawAlias).trim().toLowerCase();
          if (!alias) continue;
          await supabase
            .from("package_item_aliases")
            .upsert(
              { package_id: packageId, alias, kind: "token" },
              { onConflict: "package_id,alias" }
            );
        }
      }
    }

    return NextResponse.json({
      publishedCount,
      supersededCount,
      circular_number: circularNumber,
    });
  } catch (err: unknown) {
    console.error("POST /api/rates/publish error:", err);
    return NextResponse.json(
      { error: "Failed to publish PhilHealth circular rates. Please try again." },
      { status: 500 }
    );
  }
}
