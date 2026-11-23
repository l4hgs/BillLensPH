"use client";

import React from "react";

function ArchiveStatementRowsSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="py-3.5 sm:py-5 px-1 sm:px-3 flex items-center gap-3 sm:gap-4"
        >
          <div className="w-16 h-20 sm:w-20 sm:h-24 md:w-24 md:h-28 rounded-xl bg-slate-100 border border-slate-200/60 shrink-0" />
          <div className="flex-1 min-w-0 flex items-center justify-between gap-3 sm:gap-4 py-1">
            <div className="space-y-2 flex-1 min-w-0">
              <div className="h-5 w-48 sm:w-64 rounded bg-slate-200/70" />
              <div className="h-3 w-36 sm:w-48 rounded bg-slate-100" />
              <div className="flex items-center gap-2 pt-0.5">
                <div className="h-5 w-28 rounded-full bg-slate-100" />
                <div className="h-5 w-24 rounded-full bg-slate-100" />
              </div>
            </div>
            <div className="h-5 w-24 rounded bg-slate-200/70 shrink-0" />
          </div>
          <div className="w-[44px] h-[44px] flex items-center justify-center shrink-0">
            <div className="h-4 w-4 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </>
  );
}

/**
 * Full-page layout-matched skeleton for /audits (Archive Page).
 * Mirrors the editorial header + metric, search bar, filter tabs, and 5 statement rows.
 */
export function ArchiveFullSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading audited hospital statements"
      className="w-full max-w-none space-y-4 sm:space-y-6 animate-pulse motion-reduce:animate-none"
    >
      <span className="sr-only">Loading audited hospital statements...</span>

      {/* Editorial Header + Metric Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-4 border-b border-slate-200/80 pb-4 sm:pb-6">
        <div className="space-y-2 flex-1 min-w-0">
          <div className="h-7 sm:h-9 w-64 sm:w-80 rounded-lg bg-slate-200/70" />
          <div className="h-4 w-72 sm:w-[460px] max-w-full rounded bg-slate-100" />
        </div>
        <div className="shrink-0 sm:text-right sm:border-l sm:border-slate-200/80 sm:pl-6 space-y-1.5">
          <div className="h-3 w-32 sm:ml-auto rounded bg-slate-100" />
          <div className="h-7 w-28 sm:ml-auto rounded-md bg-slate-200/70" />
        </div>
      </div>

      {/* Search Bar Skeleton */}
      <div className="h-[44px] w-full rounded-xl bg-white border border-slate-200/80 px-4 flex items-center gap-3">
        <div className="h-4 w-4 rounded-full bg-slate-200/70 shrink-0" />
        <div className="h-3.5 w-56 sm:w-72 rounded bg-slate-100" />
      </div>

      {/* Filter Tabs Skeleton */}
      <div className="flex items-center gap-6 border-b border-slate-200/80 pb-3 pt-1">
        <div className="h-4 w-12 rounded bg-slate-100" />
        <div className="h-4 w-16 rounded bg-slate-200/80" />
        <div className="h-4 w-24 rounded bg-slate-100" />
        <div className="h-4 w-14 rounded bg-slate-100" />
      </div>

      {/* Statement Rows Skeleton */}
      <div className="divide-y divide-slate-200/80 border-b border-slate-200/80">
        <ArchiveStatementRowsSkeleton />
      </div>
    </div>
  );
}

/**
 * Layout-matched skeleton for /audits (Archive Page) statement rows only.
 * Header, search bar, and filter tabs stay visible while loading.
 */
export function ArchivePageSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading audited hospital statements"
      className="divide-y divide-slate-200/80 border-b border-slate-200/80 animate-pulse motion-reduce:animate-none"
    >
      <span className="sr-only">Loading audited hospital statements...</span>

      <ArchiveStatementRowsSkeleton />
    </div>
  );
}

/**
 * Layout-matched skeleton for /audits/[id] (Audit Studio Detail View)
 * Mirrors compact header, split white viewer + financial summary, 4-tab filter, and 5 line items.
 */
export function AuditDetailSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading audit workspace"
      className="w-full max-w-none space-y-4 sm:space-y-5 animate-pulse motion-reduce:animate-none"
    >
      <span className="sr-only">Loading audit details...</span>

      {/* Back Link Placeholder */}
      <div className="h-4 w-32 rounded bg-slate-100" />

      {/* Top Context & Action Bar Skeleton */}
      <header className="w-full border-b border-slate-200/80 pb-3.5 sm:pb-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
          <div className="space-y-2 flex-1 min-w-0">
            <div className="h-7 w-64 sm:w-80 rounded-lg bg-slate-200/70" />
            <div className="h-4 w-72 sm:w-96 rounded bg-slate-100" />
            <div className="h-5 w-52 rounded-md bg-slate-100" />
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
            <div className="h-[44px] w-32 rounded-full bg-slate-200/70" />
            <div className="h-[44px] w-28 rounded-full bg-slate-100 border border-slate-200/60" />
            <div className="h-[44px] w-24 rounded-full bg-slate-100" />
          </div>
        </div>

        {/* Compact Privilege & PhilHealth Strip Placeholder */}
        <div className="h-4 w-72 sm:w-96 rounded bg-slate-100" />
      </header>

      {/* Two-Column Split Workspace Skeleton */}
      <div className="flex flex-col lg:flex-row lg:items-start">
        {/* Left Column: Clean White Statement Viewer Skeleton */}
        <div className="w-full lg:w-[42%] lg:mr-8 mb-5 lg:mb-0 shrink-0">
          <div className="rounded-2xl border border-slate-200 bg-white h-[calc(100vh-9.5rem)] min-h-[420px] flex flex-col overflow-hidden">
            <div className="border-b border-slate-200/80 px-4 py-2.5 flex items-center justify-between">
              <div className="h-4 w-40 rounded bg-slate-200/70" />
              <div className="flex items-center gap-1.5">
                <div className="h-7 w-24 rounded-full bg-slate-100" />
                <div className="h-7 w-7 rounded-full bg-slate-100" />
              </div>
            </div>
            <div className="flex-1 p-5 bg-white">
              <div className="w-full h-full rounded-lg bg-slate-100 border border-slate-200/60" />
            </div>
          </div>
        </div>

        {/* Right Column: KPIs, 4-Tab Filter, and 5 Line Items Skeleton */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* 3-Column Financial KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80 border-b border-slate-200/80 pb-3.5 gap-3 sm:gap-0">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="sm:px-4 first:pl-0 last:pr-0 space-y-1.5">
                <div className="h-3 w-24 rounded bg-slate-100" />
                <div className="h-7 w-32 rounded-md bg-slate-200/70" />
                <div className="h-3 w-28 rounded bg-slate-100" />
              </div>
            ))}
          </div>

          {/* Slim Proportional Bar */}
          <div className="h-1.5 w-full rounded-full bg-slate-100" />

          {/* 4-Tab Bucket Filter Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 p-1 rounded-xl bg-slate-100/80 border border-slate-200/60">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="min-h-[54px] px-3 py-2 rounded-lg bg-white/80 space-y-1.5"
              >
                <div className="h-3 w-20 rounded bg-slate-200/70" />
                <div className="h-4 w-16 rounded bg-slate-100" />
              </div>
            ))}
          </div>

          {/* Line Items Section */}
          <div className="space-y-3 pt-1">
            <div className="h-5 w-28 rounded bg-slate-200/70" />
            <div className="divide-y divide-slate-200/80 border-y border-slate-200/80">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="py-4 sm:py-5 px-2 sm:px-3 flex items-center justify-between gap-4">
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="h-4 w-48 sm:w-64 rounded bg-slate-200/70" />
                    <div className="h-3 w-36 rounded bg-slate-100" />
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-slate-200" />
                      <div className="h-4 w-20 rounded bg-slate-200/70" />
                    </div>
                    <div className="hidden sm:block h-4 w-px bg-slate-200/80" />
                    <div className="h-9 w-9 rounded-lg bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Layout-matched skeleton for /audits/[id]/brief (Export Brief)
 * Mirrors toolbar actions and formal negotiation brief document structure.
 */
export function NegotiationBriefSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label="Preparing formal negotiation brief"
      className="w-full max-w-none space-y-6 animate-pulse motion-reduce:animate-none"
    >
      <span className="sr-only">Preparing formal negotiation brief...</span>

      {/* Toolbar Skeleton (Clean Header Band) */}
      <div className="flex flex-col gap-3 border-b border-slate-200/80 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-[44px] w-[44px] rounded-full bg-slate-100 border border-slate-200/60 shrink-0" />
          <div className="space-y-2">
            <div className="h-5 w-64 rounded bg-slate-200/70" />
            <div className="h-3.5 w-52 rounded bg-slate-100" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-[44px] w-36 rounded-full bg-slate-100" />
          <div className="h-[44px] w-28 rounded-full bg-slate-100" />
          <div className="h-[44px] w-36 rounded-full bg-slate-200/70" />
        </div>
      </div>

      {/* Brief Document Skeleton */}
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200/80 bg-white p-6 sm:p-10 space-y-6">
        {/* Document Header */}
        <div className="border-b border-slate-200/80 pb-5 flex flex-col sm:flex-row sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="h-6 w-56 rounded bg-slate-200/70" />
            <div className="h-4 w-72 rounded bg-slate-100" />
            <div className="h-3.5 w-48 rounded bg-slate-100" />
          </div>
          <div className="space-y-2 sm:text-right">
            <div className="h-4 w-32 sm:ml-auto rounded bg-slate-100" />
            <div className="h-3.5 w-40 sm:ml-auto rounded bg-slate-100" />
          </div>
        </div>

        {/* Financial Audit Summary Table */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-b border-slate-200/80 pb-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-24 rounded bg-slate-100" />
              <div className="h-6 w-28 rounded bg-slate-200/70" />
            </div>
          ))}
        </div>

        {/* Statutory & PhilHealth Findings */}
        <div className="space-y-3">
          <div className="h-4 w-48 rounded bg-slate-200/70" />
          <div className="border-l-2 border-slate-200 pl-3.5 space-y-2">
            <div className="h-4 w-64 rounded bg-slate-200/70" />
            <div className="h-3.5 w-full rounded bg-slate-100" />
            <div className="h-3.5 w-3/4 rounded bg-slate-100" />
          </div>
        </div>

        {/* Itemized Table Rows */}
        <div className="divide-y divide-slate-200/80 border-y border-slate-200/80">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="py-3 flex items-center justify-between gap-4">
              <div className="h-4 w-56 rounded bg-slate-100" />
              <div className="h-4 w-24 rounded bg-slate-200/70" />
            </div>
          ))}
        </div>

        {/* Signatory Block */}
        <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="h-3 w-24 rounded bg-slate-100" />
            <div className="h-5 w-44 rounded bg-slate-200/70" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-28 rounded bg-slate-100" />
            <div className="h-5 w-40 rounded bg-slate-100" />
          </div>
        </div>
      </div>
    </div>
  );
}
