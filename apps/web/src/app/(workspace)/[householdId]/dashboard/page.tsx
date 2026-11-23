'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Briefcase,
  Check,
  ClipboardList,
  FileText,
  PackageCheck,
  RefreshCw,
  UserPlus,
} from 'lucide-react';
import { HelpTip } from '../../../../components/HelpTip';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../../lib/auth-context';
import { apiClient } from '../../../../lib/api';
import {
  HouseholdDto,
  TaxYearWorkspaceDto,
  WorkspaceReadinessDto,
  AuditEventDto,
  HouseholdRole,
  WorkspaceStatus,
} from '@luxtax/contracts';
import { InviteModal } from '../../../../components/InviteModal';
import { DocumentsView } from '../../../../components/DocumentsView';
import { FreelanceBusinessView } from '../../../../components/FreelanceBusinessView';
import { FactsView } from '../../../../components/FactsView';
import { QuestionnaireView } from '../../../../components/QuestionnaireView';
import { TaxCalculatorView } from '../../../../components/TaxCalculatorView';
import { FilingPackageView } from '../../../../components/FilingPackageView';
import { AssessmentView } from '../../../../components/AssessmentView';
import { AdminConsoleView } from '../../../../components/AdminConsoleView';
import { WorkspaceShell, type TabKey } from '../../../../components/WorkspaceShell';
import { NO_AMOUNT, formatEuro } from '../../../../lib/money';
import { CardGridSkeleton, Skeleton } from '../../../../components/ui/Skeleton';
import { StatusBadge, type BadgeTone } from '../../../../components/ui/StatusBadge';

function workspaceStatusTone(status?: WorkspaceStatus): BadgeTone {
  switch (status) {
    case WorkspaceStatus.APPROVED:
    case WorkspaceStatus.FILING_PACKAGE_READY:
    case WorkspaceStatus.ASSESSED:
      return 'success';
    case WorkspaceStatus.FILED:
    case WorkspaceStatus.CLOSED:
      return 'indigo';
    case WorkspaceStatus.NEEDS_REVIEW:
      return 'warning';
    case WorkspaceStatus.CALCULATED:
    case WorkspaceStatus.READY_TO_CALCULATE:
    case WorkspaceStatus.HOUSEHOLD_REVIEW:
      return 'info';
    default:
      return 'neutral';
  }
}

function initialsFrom(firstName?: string, lastName?: string, email?: string, fallback = 'U'): string {
  if (firstName || lastName) {
    return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || fallback;
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return fallback;
}

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
  const [pageError, setPageError] = useState('');

  const didMountTabEffect = useRef(false);
  useEffect(() => {
    if (!didMountTabEffect.current) {
      didMountTabEffect.current = true;
      return;
    }
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [activeTab]);

  const loadData = useCallback(async () => {
    if (!householdId) {
      // Nothing can be loaded without a household: say so instead of leaving
      // the page on its loading spinner forever.
      setPageError('This URL carries no household identifier, so no tax workspace could be loaded.');
      setPageLoading(false);
      return;
    }

    setPageError('');

    const [hhRes, actRes, wsListRes] = await Promise.all([
      apiClient.getHousehold(householdId),
      apiClient.getAuditActivity(householdId, { limit: 10 }),
      apiClient.getWorkspaces(householdId),
    ]);

    if (hhRes.data) {
      setHousehold(hhRes.data);
    } else {
      setHousehold(null);
    }

    if (wsListRes.data) {
      setWorkspaces(wsListRes.data);
    } else {
      setWorkspaces([]);
    }

    if (actRes.data) {
      setActivity(actRes.data);
    } else {
      setActivity([]);
    }

    const wsRes = await apiClient.getWorkspace(householdId, selectedYear);
    if (wsRes.data) {
      setWorkspace(wsRes.data);
      const readRes = await apiClient.getWorkspaceReadiness(householdId, selectedYear);
      if (readRes.data) {
        setReadiness(readRes.data);
      } else {
        setReadiness(null);
        if (readRes.error) setPageError(readRes.error);
      }
    } else {
      setWorkspace(null);
      setReadiness(null);
    }

    const firstError = wsRes.error || hhRes.error || wsListRes.error || actRes.error;
    if (firstError) {
      setPageError(firstError);
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
      <div className="flex min-h-dvh bg-[#f6f7f9] dark:bg-[#0e1014]">
        <aside className="hidden w-[264px] shrink-0 border-r border-zinc-200/85 bg-[#fcfcfd] p-4 lg:flex lg:flex-col lg:gap-5 dark:border-zinc-800/80 dark:bg-[#12141a]">
          <div className="flex items-center gap-2.5 pb-3 border-b border-zinc-200/70 dark:border-zinc-800/70">
            <Skeleton className="h-9 w-9 rounded-xl" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-2.5 w-20" />
            </div>
          </div>
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, idx) => (
              <Skeleton key={idx} className="h-8 w-full rounded-xl" />
            ))}
          </div>
        </aside>
        <div className="flex-1">
          <div className="h-15 border-b border-zinc-200/80 bg-[#f6f7f9] px-4 sm:px-6 lg:px-8 flex items-center justify-between dark:border-zinc-800/80 dark:bg-[#0e1014]">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-8 w-24 rounded-xl" />
          </div>
          <main className="mx-auto max-w-[1360px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Loading tax workspace...</p>
            <CardGridSkeleton count={3} />
          </main>
        </div>
      </div>
    );
  }

  const members = household?.members || [];
  const primaryFiler = members.find((m) => m.role === HouseholdRole.PRIMARY_FILER);
  const coFiler = members.find((m) => m.role === HouseholdRole.CO_FILER);

  const balance = workspace?.estimatedTaxBalance;
  const hasBalance = balance !== undefined && balance !== null && balance !== '';
  const balanceNumeric = hasBalance ? Number(balance) : null;
  const isRefund = balanceNumeric !== null && balanceNumeric < 0;

  // A missing balance is not a zero: show a dash until the engine has produced
  // a figure.
  const balanceLabel = !hasBalance
    ? NO_AMOUNT
    : isRefund
      ? `Refund: ${formatEuro(Math.abs(balanceNumeric!))}`
      : `Due: ${formatEuro(balanceNumeric!)}`;

  const completionScore = workspace?.completionScore ?? 0;

  /** Keyboard activation for the cards that behave like buttons. */
  const cardKeyboard = (tab: TabKey) => (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setActiveTab(tab);
    }
  };

  // Determine contextual recommended next action
  const nextRecommendation: { label: string; tab: TabKey; hint: string } = !workspace
    ? { label: 'Open Tax Profile', tab: 'questionnaire', hint: 'Configure your household profile' }
    : completionScore < 50
    ? {
        label: 'Complete Profile & Facts',
        tab: 'questionnaire',
        hint: 'Finish your household questionnaire or upload certificates so the engine has all inputs.',
      }
    : !hasBalance
    ? {
        label: `Calculate ${selectedYear} Tax`,
        tab: 'calculator',
        hint: 'Run the deterministic Luxembourg scale to preview your refund or balance due.',
      }
    : workspace.status !== WorkspaceStatus.APPROVED &&
      workspace.status !== WorkspaceStatus.FILING_PACKAGE_READY &&
      workspace.status !== WorkspaceStatus.FILED
    ? {
        label: 'Review & Approve Return',
        tab: 'filing',
        hint: 'Confirm your calculation and generate your Form 100 MyGuichet package.',
      }
    : workspace.status !== WorkspaceStatus.FILED
    ? {
        label: 'Record Filing & Assessment',
        tab: 'assessment',
        hint: 'Freeze the approved version once submitted on MyGuichet, or import your ACD notice.',
      }
    : {
        label: 'Manage Assessment & Rollover',
        tab: 'assessment',
        hint: 'Compare your official ACD bulletin or roll over into the next tax year.',
      };

  const userDisplayName =
    user?.firstName || user?.lastName
      ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
      : user?.email;

  const userInitials = initialsFrom(user?.firstName, user?.lastName, user?.email, 'U');

  return (
    <>
      <WorkspaceShell
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        householdName={household?.name || 'Tax Household'}
        selectedYear={selectedYear}
        onSelectYear={setSelectedYear}
        workspaces={workspaces}
        workspace={workspace}
        statusTone={workspaceStatusTone(workspace?.status)}
        completionScore={completionScore}
        hasBalance={hasBalance}
        isRefund={isRefund}
        balanceLabel={balanceLabel}
        hasCoFiler={Boolean(coFiler)}
        onOpenInvite={() => setIsInviteOpen(true)}
        userDisplayName={userDisplayName}
        userEmail={user?.email}
        userInitials={userInitials}
        onLogout={() => logout()}
      >
        {pageError && (
          <div
            role="alert"
            className="flex flex-col justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900 shadow-2xs sm:flex-row sm:items-center dark:border-rose-800/70 dark:bg-rose-950/55 dark:text-rose-200"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
              <span>{pageError}</span>
            </div>
            {householdId && (
              <button
                type="button"
                onClick={() => loadData()}
                className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-xl border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-800 transition hover:bg-rose-100 sm:self-center dark:border-rose-700/70 dark:bg-rose-950/70 dark:text-rose-200 dark:hover:bg-rose-900/70"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Retry</span>
              </button>
            )}
          </div>
        )}

        {activeTab === 'overview' && (
          <>
            {/* Asymmetric Spotlight Bento Row */}
            <section className="grid grid-cols-1 gap-5 xl:grid-cols-12">
              {/* Guided Preparation Stepper & Contextual CTA */}
              {workspace ? (
                <div className="flex flex-col justify-between rounded-2xl border border-zinc-200/85 bg-white p-6 shadow-[0_1px_2px_rgba(9,9,11,0.03)] xl:col-span-7 dark:border-zinc-800/90 dark:bg-[#161920] dark:shadow-none">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                        Recommended Next Step
                      </p>
                      <h2 className="mt-1 text-lg font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
                        {nextRecommendation.label}
                      </h2>
                      <p className="mt-1 max-w-xl text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                        {nextRecommendation.hint}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveTab(nextRecommendation.tab)}
                      className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-zinc-950 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800 active:scale-[0.98] dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
                    >
                      <span>{nextRecommendation.label}</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-2 border-t border-zinc-100 pt-5 sm:grid-cols-5 dark:border-zinc-800">
                    {[
                      {
                        step: 1,
                        label: 'Documents',
                        tab: 'documents' as TabKey,
                        done: completionScore >= 25,
                      },
                      {
                        step: 2,
                        label: 'Facts',
                        tab: 'facts' as TabKey,
                        done: completionScore >= 40,
                      },
                      {
                        step: 3,
                        label: 'Profile',
                        tab: 'questionnaire' as TabKey,
                        done: completionScore >= 60,
                      },
                      {
                        step: 4,
                        label: 'Engine',
                        tab: 'calculator' as TabKey,
                        done: hasBalance,
                      },
                      {
                        step: 5,
                        label: 'Approve',
                        tab: 'filing' as TabKey,
                        done:
                          workspace.status === WorkspaceStatus.APPROVED ||
                          workspace.status === WorkspaceStatus.FILING_PACKAGE_READY ||
                          workspace.status === WorkspaceStatus.FILED,
                      },
                    ].map((item) => (
                      <button
                        key={item.step}
                        type="button"
                        onClick={() => setActiveTab(item.tab)}
                        className="flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-zinc-50/70 px-2 py-2 text-left transition hover:border-zinc-300 hover:bg-white dark:border-zinc-800 dark:bg-[#12151b] dark:hover:border-zinc-700 dark:hover:bg-zinc-800/80"
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                            item.done
                              ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-zinc-950'
                              : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                          }`}
                        >
                          {item.done ? <Check className="h-3 w-3" aria-hidden="true" /> : item.step}
                        </span>
                        <span className="truncate text-[11px] font-semibold text-zinc-800 dark:text-zinc-200">
                          {item.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col justify-between rounded-2xl border border-zinc-200/85 bg-white p-6 shadow-[0_1px_2px_rgba(9,9,11,0.03)] xl:col-span-7 dark:border-zinc-800/90 dark:bg-[#161920] dark:shadow-none">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      Workspace Setup
                    </p>
                    <h2 className="mt-1 text-lg font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
                      {household?.name || 'Tax Household'}
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                      Select an available tax year in the sidebar or resolve any household loading issue above to begin preparation.
                    </p>
                  </div>
                </div>
              )}

              {/* Financial Outcome + Return Readiness Card */}
              <div className="flex flex-col justify-between rounded-2xl border border-zinc-200/85 bg-white p-6 shadow-[0_1px_2px_rgba(9,9,11,0.03)] xl:col-span-5 dark:border-zinc-800/90 dark:bg-[#161920] dark:shadow-none">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Estimated Outcome
                    </h2>
                    <StatusBadge tone="success">Deterministic engine</StatusBadge>
                  </div>
                  <div className="mt-2.5 flex items-baseline gap-2">
                    <span
                      className={`tabular-nums text-3xl font-extrabold tracking-tight ${
                        !hasBalance
                          ? 'text-zinc-400 dark:text-zinc-500'
                          : isRefund
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-zinc-950 dark:text-zinc-50'
                      }`}
                    >
                      {balanceLabel}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {hasBalance
                      ? isRefund
                        ? 'Estimated reimbursement after withholding & credits.'
                        : 'Estimated balance payable upon ACD assessment.'
                      : 'No calculation run yet for this workspace.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('calculator')}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 transition hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300"
                  >
                    <span>View full calculation breakdown</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-5 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h2 className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Return Readiness
                    </h2>
                    {workspace?.status && (
                      <StatusBadge tone={workspaceStatusTone(workspace.status)}>
                        {workspace.status}
                      </StatusBadge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          completionScore >= 80
                            ? 'bg-emerald-500'
                            : completionScore >= 40
                            ? 'bg-sky-600 dark:bg-sky-500'
                            : 'bg-amber-500'
                        }`}
                        style={{ width: `${completionScore}%` }}
                      />
                    </div>
                    <span className="tabular-nums text-xs font-bold text-zinc-950 dark:text-zinc-50">
                      {completionScore}%
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    Status:{' '}
                    <strong className="font-semibold uppercase text-zinc-800 dark:text-zinc-200">
                      {workspace?.status || 'Draft'}
                    </strong>
                    {readiness && readiness.criticalWarningsCount > 0 && (
                      <span className="ml-2 font-semibold text-amber-700 dark:text-amber-400">
                        · {readiness.criticalWarningsCount} warning(s)
                      </span>
                    )}
                    {readiness && readiness.missingDocumentsCount > 0 && (
                      <span className="ml-2 font-semibold text-zinc-600 dark:text-zinc-300">
                        · {readiness.missingDocumentsCount} doc(s) needed
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </section>

            {/* Quick Feature Cards (keep exact 4 div[role="button"] cards for accessibility & test parity) */}
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div
                role="button"
                tabIndex={0}
                onClick={() => setActiveTab('documents')}
                onKeyDown={cardKeyboard('documents')}
                className="group cursor-pointer rounded-2xl border border-zinc-200/85 bg-white p-5 shadow-[0_1px_2px_rgba(9,9,11,0.03)] transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-zinc-800/90 dark:bg-[#161920] dark:shadow-none dark:hover:border-zinc-700"
              >
                <div className="mb-3.5 flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-200/70 dark:bg-sky-950/60 dark:text-sky-400 dark:ring-sky-800/60">
                  <FileText className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mb-1 text-sm font-bold text-zinc-950 dark:text-zinc-50">Document Vault</h3>
                <p className="mb-3.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                  Upload salary certificates, mortgage interest slips, and verify extracted figures.
                </p>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 group-hover:translate-x-0.5 transition-transform dark:text-zinc-100">
                  <span>Open Vault</span>
                  <ArrowRight className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                </span>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => setActiveTab('freelance')}
                onKeyDown={cardKeyboard('freelance')}
                className="group cursor-pointer rounded-2xl border border-zinc-200/85 bg-white p-5 shadow-[0_1px_2px_rgba(9,9,11,0.03)] transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-zinc-800/90 dark:bg-[#161920] dark:shadow-none dark:hover:border-zinc-700"
              >
                <div className="mb-3.5 flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200/80 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700/80">
                  <Briefcase className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mb-1 text-sm font-bold text-zinc-950 dark:text-zinc-50">Freelance &amp; Business</h3>
                <p className="mb-3.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                  Track client invoices, deductible operating expenses, and VAT per spouse.
                </p>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 group-hover:translate-x-0.5 transition-transform dark:text-zinc-100">
                  <span>Open Business Hub</span>
                  <ArrowRight className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                </span>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => setActiveTab('questionnaire')}
                onKeyDown={cardKeyboard('questionnaire')}
                className="group cursor-pointer rounded-2xl border border-zinc-200/85 bg-white p-5 shadow-[0_1px_2px_rgba(9,9,11,0.03)] transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-zinc-800/90 dark:bg-[#161920] dark:shadow-none dark:hover:border-zinc-700"
              >
                <div className="mb-3.5 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-200/70 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-800/60">
                  <ClipboardList className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mb-1 text-sm font-bold text-zinc-950 dark:text-zinc-50">Tax Profile &amp; Checklist</h3>
                <p className="mb-3.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                  Answer residency and deduction questions, and resolve missing evidence tasks.
                </p>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 group-hover:translate-x-0.5 transition-transform dark:text-zinc-100">
                  <span>Open Checklist</span>
                  <ArrowRight className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                </span>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => setActiveTab('filing')}
                onKeyDown={cardKeyboard('filing')}
                className="group cursor-pointer rounded-2xl border border-zinc-200/85 bg-white p-5 shadow-[0_1px_2px_rgba(9,9,11,0.03)] transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-zinc-800/90 dark:bg-[#161920] dark:shadow-none dark:hover:border-zinc-700"
              >
                <div className="mb-3.5 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70 dark:bg-emerald-950/60 dark:text-emerald-400 dark:ring-emerald-800/60">
                  <PackageCheck className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mb-1 text-sm font-bold text-zinc-950 dark:text-zinc-50">Approvals &amp; Filing</h3>
                <p className="mb-3.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                  Review dual spousal approvals, Form 100 boxes, and MyGuichet manual filing guide.
                </p>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 group-hover:translate-x-0.5 transition-transform dark:text-zinc-100">
                  <span>View Filing Package</span>
                  <ArrowRight className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                </span>
              </div>
            </section>

            {/* Bottom Row: Co-Filers + Immutable Audit Trail */}
            <section className="grid grid-cols-1 gap-5 xl:grid-cols-12">
              {/* Household Co-Filer Card */}
              <div className="rounded-2xl border border-zinc-200/85 bg-white p-6 shadow-[0_1px_2px_rgba(9,9,11,0.03)] xl:col-span-4 dark:border-zinc-800/90 dark:bg-[#161920] dark:shadow-none">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    <span>Household Co-Filers</span>
                    <HelpTip id="householdMembers" />
                  </h2>
                  {!coFiler && (
                    <button
                      type="button"
                      onClick={() => setIsInviteOpen(true)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 transition hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300"
                    >
                      <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Invite</span>
                    </button>
                  )}
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between rounded-xl border border-zinc-200/70 bg-zinc-50/70 p-2.5 dark:border-zinc-800 dark:bg-[#12151b]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-950 text-xs font-bold text-white dark:bg-zinc-800 dark:text-zinc-100">
                        {initialsFrom(
                          primaryFiler?.user?.firstName,
                          primaryFiler?.user?.lastName,
                          primaryFiler?.user?.email,
                          'P1',
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-zinc-950 dark:text-zinc-50">
                          {primaryFiler?.user?.email || 'Primary Filer'}
                        </p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Primary Taxpayer</p>
                      </div>
                    </div>
                    <StatusBadge tone="success">Active</StatusBadge>
                  </div>

                  {coFiler ? (
                    <div className="flex items-center justify-between rounded-xl border border-zinc-200/70 bg-zinc-50/70 p-2.5 dark:border-zinc-800 dark:bg-[#12151b]">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-xs font-bold text-sky-900 dark:bg-sky-950/70 dark:text-sky-300">
                          {initialsFrom(
                            coFiler.user?.firstName,
                            coFiler.user?.lastName,
                            coFiler.user?.email,
                            'P2',
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-zinc-950 dark:text-zinc-50">
                            {coFiler.user?.email}
                          </p>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Spouse (Co-Filer)</p>
                        </div>
                      </div>
                      <StatusBadge tone="success">Active</StatusBadge>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-3.5 text-center dark:border-zinc-700 dark:bg-[#12151b]">
                      <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">No spouse linked yet</p>
                      <button
                        type="button"
                        onClick={() => setIsInviteOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 ring-1 ring-zinc-200 transition hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-800"
                      >
                        <UserPlus className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                        <span>Send Spousal Invitation</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Activity Audit Trail */}
              <div className="rounded-2xl border border-zinc-200/85 bg-white p-6 shadow-[0_1px_2px_rgba(9,9,11,0.03)] xl:col-span-8 dark:border-zinc-800/90 dark:bg-[#161920] dark:shadow-none">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    <Activity className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
                    <span>Immutable Household Activity Trail</span>
                  </h2>
                  <span className="tabular-nums text-[11px] text-zinc-400 dark:text-zinc-500">
                    Latest {activity.length} event(s)
                  </span>
                </div>

                {activity.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-zinc-200 py-8 text-center text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
                    No activity recorded yet.
                  </p>
                ) : (
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                    {activity.map((event) => (
                      <div
                        key={event.id}
                        className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{event.description}</p>
                          <span className="tabular-nums text-[11px] text-zinc-500 dark:text-zinc-400">
                            Actor: {event.actorEmail || event.actorId?.slice(0, 8) || 'system'} •{' '}
                            {new Date(event.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <StatusBadge
                          tone="neutral"
                          className="self-start sm:self-center font-mono text-[10px]"
                        >
                          {event.eventType}
                        </StatusBadge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {activeTab === 'documents' && workspace && (
          <DocumentsView
            workspaceId={workspace.id}
            members={household?.members || []}
            onFactsChanged={loadData}
          />
        )}

        {activeTab === 'freelance' && workspace && (
          <FreelanceBusinessView
            workspaceId={workspace.id}
            members={household?.members || []}
            currentUserId={user?.id || ''}
            onDataChanged={loadData}
          />
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
            taxYear={workspace.taxYear}
            onCalculated={loadData}
            onNavigateToFiling={() => setActiveTab('filing')}
          />
        )}

        {activeTab === 'filing' && workspace && household && (
          <FilingPackageView
            key={workspace.id}
            workspace={workspace}
            household={household}
            onRefresh={loadData}
            onNavigateToCalculator={() => setActiveTab('calculator')}
          />
        )}

        {activeTab === 'assessment' && workspace && (
          <AssessmentView
            workspace={workspace}
            onRefresh={loadData}
            onNavigateToFiling={() => setActiveTab('filing')}
          />
        )}

        {activeTab === 'admin' && <AdminConsoleView />}
      </WorkspaceShell>

      {/* Invite Modal */}
      {household && (
        <InviteModal
          isOpen={isInviteOpen}
          onClose={() => setIsInviteOpen(false)}
          householdId={household.id}
          onSuccess={() => loadData()}
        />
      )}
    </>
  );
}
