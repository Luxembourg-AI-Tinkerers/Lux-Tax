'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../../lib/auth-context';
import { apiClient } from '../../../../lib/api';
import {
  HouseholdDto,
  TaxYearWorkspaceDto,
  WorkspaceReadinessDto,
  AuditEventDto,
  HouseholdRole,
} from '@luxtax/contracts';
import { InviteModal } from '../../../../components/InviteModal';

export default function DashboardPage() {
  const params = useParams();
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();
  const householdId = params?.householdId as string;

  const [household, setHousehold] = useState<HouseholdDto | null>(null);
  const [workspace, setWorkspace] = useState<TaxYearWorkspaceDto | null>(null);
  const [readiness, setReadiness] = useState<WorkspaceReadinessDto | null>(null);
  const [activity, setActivity] = useState<readonly AuditEventDto[]>([]);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!householdId) return;

    const [hhRes, actRes] = await Promise.all([
      apiClient.getHousehold(householdId),
      apiClient.getAuditActivity(householdId, { limit: 10 }),
    ]);

    if (hhRes.data) {
      setHousehold(hhRes.data);
      // Fetch 2025 workspace
      const wsRes = await apiClient.getWorkspace(householdId, 2025);
      if (wsRes.data) {
        setWorkspace(wsRes.data);
        const readRes = await apiClient.getWorkspaceReadiness(householdId, 2025);
        if (readRes.data) {
          setReadiness(readRes.data);
        }
      }
    }

    if (actRes.data) {
      setActivity(actRes.data);
    }
    setPageLoading(false);
  }, [householdId]);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    loadData();
  }, [user, isLoading, router, loadData]);

  if (pageLoading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent mx-auto mb-2" />
          <p className="text-slate-500 text-sm">Loading tax workspace...</p>
        </div>
      </div>
    );
  }

  const members = household?.members || [];
  const primaryFiler = members.find((m) => m.role === HouseholdRole.PRIMARY_FILER);
  const coFiler = members.find((m) => m.role === HouseholdRole.CO_FILER);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-600 text-white font-bold text-sm">
              LT
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 leading-tight">
                {household?.name || 'Tax Household'}
              </h1>
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Active Tax Year: <strong className="text-slate-700">2025</strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-slate-800">{user?.email}</p>
              <p className="text-[10px] text-slate-400">Authenticated Co-Filer</p>
            </div>
            <button
              onClick={() => logout()}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-8">
        {/* Status & Readiness Overview */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Readiness Card */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
              Return Readiness
            </h2>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-3xl font-extrabold text-slate-900">
                {readiness?.overallPercentage ?? 10}%
              </span>
              <span className="text-xs text-slate-500 font-medium">overall completion</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden mb-4">
              <div
                className="bg-sky-600 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${readiness?.overallPercentage ?? 10}%` }}
              />
            </div>
            <p className="text-xs text-slate-500">
              Workspace initialized for Luxembourg Personal Income Tax (Form 100 / Decompte).
            </p>
          </div>

          {/* Tax Estimate Card */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Estimated Outcome
              </h2>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60">
                Draft Estimate
              </span>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-3xl font-extrabold text-slate-900">
                {workspace?.estimatedTaxBalance ? `€${workspace.estimatedTaxBalance}` : '€0.00'}
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Based on confirmed evidence facts. Exact tax calculation will update as documents and salary certificates are processed.
            </p>
          </div>

          {/* Household Co-Filer Card */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Household Co-Filers
              </h2>
              {!coFiler && (
                <button
                  onClick={() => setIsInviteOpen(true)}
                  className="text-xs text-sky-600 hover:text-sky-700 font-semibold"
                >
                  + Invite Spouse
                </button>
              )}
            </div>

            <div className="space-y-3">
              {/* Primary Filer */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-sky-100 text-sky-700 font-bold text-xs flex items-center justify-center">
                    1
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-800">
                      {primaryFiler?.user?.email || 'Primary Filer'}
                    </p>
                    <p className="text-[10px] text-slate-400">Primary Taxpayer</p>
                  </div>
                </div>
                <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                  Active
                </span>
              </div>

              {/* Co-Filer */}
              {coFiler ? (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-purple-100 text-purple-700 font-bold text-xs flex items-center justify-center">
                      2
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">
                        {coFiler.user?.email}
                      </p>
                      <p className="text-[10px] text-slate-400">Spouse (Co-Filer)</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                    Active
                  </span>
                </div>
              ) : (
                <div className="p-3 rounded-xl border border-dashed border-slate-200 text-center">
                  <p className="text-xs text-slate-500 mb-2">No spouse linked yet</p>
                  <button
                    onClick={() => setIsInviteOpen(true)}
                    className="py-1.5 px-3 rounded-lg bg-sky-50 text-sky-600 font-semibold text-xs hover:bg-sky-100 transition"
                  >
                    Send Spousal Invitation
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Action Modules */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs hover:border-sky-300 transition cursor-pointer">
            <div className="h-10 w-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold text-lg mb-4">
              📄
            </div>
            <h3 className="font-bold text-slate-900 text-sm mb-1">Document Vault</h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              Upload salary certificates (Certificat de salaire), mortgage interest attestations, and pension contributions.
            </p>
            <span className="text-xs font-semibold text-sky-600">Open Vault &rarr;</span>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs hover:border-sky-300 transition cursor-pointer">
            <div className="h-10 w-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-lg mb-4">
              📝
            </div>
            <h3 className="font-bold text-slate-900 text-sm mb-1">Tax Profile Questionnaire</h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              Answer plain-language questions regarding tax residency, marital status, children, and eligible deductions.
            </p>
            <span className="text-xs font-semibold text-purple-600">Start Questionnaire &rarr;</span>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs hover:border-sky-300 transition cursor-pointer">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg mb-4">
              ⚖️
            </div>
            <h3 className="font-bold text-slate-900 text-sm mb-1">Review & Joint Approval</h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              Inspect the evidence-linked Form 100 draft. Both spouses must approve before filing packages are produced.
            </p>
            <span className="text-xs font-semibold text-emerald-600">Review Draft &rarr;</span>
          </div>
        </section>

        {/* Chronological Household Activity Audit Feed */}
        <section className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Household Audit & Activity Feed</h3>
              <p className="text-xs text-slate-500">
                Immutable record of all changes, uploads, invitations, and approvals with actor attribution.
              </p>
            </div>
            <button
              onClick={loadData}
              className="text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              Refresh
            </button>
          </div>

          <div className="space-y-4">
            {activity.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No activity recorded yet.</p>
            ) : (
              activity.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-3 p-3 rounded-xl bg-slate-50/70 border border-slate-100 text-xs"
                >
                  <div className="h-2 w-2 rounded-full bg-sky-500 mt-1.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-slate-800">{event.description}</p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                      <span>Actor: {event.actorEmail || event.actorId}</span>
                      <span>&bull;</span>
                      <span>{new Date(event.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <span className="font-mono text-[10px] text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-200 shrink-0">
                    {event.eventType}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {/* Spousal Invitation Modal */}
      {household && (
        <InviteModal
          householdId={household.id}
          isOpen={isInviteOpen}
          onClose={() => setIsInviteOpen(false)}
          onSuccess={loadData}
        />
      )}
    </div>
  );
}
