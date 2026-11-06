"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Database,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPHP } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

export interface PhilHealthPackage {
  id?: string;
  code: string;
  keyword: string;
  hciFee: number;
  profFee: number;
  totalRate: number;
  inclusiveItems: string[];
  description?: string;
  category: "Surgical" | "Medical" | "Cardiovascular" | "Maternal" | "Renal" | "General";
}

const DEFAULT_PACKAGES: PhilHealthPackage[] = [
  {
    code: "47562",
    keyword: "Laparoscopic Cholecystectomy",
    hciFee: 23250,
    profFee: 15500,
    totalRate: 38750,
    category: "Surgical",
    description: "Minimally invasive gallbladder removal via laparoscopic instrumentation with standard OR recovery.",
    inclusiveItems: [
      "Laparoscopic tower and instrument use",
      "CO2 insufflation gas",
      "Endoscopic surgical clips",
      "Surgical trocars and cannulas",
      "Standard sterile drape packs and surgical gowns",
      "Suture materials and skin closure tape",
      "PACU recovery room charges",
      "Normal saline / Lactated Ringer's IV fluids",
    ],
  },
  {
    code: "44970",
    keyword: "Laparoscopic Appendectomy",
    hciFee: 18000,
    profFee: 12000,
    totalRate: 30000,
    category: "Surgical",
    description: "Laparoscopic appendix excision inclusive of trocars, clips, and standard post-op monitoring.",
    inclusiveItems: [
      "Laparoscopic camera system and monitor usage",
      "Laparoscopic instruments (dissector, grasper, scissors)",
      "Endoloop or endoscopic clips for appendix base",
      "CO2 insufflation gas",
      "Basic sterile packs, gloves, and surgical drapes",
      "Routine intra-op antibiotics and analgesics",
      "Recovery room accommodation",
    ],
  },
  {
    code: "93458",
    keyword: "Coronary Angiography",
    hciFee: 28500,
    profFee: 19000,
    totalRate: 47500,
    category: "Cardiovascular",
    description: "Diagnostic cardiac catheterization including fluoroscopy, sheath, standard non-ionic contrast, and catheters.",
    inclusiveItems: [
      "Cath lab facility and fluoroscopy machine usage",
      "Radial / femoral vascular introducer sheath",
      "Diagnostic coronary catheters",
      "Standard 0.035 guidewire",
      "Standard non-ionic contrast media (up to 100mL)",
      "Heparin flush and routine antithrombotics",
      "Sterile catheterization drape pack",
      "Hemostatic puncture compression bandage",
    ],
  },
  {
    code: "92920",
    keyword: "Percutaneous Coronary Intervention (PCI)",
    hciFee: 54000,
    profFee: 36000,
    totalRate: 90000,
    category: "Cardiovascular",
    description: "Coronary balloon angioplasty and stenting bundle covering cath lab cine fees, guide catheters, and wires.",
    inclusiveItems: [
      "Cath lab intervention room and cine-angiography fees",
      "Guiding catheters and coronary guidewires (0.014)",
      "PTCA balloon dilatation catheter",
      "High-pressure inflation device (indeflator)",
      "Standard contrast media",
      "Heparin anticoagulation and post-procedure ACT testing",
      "Arterial closure dressing",
    ],
  },
  {
    code: "59400",
    keyword: "Normal Spontaneous Delivery (NSD)",
    hciFee: 6500,
    profFee: 3900,
    totalRate: 10400,
    category: "Maternal",
    description: "Standard vaginal delivery package covering labor room, episiotomy repair, oxytocin, and basic newborn care.",
    inclusiveItems: [
      "Delivery room facility and labor bed monitoring",
      "Sterile delivery instrument pack",
      "Episiotomy repair sutures and local lidocaine",
      "Routine oxytocin / uterotonic drugs",
      "Basic neonatal suction bulb, cord clamp, and cord scissors",
      "Vitamin K injection and erythromycin eye ointment for infant",
      "First 24 hours room and board for mother and baby",
    ],
  },
  {
    code: "59510",
    keyword: "Cesarean Section Delivery",
    hciFee: 15600,
    profFee: 10400,
    totalRate: 26000,
    category: "Maternal",
    description: "Surgical delivery package inclusive of spinal anesthesia needle, suture packs, and immediate infant stabilization.",
    inclusiveItems: [
      "Operating room and delivery instrumentation set",
      "Standard spinal anesthesia tray and needle",
      "Uterine and abdominal wall suture materials",
      "Oxytocin / Methylergometrine uterotonic medications",
      "Immediate newborn resuscitation station usage",
      "PACU recovery monitoring",
      "Post-op IV hydration and standard analgesia",
    ],
  },
  {
    code: "90935",
    keyword: "Hemodialysis Session",
    hciFee: 4000,
    profFee: 0,
    totalRate: 4000,
    category: "Renal",
    description: "Standard renal replacement session under the PhilHealth expanded 156-session benefit circular.",
    inclusiveItems: [
      "Hemodialysis machine utilization and dialysate solution",
      "Standard biocompatible dialyzer filter",
      "Arterial and venous blood tubing lines",
      "Fistula needles (AVF needles) or connector caps",
      "Heparin sodium injection for circuit anticoagulation",
      "Normal saline flush (1000mL)",
      "Pre- and post-dialysis vital signs monitoring",
    ],
  },
  {
    code: "J18.9",
    keyword: "Community-Acquired Pneumonia (Moderate Risk)",
    hciFee: 10500,
    profFee: 4500,
    totalRate: 15000,
    category: "Medical",
    description: "Hospital admission for moderate pneumonia inclusive of ward room, empiric IV antibiotics, chest X-ray, and oxygen therapy.",
    inclusiveItems: [
      "Hospital room and board (ward / semi-private accommodation)",
      "Baseline CBC, urinalysis, and sputum microscopy",
      "Chest X-Ray (AP/Lateral)",
      "First-line empiric IV antibiotics (Ceftriaxone / Ampicillin-Sulbactam)",
      "Standard IV cannula, infusion set, and hydration fluids",
      "Oxygen inhalation therapy and nebulization supplies",
      "Daily vital signs and physician ward rounds",
    ],
  },
  {
    code: "A97.1",
    keyword: "Dengue Fever with Warning Signs",
    hciFee: 9100,
    profFee: 3900,
    totalRate: 13000,
    category: "Medical",
    description: "Inpatient management with serial hematocrit and platelet counts, crystalloid hydration fluids, and supportive therapy.",
    inclusiveItems: [
      "Hospital room accommodation and strict intake/output recording",
      "Serial CBC with platelet count monitoring",
      "Dengue NS1 antigen or Dengue IgM/IgG rapid test",
      "Crystalloid IV fluids (D5 LRS / 0.9% NaCl)",
      "IV cannula, extension tubing, and stopcock",
      "Oral rehydration salts and paracetamol antipyretics",
    ],
  },
  {
    code: "66984",
    keyword: "Cataract Extraction with IOL",
    hciFee: 10800,
    profFee: 7200,
    totalRate: 18000,
    category: "Surgical",
    description: "Phacoemulsification with foldable monofocal intraocular lens, viscoelastic, and local ophthalmic drops.",
    inclusiveItems: [
      "Phacoemulsification machine and ultrasonic handpiece use",
      "Ophthalmic microsurgical instrument set",
      "Foldable standard mono-focal intraocular lens (IOL)",
      "Ophthalmic viscoelastic device (OVD / Hyaluronic acid)",
      "Balanced Salt Solution (BSS) irrigating solution",
      "Sterile eye drape and corneal incision blades",
      "Post-operative eye shield",
    ],
  },
];

function inferCategory(keyword: string, code: string): PhilHealthPackage["category"] {
  const k = keyword.toLowerCase();
  if (k.includes("cholecystectomy") || k.includes("appendectomy") || k.includes("cataract") || k.includes("hernia") || k.includes("hysterectomy") || k.includes("repair")) {
    return "Surgical";
  }
  if (k.includes("coronary") || k.includes("angio") || k.includes("cardiac") || k.includes("hypertens")) {
    return "Cardiovascular";
  }
  if (k.includes("delivery") || k.includes("cesarean") || k.includes("matern") || k.includes("nsd")) {
    return "Maternal";
  }
  if (k.includes("dialysis") || k.includes("renal") || k.includes("kidney")) {
    return "Renal";
  }
  if (code.startsWith("J") || code.startsWith("A") || code.startsWith("I") || code.startsWith("E") || k.includes("pneumonia") || k.includes("dengue") || k.includes("gastroenteritis")) {
    return "Medical";
  }
  return "General";
}

export default function RatesPage() {
  const [packages, setPackages] = useState<PhilHealthPackage[]>(DEFAULT_PACKAGES);
  const [loading, setLoading] = useState(true);
  const [isFromSupabase, setIsFromSupabase] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  useEffect(() => {
    async function loadPackages() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("philhealth_packages")
          .select("*")
          .order("procedure_keyword", { ascending: true });

        if (!error && data && data.length > 0) {
          const mapped: PhilHealthPackage[] = data.map((item) => ({
            id: item.id,
            code: item.case_code,
            keyword: item.procedure_keyword,
            hciFee: Number(item.hci_fee) || 0,
            profFee: Number(item.prof_fee) || 0,
            totalRate: Number(item.total_case_rate) || 0,
            inclusiveItems: item.inclusive_items || [],
            category: inferCategory(item.procedure_keyword, item.case_code),
            description: `Official PhilHealth case package covering hospital facility charges (${formatPHP(item.hci_fee)}) and accredited physician professional fees (${formatPHP(item.prof_fee)}).`,
          }));
          setPackages(mapped);
          setIsFromSupabase(true);
        }
      } catch {
        // Fall back to DEFAULT_PACKAGES
      } finally {
        setLoading(false);
      }
    }
    loadPackages();
  }, []);

  const categories = ["All", "Surgical", "Medical", "Cardiovascular", "Maternal", "Renal"];

  const filtered = useMemo(() => {
    return packages.filter((pkg) => {
      const matchesSearch =
        pkg.keyword.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pkg.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pkg.inclusiveItems.some((item) => item.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCat =
        selectedCategory === "All" || pkg.category === selectedCategory;

      return matchesSearch && matchesCat;
    });
  }, [packages, searchQuery, selectedCategory]);

  const toggleExpand = (code: string) => {
    setExpandedCode((prev) => (prev === code ? null : code));
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-3xl mx-auto animate-in fade-in duration-300">
      {/* Header Info */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#CBD5E1] shadow-soft">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold border border-blue-200/80">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>PhilHealth All-Case-Rates (ACR v3)</span>
              </div>
              {isFromSupabase ? (
                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                  <Database className="w-3 h-3" />
                  <span>Live Supabase Sync</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                  <Sparkles className="w-3 h-3 text-amber-600" />
                  <span>Reference Dataset</span>
                </div>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Benefit Case Rates Directory
            </h1>
            <p className="text-xs text-slate-600 mt-1">
              Official circular rates covering hospital facility charges, surgical supplies, and professional fees.
            </p>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-4 border-t border-[#CBD5E1] mt-4 no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all whitespace-nowrap ${
                selectedCategory === cat
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Search Input */}
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-slate-400 absolute left-4 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by code, procedure, or supply (e.g. 44970, Appendectomy, contrast media)..."
          className="w-full bg-white border border-[#CBD5E1] rounded-full pl-11 pr-4 py-3 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-soft transition-all"
        />
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between px-2 text-xs text-slate-600">
        <span>
          Showing <strong>{filtered.length}</strong> package{filtered.length === 1 ? "" : "s"}
        </span>
        <span className="text-[11px] text-slate-600">
          Click any card to inspect mandatory inclusions
        </span>
      </div>

      {/* Case Package Cards */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-600 bg-white rounded-2xl border border-[#CBD5E1]">
            Loading PhilHealth packages...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-600 bg-white rounded-2xl border border-[#CBD5E1] space-y-2">
            <AlertCircle className="w-6 h-6 text-slate-400 mx-auto" />
            <p className="font-semibold text-slate-800">No matching PhilHealth packages found</p>
            <p className="text-slate-600">Try searching for common terms like &ldquo;Gallbladder&rdquo;, &ldquo;NSD&rdquo;, or &ldquo;Dengue&rdquo;.</p>
          </div>
        ) : (
          filtered.map((pkg) => {
            const isExpanded = expandedCode === pkg.code;
            const isRVS = /^\d+$/.test(pkg.code);
            return (
              <Card
                key={pkg.code}
                onClick={() => toggleExpand(pkg.code)}
                className={`transition-all bg-white cursor-pointer group border ${
                  isExpanded ? "border-blue-400 shadow-md ring-1 ring-blue-500/10" : "border-[#CBD5E1] hover:border-blue-200 hover:shadow-card-hover"
                }`}
              >
                <CardContent className="p-4 sm:p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                          {isRVS ? `RVS ${pkg.code}` : `ICD-10 ${pkg.code}`}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-600 uppercase">
                          {pkg.category}
                        </span>
                      </div>
                      <h3 className="font-bold text-sm sm:text-base text-slate-900 group-hover:text-blue-600 transition-colors">
                        {pkg.keyword}
                      </h3>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] uppercase font-bold text-slate-600 block">
                        Fixed Benefit
                      </span>
                      <span className="font-black text-sm sm:text-base text-emerald-800">
                        {formatPHP(pkg.totalRate)}
                      </span>
                    </div>
                  </div>

                  {pkg.description && (
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">
                      {pkg.description}
                    </p>
                  )}

                  {/* Fee Breakdown Row */}
                  <div className="pt-2 border-t border-[#CBD5E1] flex items-center justify-between text-xs text-slate-600">
                    <div className="flex items-center gap-3">
                      <span>
                        Facility (HCI) Fee:{" "}
                        <strong className="text-slate-800">{formatPHP(pkg.hciFee)}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Prof. Fee:{" "}
                        <strong className="text-slate-800">{formatPHP(pkg.profFee)}</strong>
                      </span>
                    </div>

                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                      aria-label="Toggle details"
                    >
                      <span>{isExpanded ? "Hide Inclusions" : "View Inclusions"}</span>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Expandable Inclusions Drawer (Anti-Unbundling Check) */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-blue-100/70 bg-blue-50/40 -mx-4 -mb-4 sm:-mx-5 sm:-mb-5 p-4 rounded-b-2xl space-y-2.5 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                          Mandatory Package Inclusions (Cannot be Unbundled)
                        </span>
                        <Badge variant="neutral" className="text-[10px]">
                          {pkg.inclusiveItems.length} Verified Inclusions
                        </Badge>
                      </div>
                      <p className="text-[11px] text-blue-950/80 leading-relaxed">
                        Under PhilHealth All-Case-Rates rules, accredited facilities are prohibited from charging patients separate out-of-pocket fees for these items when the case rate is claimed:
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                        {pkg.inclusiveItems.map((item, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-1.5 text-xs text-slate-700 bg-white/90 p-2 rounded-xl border border-blue-100/70 shadow-xs"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                            <span className="leading-snug">{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}


