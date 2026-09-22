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
import { DocumentsView } from '../../../../components/DocumentsView';
import { FactsView } from '../../../../components/FactsView';
import { QuestionnaireView } from '../../../../components/QuestionnaireView';
import { TaxCalculatorView } from '../../../../components/TaxCalculatorView';
import { FilingPackageView } from '../../../../components/FilingPackageView';
import { AssessmentView } from '../../../../components/AssessmentView';
import { AdminConsoleView } from '../../../../components/AdminConsoleView';

type TabKey =
  | 'overview'
  | 'documents'
  | 'facts'
  | 'questionnaire'
  | 'calculator'
  | 'filing'
  | 'assessment'
  | 'admin';

export default function DashboardPage() {
  const params = useParams();
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();
  const householdId = params?.householdId as string;

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [household, setHousehold] = useState<HouseholdDto | null>(null);
  const [workspaces, setWorkspaces] = useState<readonly TaxYearWorkspaceDto[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(2025);
  const [workspace, setWorkspace] = useState<TaxYearWorkspaceDto | null>(null);
  const [readiness, setReadiness] = useState<WorkspaceReadinessDto | null>(null);
  const [activity, setActivity] = useState<readonly AuditEventDto[]>([]);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!householdId) return;

    const [hhRes, actRes, wsListRes] = await Promise.all([
      apiClient.getHousehold(householdId),
      apiClient.getAuditActivity(householdId, { limit: 10 }),
      apiClient.getWorkspaces(householdId),
    ]);

    if (hhRes.data) {
      setHousehold(hhRes.data);
    }

    if (wsListRes.data) {
      setWorkspaces(wsListRes.data);
    }

    const wsRes = await apiClient.getWorkspace(householdId, selectedYear);
    if (wsRes.data) {
      setWorkspace(wsRes.data);
      const readRes = await apiClient.getWorkspaceReadiness(householdId, selectedYear);
      if (readRes.data) {
        setReadiness(readRes.data);
      }
    }

    if (actRes.data) {
      setActivity(actRes.data);
    }
    setPageLoading(false);
  }, [householdId, selectedYear]);

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
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-600 text-white font-bold text-sm">
              LT
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 leading-tight">
                {household?.name || 'Tax Household'}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="text-xs text-slate-500">Tax Year:</span>
                {workspaces.length > 1 ? (
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="text-xs font-bold text-slate-800 bg-slate-100 rounded px-1.5 py-0.5 border border-slate-200 cursor-pointer"
                  >
                    {workspaces.map((w) => (
                      <option key={w.id} value={w.taxYear}>
                        {w.taxYear} ({w.status})
                      </option>
                    ))}
                  </select>
                ) : (
                  <strong className="text-xs text-slate-700">2025</strong>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right">
              <p className="text-xs font-semibold text-slate-800">{user?.email}</p>
              <p className="text-[10px] text-slate-400">Resident Taxpayer</p>
            </div>
            <button
              onClick={() => logout()}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 transition"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="border-t border-slate-200 bg-white px-4 sm:px-6">
          <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto py-2">
            {[
              { key: 'overview', label: 'Overview & Readiness' },
              { key: 'documents', label: 'Document Vault' },
              { key: 'facts', label: 'Confirmed Facts' },
              { key: 'questionnaire', label: 'Tax Profile & Checklist' },
              { key: 'calculator', label: `${selectedYear} Tax Engine` },
              { key: 'filing', label: 'Approvals & Filing Package' },
              { key: 'assessment', label: 'Assessment & Rollover' },
              { key: 'admin', label: 'Admin & Models' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as TabKey)}
                className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                  activeTab === tab.key
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-8">
        {activeTab === 'overview' && (
          <>
            {/* Top Metrics Grid */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Readiness Card */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
                  Return Readiness
                </h2>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-3xl font-extrabold text-slate-900">
                    {workspace?.completionScore ?? 0}%
                  </span>
                  <span className="text-xs text-slate-500 font-medium">overall completion</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden mb-4">
                  <div
                    className="bg-sky-600 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${workspace?.completionScore ?? 0}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500">
                  Status:{' '}
                  <strong className="text-slate-700 font-semibold uppercase">
                    {workspace?.status || 'Draft'}
                  </strong>
                </p>
              </div>

              {/* Tax Estimate Card */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Estimated Outcome
                  </h2>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                    Deterministic 2025
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-3xl font-extrabold text-slate-900">
                    {workspace?.estimatedTaxBalance
                      ? Number(workspace.estimatedTaxBalance) < 0
                        ? `Refund: €${Math.abs(Number(workspace.estimatedTaxBalance)).toFixed(2)}`
                        : `Due: €${Number(workspace.estimatedTaxBalance).toFixed(2)}`
                      : '€0.00'}
                  </span>
                </div>
                <button
                  onClick={() => setActiveTab('calculator')}
                  className="mt-2 text-xs font-semibold text-sky-600 hover:text-sky-700"
                >
                  View full calculation breakdown &rarr;
                </button>
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

                  {coFiler ? (
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-lg bg-purple-100 text-purple-700 font-bold text-xs flex items-center justify-center">
                          2
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{coFiler.user?.email}</p>
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

            {/* Quick Feature Cards */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div
                onClick={() => setActiveTab('documents')}
                className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs hover:border-sky-300 transition cursor-pointer"
              >
                <div className="h-10 w-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold text-lg mb-4">
                  📄
                </div>
                <h3 className="font-bold text-slate-900 text-sm mb-1">Document Vault</h3>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  Upload salary certificates, mortgage interest slips, and verify extracted figures.
                </p>
                <span className="text-xs font-semibold text-sky-600">Open Vault &rarr;</span>
              </div>

              <div
                onClick={() => setActiveTab('questionnaire')}
                className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs hover:border-sky-300 transition cursor-pointer"
              >
                <div className="h-10 w-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-lg mb-4">
                  📝
                </div>
                <h3 className="font-bold text-slate-900 text-sm mb-1">Tax Profile & Checklist</h3>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  Answer residency and deduction questions, and resolve missing evidence tasks.
                </p>
                <span className="text-xs font-semibold text-purple-600">Open Checklist &rarr;</span>
              </div>

              <div
                onClick={() => setActiveTab('filing')}
                className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs hover:border-sky-300 transition cursor-pointer"
              >
                <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg mb-4">
                  📦
                </div>
                <h3 className="font-bold text-slate-900 text-sm mb-1">Approvals & Filing Package</h3>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  Review dual spousal approvals, Form 100 boxes, and MyGuichet manual filing guide.
                </p>
                <span className="text-xs font-semibold text-emerald-600">View Filing Package &rarr;</span>
              </div>
            </section>

            {/* Recent Activity Audit Trail */}
            <section className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
                Immutable Household Activity Trail
              </h2>
              {activity.length === 0 ? (
                <p className="text-xs text-slate-400">No activity recorded yet.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {activity.map((event) => (
                    <div key={event.id} className="py-3 flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold text-slate-800">{event.description}</p>
                        <span className="text-[10px] text-slate-400">
                          Actor: {event.actorEmail || event.actorId.substring(0, 8)} •{' '}
                          {new Date(event.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 shrink-0">
                        {event.eventType}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {activeTab === 'documents' && workspace && (
          <DocumentsView workspaceId={workspace.id} onFactsChanged={loadData} />
        )}

        {activeTab === 'facts' && workspace && (
          <FactsView workspaceId={workspace.id} onFactsChanged={loadData} />
        )}

        {activeTab === 'questionnaire' && workspace && (
          <QuestionnaireView workspaceId={workspace.id} onProfileUpdated={loadData} />
        )}

        {activeTab === 'calculator' && workspace && (
          <TaxCalculatorView
            workspaceId={workspace.id}
            onCalculated={loadData}
            onNavigateToFiling={() => setActiveTab('filing')}
          />
        )}

        {activeTab === 'filing' && workspace && household && (
          <FilingPackageView
            workspace={workspace}
            household={household}
            onRefresh={loadData}
            onNavigateToCalculator={() => setActiveTab('calculator')}
          />
        )}

        {activeTab === 'assessment' && workspace && (
          <AssessmentView workspace={workspace} onRefresh={loadData} />
        )}

        {activeTab === 'admin' && <AdminConsoleView />}
      </main>

      {/* Invite Modal */}
      {household && (
        <InviteModal
          isOpen={isInviteOpen}
          onClose={() => setIsInviteOpen(false)}
          householdId={household.id}
          onSuccess={() => loadData()}
        />
      )}
    </div>
  );
}
