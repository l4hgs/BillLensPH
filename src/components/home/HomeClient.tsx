"use client";

import React, { useEffect, useLayoutEffect, useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Scan,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { formatPHP } from "@/lib/utils";
import type { User } from "@supabase/supabase-js";

interface LensScenario {
  id: "unbundling" | "statutory" | "rates";
  label: string;
  tag: string;
  citation: string;
  description: string;
  originalPrice: number;
  correctedPrice: number;
  savings: number;
  item: string;
  category: string;
}

const SCENARIOS: LensScenario[] = [
  {
    id: "unbundling",
    label: "Anti-Unbundling",
    tag: "Prohibited Separate Billing",
    citation: "PhilHealth Circular 2024-0037+",
    description:
      "Operating room instruments, basic packs, and routine surgical supplies are bundled directly into the Appendectomy case rate tariff. Facilities cannot charge separate out-of-pocket fees for these.",
    item: "Laparoscopic Trocar & Hand Instrument Pack",
    category: "Operating Room Supplies",
    originalPrice: 8500,
    correctedPrice: 0,
    savings: 8500,
  },
  {
    id: "statutory",
    label: "Senior & PWD Sequence",
    tag: "Mandatory Deduction Sequence",
    citation: "RA 9994 / RA 10754 · Advisory 2023-0036",
    description:
      "Statutory discounts must apply first: 12% VAT exemption, followed by 20% Senior/PWD relief, before deducting PhilHealth. Applying PhilHealth first reduces the patient's legal privilege.",
    item: "Injectable Ceftriaxone 1g IV Vial (x4)",
    category: "Prescription Pharmacy",
    originalPrice: 3950,
    correctedPrice: 1280,
    savings: 2670,
  },
  {
    id: "rates",
    label: "ACR v3 Tariff Expansion",
    tag: "Updated Benefit Cap",
    citation: "PhilHealth Circular 2024-0037+",
    description:
      "Circular 2024-0037 expanded the Appendectomy case rate to ₱46,800 (+50%). Hospitals using obsolete legacy thresholds under-credit patient statements by ₱22,800.",
    item: "Acute Appendectomy (RVS 44950) Patient Balance",
    category: "PhilHealth Case Package",
    originalPrice: 36000,
    correctedPrice: 13200,
    savings: 22800,
  },
];

const STATUTES = [
  {
    code: "RA 11223",
    title: "Universal Health Care Act",
    summary: "Guaranteed automatic PhilHealth enrollment and predictable case rate caps across accredited facilities.",
  },
  {
    code: "RA 9994",
    title: "Expanded Senior Citizens Act",
    summary: "Mandatory 20% discount and 12% VAT exemption computed prior to PhilHealth deductions.",
  },
  {
    code: "RA 10754",
    title: "Persons with Disability (PWD) Act",
    summary: "Equal 20% discount and VAT exemption privileges on medical supplies, rooms, and professional fees.",
  },
  {
    code: "Circ. 2024-0037+",
    title: "PhilHealth All-Case-Rates v3",
    summary: "Tariff increases up to 50% with strict anti-unbundling prohibitions on routine supplies.",
  },
  {
    code: "RA 11463",
    title: "Malasakit Centers Act",
    summary: "Consolidated financial vouchers from PhilHealth, PCSO, DSWD, and DOH for remaining balances.",
  },
];

const FAQS = [
  {
    q: "What is an Itemized Statement of Account (ISA)?",
    a: "An ISA is the complete, item-by-item breakdown of every medicine, medical supply, laboratory examination, room accommodation, and doctor fee charged during confinement. Under DOH regulations, every patient is legally entitled to request one prior to settlement.",
  },
  {
    q: "How does BillLens PH catch unbundled items?",
    a: "PhilHealth All-Case-Rates (ACR) packages bundle routine supplies and standard medicines into the fixed benefit tariff. We cross-check your extracted bill lines against official PhilHealth package inclusions to highlight prohibited separate charges.",
  },
  {
    q: "Can a patient claim both Senior Citizen and PWD discounts?",
    a: "Under Philippine law (RA 9994 & RA 10754), statutory discounts are mutually exclusive—they cannot be double-stacked. However, the patient is entitled to whichever privilege is most advantageous, applied in the correct sequence.",
  },
  {
    q: "What if the hospital billing desk disputes the brief?",
    a: "You can present the BillLens Negotiation Brief directly to the Billing Supervisor or the hospital's PhilHealth Desk. If discrepancies persist, copy-furnish the in-house Malasakit Center or Medical Social Services.",
  },
];

function ScrollReveal({
  children,
  className = "",
  delay = 0,
  direction = "up",
  minimal = false,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "left" | "right" | "none" | "minimal";
  minimal?: boolean;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Re-triggers every time the user scrolls in and out of view
        setIsVisible(entry.isIntersecting);
      },
      {
        threshold: minimal || direction === "minimal" ? 0.01 : 0.08,
        rootMargin: minimal || direction === "minimal" ? "0px 0px 40px 0px" : "0px 0px -20px 0px",
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [minimal, direction]);

  const getTransform = () => {
    if (isVisible) return "translate-x-0 translate-y-0 opacity-100 blur-none";
    if (minimal || direction === "minimal") {
      // Minimal, subtle 4px shift with no blur for smooth, unobtrusive reveal
      return "translate-y-1 opacity-0";
    }
    switch (direction) {
      case "up":
        return "translate-y-8 opacity-0 blur-[4px]";
      case "left":
        return "-translate-x-8 opacity-0 blur-[4px]";
      case "right":
        return "translate-x-8 opacity-0 blur-[4px]";
      default:
        return "opacity-0 blur-[4px]";
    }
  };

  const isMinimalMode = minimal || direction === "minimal";

  return (
    <div
      ref={ref}
      style={{
        transitionDelay: isVisible ? `${delay}ms` : "0ms",
        transitionTimingFunction: isMinimalMode
          ? "cubic-bezier(0.16, 1, 0.3, 1)"
          : "cubic-bezier(0.22, 1, 0.36, 1)",
      }}
      className={`transition-all ${isMinimalMode ? "duration-500 ease-out" : "duration-700"} ${getTransform()} ${className}`}
    >
      {children}
    </div>
  );
}

function HeroContent({ user, isZoomed = false }: { user: User | null; isZoomed?: boolean }) {
  return (
    <div className={`space-y-5 sm:space-y-8 w-full ${isZoomed ? "pointer-events-none select-none" : ""}`}>
      {/* Crisp Monochromatic Badge */}
      <div className="inline-flex items-center px-3 sm:px-4 py-1 sm:py-1.5 rounded-full bg-white/90 backdrop-blur-xs border border-slate-300 text-[11px] sm:text-xs font-semibold text-slate-800 shadow-2xs">
        <span>Philippine Medical Billing Transparency</span>
      </div>

      {/* Display Headline: Fixed md:text-6xl so text and lens stay locked together across all desktop widths */}
      <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-[-0.03em] text-[#1E293B] leading-[1.14]">
        Your hospital bill, <br className="hidden sm:inline" />
        <span className="text-[#2563EB]">audited to the centavo.</span>
      </h1>

      {/* Minimalist Subtitle */}
      <p className="text-sm sm:text-lg text-slate-600 max-w-2xl mx-auto font-normal leading-relaxed">
        Verify PhilHealth All-Case-Rates benefit caps, uncover unbundled surgical supplies, and enforce statutory Senior &amp; PWD exemptions in one clean scan.
      </p>

      {/* Solid High-Contrast CTAs */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-3 pt-1 sm:pt-2">
        <Link href="/scanner" className="w-full sm:w-auto" tabIndex={isZoomed ? -1 : undefined}>
          <Button
            size="md"
            className="w-full sm:w-auto px-6 sm:px-7 py-2.5 sm:py-3 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold rounded-full text-xs sm:text-sm h-11 sm:h-12 gap-2 shadow-soft"
          >
            <Scan className="w-4 h-4 stroke-[2.2]" />
            <span>Scan Hospital Bill</span>
            <ArrowRight className="w-4 h-4 ml-0.5" />
          </Button>
        </Link>

        <Link href="/rates" className="w-full sm:w-auto" tabIndex={isZoomed ? -1 : undefined}>
          <Button
            variant="outline"
            size="md"
            className="w-full sm:w-auto px-5 sm:px-6 py-2.5 sm:py-3 bg-white text-slate-800 border-slate-300 hover:bg-slate-50 font-bold rounded-full text-xs sm:text-sm h-11 sm:h-12 shadow-2xs"
          >
            <Sparkles className="w-4 h-4 mr-1.5 text-[#2563EB]" />
            <span>Browse PhilHealth Rates</span>
          </Button>
        </Link>
      </div>

      {/* Auth / Status Cue */}
      {user ? (
        <div className="pt-1.5 text-xs text-slate-500 space-y-1">
          <p className="truncate max-w-xs sm:max-w-md mx-auto">
            Signed in as <span className="font-semibold text-slate-700 font-mono">{user.email}</span>
          </p>
          <div>
            <Link
              href="/audits"
              className="inline-flex items-center gap-1 text-[#2563EB] font-bold hover:underline"
              tabIndex={isZoomed ? -1 : undefined}
            >
              <span>View Your Audits</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400 pt-1">
          No credit card or registration required to audit your statement.
        </p>
      )}
    </div>
  );
}

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

let cachedDisplacementMapUrl: string | null = null;

function getConvexDisplacementMapUrl(): string | null {
  if (cachedDisplacementMapUrl) return cachedDisplacementMapUrl;
  if (typeof document === "undefined") return null;

  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;
  // Maximum theoretical value of |u * (1 - u^2)^1.15| on [-1, 1] is ~0.362887 at u ≈ 0.5505
  const maxUnitDisp = 0.362887;

  for (let y = 0; y < size; y++) {
    const v = (y + 0.5 - size / 2) / (size / 2); // -1 to 1
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5 - size / 2) / (size / 2); // -1 to 1
      const r2 = u * u + v * v;
      let normX = 0;
      let normY = 0;
      if (r2 < 1) {
        const falloff = Math.pow(1 - r2, 1.15);
        // Normalize to [-0.5, 0.5] so we utilize the entire 8-bit [1..255] dynamic range without stair-stepping
        normX = (-u * falloff) / (2 * maxUnitDisp);
        normY = (-v * falloff) / (2 * maxUnitDisp);
      }
      const idx = (y * size + x) * 4;
      data[idx] = Math.max(0, Math.min(255, Math.round(128 + normX * 254)));
      data[idx + 1] = Math.max(0, Math.min(255, Math.round(128 + normY * 254)));
      data[idx + 2] = 128;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  cachedDisplacementMapUrl = canvas.toDataURL("image/png");
  return cachedDisplacementMapUrl;
}

export function HomeClient({ initialUser = null }: { initialUser?: User | null }) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [activeScenario, setActiveScenario] = useState<LensScenario["id"]>("unbundling");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const trackRef = useRef<HTMLDivElement>(null);
  const scenarioItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pillRect, setPillRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  // Automatic 5-second continuous loop across the 3 scenarios (resets cleanly on hover change)
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveScenario((prev) => {
        const currentIndex = SCENARIOS.findIndex((s) => s.id === prev);
        const nextIndex = (currentIndex + 1) % SCENARIOS.length;
        return SCENARIOS[nextIndex].id;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [activeScenario]);

  // Measure active scenario tab for sliding underline & center it horizontally on mobile
  useEffect(() => {
    const updatePillRect = () => {
      const el = scenarioItemRefs.current[activeScenario];
      const track = trackRef.current;
      if (!el) return;
      setPillRect({
        left: el.offsetLeft,
        top: el.offsetTop,
        width: el.offsetWidth,
        height: el.offsetHeight,
      });
      if (track && track.scrollWidth > track.clientWidth) {
        const targetLeft = Math.max(
          0,
          el.offsetLeft - (track.clientWidth - el.offsetWidth) / 2
        );
        track.scrollTo({ left: targetLeft, behavior: "smooth" });
      }
    };

    updatePillRect();
    const rafId = requestAnimationFrame(updatePillRect);
    window.addEventListener("resize", updatePillRect);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updatePillRect);
    };
  }, [activeScenario]);

  const heroRef = useRef<HTMLDivElement>(null);
  const lensApertureRef = useRef<HTMLDivElement>(null);
  const lensFrameRef = useRef<HTMLDivElement>(null);
  const lensDomeRef = useRef<HTMLDivElement>(null);
  const lensContentRef = useRef<HTMLDivElement>(null);
  const targetOffsetRef = useRef({ x: 0, y: 0 });
  const currentOffsetRef = useRef({ x: 0, y: 0 });
  const isHoveringHeroRef = useRef(false);
  const [displacementMapUrl, setDisplacementMapUrl] = useState<string | null>(
    () => cachedDisplacementMapUrl
  );
  const [lensMetrics, setLensMetrics] = useState<{
    cx: number;
    cy: number;
    r: number;
    heroW: number;
    heroH: number;
  } | null>(null);
  const lensMetricsRef = useRef(lensMetrics);
  lensMetricsRef.current = lensMetrics;

  // Generate & cache 2D spherical convex dome displacement map before first paint
  useIsomorphicLayoutEffect(() => {
    if (!displacementMapUrl) {
      const url = getConvexDisplacementMapUrl();
      if (url) setDisplacementMapUrl(url);
    }
  }, [displacementMapUrl]);

  // Track exact lens circle coordinates relative to the centered text container before first paint
  useIsomorphicLayoutEffect(() => {
    const updateMetrics = () => {
      if (!heroRef.current || !lensApertureRef.current) return;
      const lensRect = lensApertureRef.current.getBoundingClientRect();
      // If hidden on mobile (< md), clear metrics so the zoom layer is unmounted
      if (lensRect.width === 0 || lensRect.height === 0) {
        setLensMetrics(null);
        return;
      }
      const heroRect = heroRef.current.getBoundingClientRect();
      const ox = currentOffsetRef.current.x;
      const oy = currentOffsetRef.current.y;

      setLensMetrics({
        cx: lensRect.left - heroRect.left - ox + lensRect.width / 2,
        cy: lensRect.top - heroRect.top - oy + lensRect.height / 2,
        r: Math.max(10, lensRect.width / 2 - 1),
        heroW: heroRect.width,
        heroH: heroRect.height,
      });
    };

    updateMetrics();
    const rafId = requestAnimationFrame(updateMetrics);
    window.addEventListener("resize", updateMetrics);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(updateMetrics);
      if (heroRef.current) ro.observe(heroRef.current);
      if (lensApertureRef.current) ro.observe(lensApertureRef.current);
    }

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateMetrics);
      ro?.disconnect();
    };
  }, []);

  // Interactive spring-damped magnifying lens tracking + gentle idle float (60fps direct DOM transforms)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (prefersReducedMotion) return;

    let rafId = 0;
    const SS_FACTOR = 3;

    const tick = (now: number) => {
      const metrics = lensMetricsRef.current;
      if (metrics) {
        const target = isHoveringHeroRef.current
          ? targetOffsetRef.current
          : {
              x: Math.cos(now * 0.0012) * 4,
              y: Math.sin(now * 0.0016) * 5,
            };

        const curr = currentOffsetRef.current;
        curr.x += (target.x - curr.x) * 0.14;
        curr.y += (target.y - curr.y) * 0.14;

        if (lensFrameRef.current) {
          lensFrameRef.current.style.transform = `translate3d(${curr.x.toFixed(2)}px, ${curr.y.toFixed(2)}px, 0)`;
        }
        if (lensDomeRef.current) {
          lensDomeRef.current.style.left = `${(metrics.cx + curr.x - metrics.r).toFixed(2)}px`;
          lensDomeRef.current.style.top = `${(metrics.cy + curr.y - metrics.r).toFixed(2)}px`;
        }
        if (lensContentRef.current) {
          const tx = -(metrics.cx + curr.x - metrics.r) * SS_FACTOR;
          const ty = -(metrics.cy + curr.y - metrics.r) * SS_FACTOR;
          lensContentRef.current.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${SS_FACTOR})`;
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const handleHeroMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const metrics = lensMetricsRef.current;
    if (!heroRef.current || !metrics) return;
    const heroRect = heroRef.current.getBoundingClientRect();
    const mx = e.clientX - heroRect.left;
    const my = e.clientY - heroRect.top;

    const minX = -metrics.heroW * 0.62;
    const maxX = 110;
    const minY = -metrics.heroH * 0.42;
    const maxY = metrics.heroH * 0.36;

    isHoveringHeroRef.current = true;
    targetOffsetRef.current = {
      x: Math.max(minX, Math.min(maxX, mx - metrics.cx)),
      y: Math.max(minY, Math.min(maxY, my - metrics.cy)),
    };
  };

  const handleHeroMouseLeave = () => {
    isHoveringHeroRef.current = false;
    targetOffsetRef.current = { x: 0, y: 0 };
  };

  useEffect(() => {
    const supabase = createClient();
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null);
      })
      .catch(() => {});

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const scenario = SCENARIOS.find((s) => s.id === activeScenario) ?? SCENARIOS[0];
  const lensDiameter = lensMetrics ? Math.round(lensMetrics.r * 2) : 0;
  // 3x Vector Supersampling (9x SSAA) so zoomed glyphs are rasterized at 300% native vector resolution before SVG warping
  const SS = 3;
  const supersampledDiameter = lensDiameter * SS;
  // Exact peak pixel displacement corresponding to normalized [-0.5, 0.5] 8-bit map (k = 0.38, maxUnitDisp = 0.362887)
  const displacementScale = lensMetrics
    ? lensMetrics.r * SS * 0.38 * 0.362887 * 2
    : 0;

  return (
    <div className="w-full max-w-none space-y-16 sm:space-y-24 lg:space-y-36 pt-4 sm:pt-8 pb-16 sm:pb-24 overflow-x-clip">
      {/* =========================================================================
          HERO SECTION: CENTERED TEXT WITH INTERACTIVE 3D CONVEX LENS ZOOM
         ========================================================================= */}
      <section
        onMouseMove={handleHeroMouseMove}
        onMouseLeave={handleHeroMouseLeave}
        className="relative overflow-x-clip pt-2 sm:pt-8 pb-6 sm:pb-16 text-center px-4 max-w-6xl mx-auto"
      >
        {/* Relative Text Container: The magnifying glass is anchored directly to this text block */}
        <div ref={heroRef} className="animate-fade-slide-in motion-reduce:animate-none relative max-w-3xl mx-auto">
          {/* Layer 1: Base Interactive Content (100% Visible Outside Lens) */}
          <div className="relative z-0">
            <HeroContent user={user} />
          </div>

          {/* Layer 2: 3x Supersampled True Spherical Convex Zoom Inside the Lens Aperture (Hidden on Mobile) */}
          {lensMetrics && displacementMapUrl && lensDiameter > 0 && (
            <>
              <svg
                width="0"
                height="0"
                className="hidden md:block absolute pointer-events-none"
                aria-hidden="true"
              >
                <defs>
                  <filter
                    id="billlens-convex-zoom"
                    filterUnits="userSpaceOnUse"
                    primitiveUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                    x="0"
                    y="0"
                    width={supersampledDiameter}
                    height={supersampledDiameter}
                  >
                    <feImage
                      href={displacementMapUrl}
                      x="0"
                      y="0"
                      width={supersampledDiameter}
                      height={supersampledDiameter}
                      preserveAspectRatio="none"
                      result="convexMap"
                    />
                    <feDisplacementMap
                      in="SourceGraphic"
                      in2="convexMap"
                      scale={displacementScale}
                      xChannelSelector="R"
                      yChannelSelector="G"
                      result="displaced"
                    />
                    {/* Sub-pixel antialiasing pass in 3x supersampled space to eliminate nearest-neighbor stair-stepping */}
                    <feGaussianBlur
                      in="displaced"
                      stdDeviation="0.48"
                    />
                  </filter>
                </defs>
              </svg>

              <div
                ref={lensDomeRef}
                className="hidden md:block absolute rounded-full overflow-hidden pointer-events-none select-none z-10"
                style={{
                  left: `${lensMetrics.cx - lensMetrics.r}px`,
                  top: `${lensMetrics.cy - lensMetrics.r}px`,
                  width: `${lensDiameter}px`,
                  height: `${lensDiameter}px`,
                  backgroundColor: "#F8FAFC",
                  boxShadow:
                    "inset 0 0 35px rgba(37, 99, 235, 0.24), inset 0 4px 12px rgba(255, 255, 255, 0.95), inset 0 -6px 20px rgba(15, 23, 42, 0.24)",
                }}
                aria-hidden="true"
              >
                {/* 3x supersampled convex-warped viewport scaled down by 1/3 for crisp retina vector edges */}
                <div
                  className="relative overflow-hidden bg-[#F8FAFC]"
                  style={{
                    width: `${supersampledDiameter}px`,
                    height: `${supersampledDiameter}px`,
                    transform: `scale(${1 / SS})`,
                    transformOrigin: "0 0",
                    filter: "url(#billlens-convex-zoom)",
                    willChange: "filter, transform",
                  }}
                >
                  <div
                    ref={lensContentRef}
                    className="text-center"
                    style={{
                      width: `${lensMetrics.heroW}px`,
                      height: `${lensMetrics.heroH}px`,
                      transform: `translate(${-(lensMetrics.cx - lensMetrics.r) * SS}px, ${-(lensMetrics.cy - lensMetrics.r) * SS}px) scale(${SS})`,
                      transformOrigin: "0 0",
                    }}
                  >
                    <HeroContent user={user} isZoomed />
                  </div>
                </div>

                {/* 3D Convex Glass Dome Specular Glare & Spherical Shading */}
                <div
                  className="absolute inset-0 rounded-full pointer-events-none"
                  style={{
                    background:
                      "radial-gradient(circle at 35% 32%, rgba(255, 255, 255, 0.65) 0%, rgba(255, 255, 255, 0.15) 30%, rgba(219, 234, 254, 0.2) 60%, rgba(37, 99, 235, 0.14) 82%, rgba(15, 23, 42, 0.25) 100%)",
                    boxShadow:
                      "inset 0 0 30px rgba(37, 99, 235, 0.22), inset 0 4px 10px rgba(255, 255, 255, 0.9), inset 0 -6px 16px rgba(15, 23, 42, 0.2)",
                  }}
                />
              </div>
            </>
          )}

          {/* Layer 3: Interactive Magnifying Glass Relative to Text (Hidden on Mobile) */}
          <div
            ref={lensFrameRef}
            className="hidden md:block absolute -right-[124px] top-[40%] -translate-y-1/2 w-[360px] h-[360px] pointer-events-none select-none z-20 will-change-transform"
          >
            {/* Invisible anchor marking the circular lens aperture */}
            <div
              ref={lensApertureRef}
              className="absolute rounded-full"
              style={{
                left: "4.6%",
                top: "14.9%",
                width: "44.4%",
                height: "44.4%",
              }}
            />

            {/* Physical Frame and Handle */}
            <div className="absolute inset-0 rotate-12 drop-shadow-xl opacity-95 transition-opacity">
              <Image
                src="/landing/magnifying-glass.png"
                alt=""
                fill
                priority
                unoptimized
                loading="eager"
                decoding="sync"
                sizes="360px"
                className="object-contain"
              />
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          INTERACTIVE LENS: AUTOMATIC LIQUID GLASS LOOP (EVERY 5 SECONDS)
         ========================================================================= */}
      <section className="space-y-4 sm:space-y-8 px-0 sm:px-4 max-w-7xl mx-auto">
        <ScrollReveal direction="left" delay={50} className="text-center max-w-xl mx-auto space-y-1.5 sm:space-y-2">
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Interactive Inspection
          </span>
          <h2 className="text-xl sm:text-3xl font-extrabold tracking-[-0.03em] text-[#1E293B]">
            See what the lens reveals.
          </h2>
        </ScrollReveal>

        {/* Clean Editorial Underlined Scenario Tabs (Auto-centers active tab on cycle) */}
        <ScrollReveal direction="left" delay={100} className="flex justify-center max-w-full">
          <div
            ref={trackRef}
            role="tablist"
            aria-label="Inspection scenarios"
            className="relative flex sm:inline-flex items-center justify-start sm:justify-center gap-5 sm:gap-8 flex-nowrap overflow-x-auto scrollbar-none border-b border-slate-200/80 px-2 sm:px-4 select-none max-w-full"
          >
            {/* Sliding Blue Underline Indicator */}
            {pillRect && (
              <span
                aria-hidden="true"
                className="absolute bottom-0 h-0.5 bg-[#2563EB] rounded-full pointer-events-none transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                style={{
                  left: `${pillRect.left}px`,
                  width: `${pillRect.width}px`,
                }}
              />
            )}

            {SCENARIOS.map((item) => {
              const isActive = item.id === activeScenario;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  ref={(el) => {
                    scenarioItemRefs.current[item.id] = el;
                  }}
                  onMouseEnter={() => setActiveScenario(item.id)}
                  onClick={() => setActiveScenario(item.id)}
                  className={`relative z-10 min-h-[44px] py-2.5 text-xs sm:text-sm font-bold tracking-tight whitespace-nowrap shrink-0 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-t-md ${
                    isActive
                      ? "text-[#2563EB]"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </ScrollReveal>

        {/* High-Contrast Inspection Stage with Staggered Content Animation & Scroll Reveal */}
        <ScrollReveal direction="left" delay={180} className="relative overflow-hidden bg-white/85 backdrop-blur-xl rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-soft p-4 sm:p-8 lg:p-12 transition-all">
          {/* Subtle neutral glass refraction sweep across card on scenario change */}
          <div
            key={`sheen-${activeScenario}`}
            aria-hidden="true"
            className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-slate-100/60 to-transparent animate-liquid-sheen pointer-events-none"
          />

          <div
            key={activeScenario}
            className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-8 lg:gap-12 items-center animate-liquid-stage"
          >
            {/* Left: The Billed Line Item with Staggered Element Reveal */}
            <div className="lg:col-span-7 space-y-3 sm:space-y-5">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 animate-content-1">
                <span className="text-[10px] sm:text-xs font-mono font-bold text-slate-900 border border-slate-300 bg-white px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md shadow-2xs">
                  {scenario.citation}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold bg-[#1E293B] text-white">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626]" />
                  {scenario.tag}
                </span>
              </div>

              <div className="animate-content-2">
                <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
                  {scenario.category}
                </span>
                <h3 className="text-lg sm:text-2xl font-bold text-[#1E293B] mt-0.5 tracking-tight">
                  {scenario.item}
                </h3>
              </div>

              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-normal animate-content-3">
                {scenario.description}
              </p>

              <div className="pt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 sm:gap-6 text-[11px] sm:text-xs text-slate-600 border-t border-slate-200 animate-content-4">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#2563EB] shrink-0" />
                  <span>DOH Reference Index Verified</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#2563EB] shrink-0" />
                  <span>PhilHealth Tariff Enforced</span>
                </div>
              </div>
            </div>

            {/* Right: High-Contrast Navy Financial Card with Slide/Scale Reveal */}
            <div className="lg:col-span-5 bg-[#0F172A] text-white rounded-2xl p-4 sm:p-7 lg:p-8 border border-slate-800 shadow-md space-y-3 sm:space-y-5 animate-financial-card">
              <div className="space-y-0.5 sm:space-y-1 animate-content-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block font-mono">
                  Hospital Stated Charge
                </span>
                <span className="text-lg sm:text-2xl font-bold text-slate-400 line-through font-mono tabular-nums block">
                  {formatPHP(scenario.originalPrice)}
                </span>
              </div>

              <div className="space-y-0.5 sm:space-y-1 pt-2.5 sm:pt-3 border-t border-slate-800 animate-content-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 block font-mono">
                  Lawful Adjusted Balance
                </span>
                <span className="text-2xl sm:text-4xl font-black text-white font-mono tabular-nums block">
                  {formatPHP(scenario.correctedPrice)}
                </span>
              </div>

              <div className="pt-3 sm:pt-4 border-t border-slate-800 flex items-center justify-between gap-2 animate-content-4">
                <span className="text-[11px] sm:text-sm font-bold text-slate-300 leading-tight">
                  Overcharge Prevented:
                </span>
                <span className="text-xs sm:text-lg font-black text-[#2563EB] font-mono tabular-nums bg-white px-3 py-1 rounded-full whitespace-nowrap shrink-0">
                  {`-${formatPHP(scenario.savings)}`}
                </span>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* =========================================================================
          THE REALITY: EDITORIAL SPLIT (CLEAN, NO BILL PILE)
         ========================================================================= */}
      <section className="border-t border-slate-300 pt-10 sm:pt-24 lg:pt-32 px-4 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16">
          {/* Left Column: Bold statement with scroll entrance */}
          <ScrollReveal direction="left" delay={50} className="lg:col-span-5 space-y-3 sm:space-y-4">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[#DC2626]">
              Philippine Healthcare Reality
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-[-0.03em] text-[#1E293B] leading-tight">
              Most families pay whatever the cashier asks at discharge.
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-normal">
              Hospital billing in the Philippines is hurried and opaque. Facing discharge bottlenecks, patients unknowingly absorb charges that are already legally covered.
            </p>
          </ScrollReveal>

          {/* Right Column: 3 Open Numbered Principles with Staggered Scroll Entrance */}
          <div className="lg:col-span-7 space-y-6 sm:space-y-8 divide-y divide-slate-200">
            <ScrollReveal direction="up" delay={150} className="pt-0 space-y-1.5 sm:space-y-2">
              <span className="text-[11px] sm:text-xs font-mono font-bold text-slate-400">01 / UNBUNDLING</span>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                Supplies already inside your Case Rate
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-normal">
                PhilHealth All-Case-Rates explicitly bundle operating room instruments, routine medications, and standard supplies into the tariff. Accredited hospitals cannot bill patients out-of-pocket for them.
              </p>
            </ScrollReveal>

            <ScrollReveal direction="up" delay={280} className="pt-6 sm:pt-8 space-y-1.5 sm:space-y-2">
              <span className="text-[11px] sm:text-xs font-mono font-bold text-slate-400">02 / SEQUENCE</span>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                Statutory deductions must come first
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-normal">
                Per RA 9994, RA 10754, and PhilHealth Advisory 2023-0036, the 12% VAT exemption and 20% discount apply BEFORE PhilHealth deductions. Reversing this sequence shrinks your statutory privilege.
              </p>
            </ScrollReveal>

            <ScrollReveal direction="up" delay={400} className="pt-6 sm:pt-8 space-y-1.5 sm:space-y-2">
              <span className="text-[11px] sm:text-xs font-mono font-bold text-slate-400">03 / TARIFFS</span>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                Obsolete benefit thresholds
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-normal">
                Circular 2024-0037+ increased case rate caps by up to 50%. BillLens PH verifies your statement uses the latest active tariff, recovering thousands in under-deductions.
              </p>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* =========================================================================
          THE PROCESS: CLEAN 3-STEP FLOW (NO CLIPBOARD)
         ========================================================================= */}
      <section className="space-y-8 sm:space-y-12 max-w-7xl mx-auto px-4">
        <ScrollReveal direction="up" delay={50} className="text-center max-w-xl mx-auto space-y-1.5 sm:space-y-2">
          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">
            How It Works
          </span>
          <h2 className="text-xl sm:text-3xl font-extrabold tracking-[-0.03em] text-[#1E293B]">
            Three steps to financial clarity.
          </h2>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-12 text-center md:text-left">
          {/* Step 1 */}
          <ScrollReveal direction="up" delay={120} className="space-y-2 sm:space-y-3">
            <span className="text-2xl sm:text-3xl font-black font-mono text-slate-900 block">01</span>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">Snap Your Statement</h3>
            <p className="text-xs text-slate-600 leading-relaxed font-normal">
              Take photos of your hospital Itemized Statement of Account (ISA) or upload a PDF. We calibrate and extract every single line.
            </p>
          </ScrollReveal>

          {/* Step 2 */}
          <ScrollReveal direction="up" delay={240} className="space-y-2 sm:space-y-3">
            <span className="text-2xl sm:text-3xl font-black font-mono text-[#2563EB] block">02</span>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">Cross-Check the Law</h3>
            <p className="text-xs text-slate-600 leading-relaxed font-normal">
              Every item is tested against 9,400+ PhilHealth case rates, DOH Drug Price References, and statutory tax rules.
            </p>
          </ScrollReveal>

          {/* Step 3 */}
          <ScrollReveal direction="up" delay={360} className="space-y-2 sm:space-y-3">
            <span className="text-2xl sm:text-3xl font-black font-mono text-slate-900 block">03</span>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">Settle with Confidence</h3>
            <p className="text-xs text-slate-600 leading-relaxed font-normal">
              Print a formal A4 Negotiation Brief to present directly to the billing counter or Malasakit Center social worker.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* =========================================================================
          STATUTORY PROTECTIONS: UNIFIED ARCHITECTURAL BADGES (NO PASTELS)
         ========================================================================= */}
      <section className="border-t border-slate-300 pt-10 sm:pt-20 space-y-6 sm:space-y-8 px-4 max-w-7xl mx-auto">
        <ScrollReveal direction="up" delay={50} className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 sm:gap-4">
          <div className="space-y-1 sm:space-y-2">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">
              Philippine Legal Basis
            </span>
            <h2 className="text-xl sm:text-3xl font-extrabold tracking-[-0.03em] text-[#1E293B]">
              The statutes protecting you.
            </h2>
          </div>
          <p className="text-xs text-slate-500 max-w-sm">
            Every audit determination references published republic acts and government circulars.
          </p>
        </ScrollReveal>

        <div className="divide-y divide-slate-200">
          {STATUTES.map((item, idx) => (
            <ScrollReveal
              key={item.code}
              direction="up"
              delay={60 * (idx + 1)}
              className="py-3.5 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2"
            >
              <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
                <span className="font-mono text-[11px] sm:text-xs font-bold text-slate-900 bg-white border border-slate-300 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md shrink-0 shadow-2xs">
                  {item.code}
                </span>
                <span className="text-xs sm:text-sm font-bold text-slate-900">{item.title}</span>
              </div>
              <span className="text-[11px] sm:text-xs text-slate-600 sm:text-right">{item.summary}</span>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* =========================================================================
          FAQ ACCORDION: MINIMALIST & SPACIOUS (ANCHORED BOTTOM LINE - ZERO LAYOUT SHIFT)
         ========================================================================= */}
      <section className="border-t border-slate-300 pt-10 sm:pt-20 space-y-6 sm:space-y-8 px-4 max-w-3xl mx-auto">
        <ScrollReveal direction="up" delay={50} className="text-center space-y-1.5 sm:space-y-2">
          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">
            Clear Answers
          </span>
          <h2 className="text-xl sm:text-3xl font-extrabold tracking-[-0.03em] text-[#1E293B]">
            Frequently asked questions.
          </h2>
        </ScrollReveal>

        {/* Anchored height container: prevents bottom line and downstream CTA from moving when items expand/collapse */}
        <ScrollReveal
          direction="up"
          delay={150}
          className="min-h-[410px] sm:min-h-[285px] flex flex-col justify-start"
        >
          <div className="divide-y divide-slate-200">
            {FAQS.map((faq, i) => {
              const isOpen = openFaq === i;
              return (
                <div
                  key={i}
                  className="py-3 sm:py-4 cursor-pointer"
                  onMouseEnter={() => setOpenFaq(i)}
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="w-full flex items-center justify-between text-left gap-3 sm:gap-4 cursor-pointer group"
                  >
                    <h3
                      className={`text-sm sm:text-base font-bold transition-colors ${
                        isOpen
                          ? "text-[#2563EB]"
                          : "text-slate-900 group-hover:text-[#2563EB]"
                      }`}
                    >
                      {faq.q}
                    </h3>
                    <span
                      className={`transition-colors shrink-0 ${
                        isOpen
                          ? "text-[#2563EB]"
                          : "text-slate-400 group-hover:text-slate-700"
                      }`}
                    >
                      {isOpen ? <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5" /> : <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5" />}
                    </span>
                  </button>

                  <div
                    className={`grid transition-all duration-300 ease-out ${
                      isOpen
                        ? "grid-rows-[1fr] opacity-100 mt-2 sm:mt-2.5"
                        : "grid-rows-[0fr] opacity-0 mt-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-normal">
                        {faq.a}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollReveal>
      </section>

      {/* =========================================================================
          CLOSING CTA SECTION: STANDALONE SECTION WITH STABLE ANCHOR
         ========================================================================= */}
      <section className="!mt-3 sm:!mt-5 border-t border-slate-300 pt-10 sm:pt-20 pb-10 sm:pb-4 px-4 max-w-3xl mx-auto">
        <ScrollReveal
          direction="up"
          delay={80}
          className="bg-white rounded-2xl sm:rounded-3xl border border-slate-300 shadow-soft py-10 sm:py-20 px-4 sm:px-12 text-center space-y-4 sm:space-y-6 w-full"
        >
          <h2 className="text-2xl sm:text-4xl font-extrabold tracking-[-0.03em] text-[#1E293B] leading-tight">
            Never overpay a hospital bill again.
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto font-normal leading-relaxed">
            Audit your Statement of Account in less than two minutes. Know your rights before you sign or settle.
          </p>
          <div className="pt-1 sm:pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-3">
            <Link href="/scanner" className="w-full sm:w-auto">
              <Button
                size="md"
                className="w-full sm:w-auto px-6 sm:px-7 py-2.5 sm:py-3 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold rounded-full text-xs sm:text-sm h-11 sm:h-12 shadow-soft gap-2"
              >
                <Scan className="w-4 h-4 stroke-[2.2]" />
                <span>Audit a Statement Now</span>
                <ArrowRight className="w-4 h-4 ml-0.5" />
              </Button>
            </Link>
            <Link href="/rates" className="w-full sm:w-auto">
              <Button
                variant="outline"
                size="md"
                className="w-full sm:w-auto px-5 sm:px-6 py-2.5 sm:py-3 bg-white text-slate-800 border-slate-300 hover:bg-slate-50 font-bold rounded-full text-xs sm:text-sm h-11 sm:h-12 shadow-2xs"
              >
                <span>Explore Rates Directory</span>
              </Button>
            </Link>
          </div>
        </ScrollReveal>
      </section>

      {/* =========================================================================
          SPACIOUS FOOTER: UNIFIED SLATE & CHARCOAL PALETTE (MINIMAL ANIMATION)
         ========================================================================= */}
      <ScrollReveal direction="minimal" minimal delay={0} className="px-4 max-w-7xl mx-auto">
        <footer className="border-t border-slate-300 pt-8 sm:pt-12 pb-24 sm:pb-12 space-y-8 sm:space-y-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 text-xs text-slate-500">
            <div className="space-y-2.5 sm:space-y-3">
              <div className="flex items-center">
                <Image
                  src="/logo-wordmark.png"
                  alt="BillLens PH"
                  width={102}
                  height={40}
                  className="h-6 sm:h-7 w-auto object-contain"
                  style={{ width: "auto" }}
                />
              </div>
              <p className="leading-relaxed">
                Civic technology for Philippine medical billing transparency, statutory deduction verification, and patient financial advocacy.
              </p>
            </div>

            <div className="space-y-2">
              <span className="font-bold text-slate-900 block">Tools</span>
              <ul className="space-y-1.5">
                <li>
                  <Link href="/scanner" className="hover:text-[#2563EB] transition-colors">
                    Fast ISA Scanner
                  </Link>
                </li>
                <li>
                  <Link href="/rates" className="hover:text-[#2563EB] transition-colors">
                    PhilHealth ACR Directory
                  </Link>
                </li>
                <li>
                  <Link href="/audits" className="hover:text-[#2563EB] transition-colors">
                    Document Archive
                  </Link>
                </li>
                <li>
                  <Link href="/chatbot" className="hover:text-[#2563EB] transition-colors">
                    AI Billing Chatbot
                  </Link>
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <span className="font-bold text-slate-900 block">Official Portals</span>
              <ul className="space-y-1.5">
                <li>
                  <a
                    href="https://memberinquiry.philhealth.gov.ph"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-[#2563EB] transition-colors inline-flex items-center gap-1"
                  >
                    <span>PhilHealth Member Portal</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </li>
                <li>
                  <a
                    href="https://doh.gov.ph"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-[#2563EB] transition-colors inline-flex items-center gap-1"
                  >
                    <span>Department of Health</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </li>
                <li>
                  <a
                    href="https://ncsc.gov.ph"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-[#2563EB] transition-colors inline-flex items-center gap-1"
                  >
                    <span>Senior Commission (NCSC)</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <span className="font-bold text-slate-900 block">Compliance</span>
              <p className="leading-relaxed">
                Republic Act 10173 (Data Privacy Act of 2012) compliant. Independent civic platform not affiliated with PhilHealth or DOH.
              </p>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4 sm:pt-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-400 text-center sm:text-left">
            <span>© 2026 BillLens PH. Built for the Filipino People.</span>
            <span>Advisory determinations based on official published Philippine statutory rules.</span>
          </div>
        </footer>
      </ScrollReveal>
    </div>
  );
}