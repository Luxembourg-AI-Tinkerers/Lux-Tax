'use client';

import React from 'react';
import { Calculator, FileCheck2, Landmark, ShieldCheck, Users } from 'lucide-react';

interface AuthShellProps {
  children: React.ReactNode;
}

const HIGHLIGHTS = [
  {
    icon: Calculator,
    title: 'Deterministic ACD Tax Engine',
    description: 'Exact Art. 118–126 LIR progressive scales, deductions, credits, and Class 2 comparisons.',
  },
  {
    icon: Users,
    title: 'Dual-Filer Household Vault',
    description: 'Separate spouse logins, private document drafts, and shared versioned return approvals.',
  },
  {
    icon: FileCheck2,
    title: 'Form 100 & MyGuichet Ready',
    description: 'Line-by-line box mappings, SHA-256 package integrity, and ACD assessment reconciliation.',
  },
];

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-950 text-white shadow-xs ring-1 ring-zinc-800">
        <Landmark className="h-4.5 w-4.5 text-sky-400" strokeWidth={1.9} aria-hidden="true" />
      </div>
      {!compact && (
        <div className="text-left">
          <span className="block text-sm font-bold tracking-tight text-zinc-950">
            Luxembourg Tax
          </span>
          <span className="block text-[11px] font-medium text-zinc-500">
            Personal &amp; Joint Workspace
          </span>
        </div>
      )}
    </div>
  );
}

export function AuthShell({ children }: AuthShellProps) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-12">
      {/* Left obsidian editorial context panel */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-zinc-950 px-10 py-12 text-white lg:col-span-5 lg:flex xl:px-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.055]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #a1a1aa 1px, transparent 1px), linear-gradient(to bottom, #a1a1aa 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl"
        />

        <div className="relative z-10">
          <div className="inline-flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.08] ring-1 ring-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
              <Landmark className="h-5 w-5 text-sky-400" strokeWidth={1.8} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight text-white">
                Luxembourg Tax Workspace
              </p>
              <p className="text-[11px] font-medium text-zinc-400">
                Form 100 · ACD Resident Filing
              </p>
            </div>
          </div>

          <div className="mt-14 max-w-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-[11px] font-semibold text-zinc-200">
              <ShieldCheck className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
              <span>Tax Years 2025 &amp; 2026</span>
            </span>
            <h2 className="mt-5 text-3xl font-bold tracking-[-0.025em] text-white text-balance leading-[1.15]">
              Prepare your Luxembourg tax return with clear provenance.
            </h2>
            <p className="mt-3.5 text-sm leading-relaxed text-zinc-400 text-pretty">
              Every figure traced back to source certificates, reviewed by both spouses, and mapped directly to official Form 100 boxes.
            </p>
          </div>

          <ul className="mt-10 space-y-4">
            {HIGHLIGHTS.map((item) => {
              const Icon = item.icon;
              return (
                <li
                  key={item.title}
                  className="flex items-start gap-3.5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.07] text-sky-400 ring-1 ring-white/10">
                    <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white">{item.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
                      {item.description}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="relative z-10 border-t border-white/10 pt-6 text-[11px] text-zinc-500">
          Private evidence vault · Audit-logged calculations · MyGuichet transfer guide
        </div>
      </aside>

      {/* Right form stage */}
      <main className="flex items-center justify-center bg-[#f6f7f9] px-4 py-8 sm:px-8 lg:col-span-7">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
