'use client';

import React, { useState, useEffect } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react';
import { HelpTip } from './HelpTip';
import { apiClient } from '../lib/api';
import {
  ChildReliefHistoryEntry,
  QuestionnaireAnswersDto,
  ReadinessDetailsDto,
  TaskSeverity,
  FactCategory,
} from '@luxtax/contracts';
import { FACT_INCLUSION_DOWNGRADE_MESSAGE, factInclusionWarning } from '../lib/fact-inclusion';
import { findFact } from '../lib/fact-dedup';
import { ToastBanner, type ToastMessage } from './ui/ToastBanner';
import { CardGridSkeleton, Skeleton } from './ui/Skeleton';
import { StatusBadge } from './ui/StatusBadge';

interface QuestionnaireViewProps {
  workspaceId: string;
  onProfileUpdated: () => void;
}

const MARITAL_OPTIONS: ReadonlyArray<{
  value: QuestionnaireAnswersDto['maritalStatus'];
  label: string;
  taxClassSummary: string;
}> = [
  { value: 'SINGLE', label: 'SINGLE', taxClassSummary: 'Tax Class 1 (or Class 1a if supporting dependent children or aged 65+).' },
  { value: 'MARRIED', label: 'MARRIED', taxClassSummary: 'Tax Class 2 collective splitting, or optional individual taxation under Art. 3ter.' },
  { value: 'PACS', label: 'PACS', taxClassSummary: 'Eligible for joint Class 2 assessment when partnership existed throughout the full tax year.' },
  { value: 'DIVORCED', label: 'DIVORCED', taxClassSummary: 'Class 1 / 1a, or 3-year transitional Class 2 window under Art. 119 n° 3 c.' },
  { value: 'WIDOWED', label: 'WIDOWED', taxClassSummary: 'Class 1a, or 3-year transitional Class 2 window under Art. 119 n° 3 b.' },
];

export function QuestionnaireView({ workspaceId, onProfileUpdated }: QuestionnaireViewProps) {
  // No seeded object: until the saved answers arrive there is nothing to edit
  // or to save, so the form must not exist yet.
  const [answers, setAnswers] = useState<QuestionnaireAnswersDto | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Optional quick estimates
  const [quickSalary, setQuickSalary] = useState('');
  const [quickWithholding, setQuickWithholding] = useState('');
  const [quickMortgage, setQuickMortgage] = useState('');

  const [readiness, setReadiness] = useState<ReadinessDetailsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ToastMessage | null>(null);

  // Progressive disclosure for specialized sections
  const [showSpecialProfile, setShowSpecialProfile] = useState(false);
  const [showInvestmentsAndForeign, setShowInvestmentsAndForeign] = useState(false);

  const patchAnswers = (next: QuestionnaireAnswersDto) => {
    setAnswers(next);
    setIsDirty(true);
  };

  const updateChildRelief = (index: number, patch: Partial<ChildReliefHistoryEntry>) => {
    if (!answers) return;
    const list = [...(answers.childReliefHistory ?? [])];
    list[index] = { ...list[index], ...patch };
    patchAnswers({ ...answers, childReliefHistory: list });
  };

  const removeChildRelief = (index: number) => {
    if (!answers) return;
    const list = (answers.childReliefHistory ?? []).filter((_, i) => i !== index);
    patchAnswers({ ...answers, childReliefHistory: list.length > 0 ? list : undefined });
  };

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback((curr) => (curr?.message === message ? null : curr)), 4500);
  };

  const refresh = async () => {
    setLoading(true);
    const res = await apiClient.getQuestionnaire(workspaceId);
    if (res.error || !res.data) {
      // Never fall back to a default profile: it would show answers the
      // taxpayer never gave and save them over the real ones.
      setAnswers(null);
      setReadiness(null);
      setLoadError(res.error || 'The tax profile questionnaire could not be loaded.');
    } else {
      const loaded = res.data.answers;
      setAnswers(loaded);
      setReadiness(res.data.readiness);
      setLoadError('');
      setIsDirty(false);

      // Auto-expand advanced groups if any field already has data
      if (
        loaded.securitiesGrossIncome ||
        loaded.rentalGrossRent ||
        loaded.movableGainProceeds ||
        loaded.realEstateGainProceeds ||
        loaded.foreignAmount ||
        loaded.rentalForfaitEligible ||
        loaded.rentalSocial
      ) {
        setShowInvestmentsAndForeign(true);
      }
      if (
        loaded.asrdPrimeUnique ||
        loaded.invalidityRatePrimary ||
        loaded.startupInvestment ||
        loaded.youngEmployeePrime ||
        loaded.nonResidentAssimilation ||
        loaded.amvpEligible
      ) {
        setShowSpecialProfile(true);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, [workspaceId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answers) return;
    setSaving(true);

    const res = await apiClient.saveQuestionnaire(workspaceId, answers);

    if (res.error) {
      showFeedback('error', res.error);
      setSaving(false);
      return;
    }

    if (res.data) {
      setAnswers(res.data.answers);
      setReadiness(res.data.readiness);
      setIsDirty(false);

      let inclusionDowngraded = false;
      let factsError: string | null = null;

      // If the user entered quick financial estimates, save them as confirmed
      // facts. Saving the same questionnaire twice must not stack a second copy
      // of a figure the engine would then sum: an existing fact on the same
      // category + box is updated in place (or left alone when the amount is
      // already right).
      const quickEstimates = [
        {
          category: FactCategory.EMPLOYMENT_INCOME,
          fieldKey: 'grossSalary',
          amount: quickSalary,
          description: 'Estimated Annual Gross Salary',
        },
        {
          category: FactCategory.EMPLOYMENT_INCOME,
          fieldKey: 'withholdingTax',
          amount: quickWithholding,
          description: 'Tax Withheld at Source',
        },
        {
          category: FactCategory.MORTGAGE_DEDUCTION,
          fieldKey: 'mortgageInterest',
          amount: quickMortgage,
          description: 'Primary Residence Mortgage Interest',
        },
      ].filter((estimate) => estimate.amount && parseFloat(estimate.amount) > 0);

      if (quickEstimates.length > 0) {
        const factsRes = await apiClient.getFacts(workspaceId);
        const existingFacts = factsRes.data?.confirmedFacts ?? [];

        if (factsRes.error) {
          factsError = factsRes.error;
        } else {
          for (const estimate of quickEstimates) {
            const amount = parseFloat(estimate.amount).toFixed(2);
            const existing = findFact(existingFacts, estimate);
            const saved =
              existing && Number(existing.amount) === Number(amount)
                ? null
                : existing
                  ? await apiClient.updateFact(workspaceId, existing.id, { amount })
                  : await apiClient.confirmFact(workspaceId, {
                      category: estimate.category,
                      fieldKey: estimate.fieldKey,
                      amount,
                      currency: 'EUR',
                      description: estimate.description,
                      isIncludedInReturn: true,
                      isSharedWithHousehold: true,
                    });

            if (saved?.error) {
              factsError = saved.error;
              break;
            }
            if (saved && factInclusionWarning(true, saved.data?.isIncludedInReturn)) {
              inclusionDowngraded = true;
            }
          }
        }
      }

      if (factsError) {
        showFeedback('error', `Profile saved, but the quick estimates were not stored: ${factsError}`);
      } else if (inclusionDowngraded) {
        showFeedback('error', FACT_INCLUSION_DOWNGRADE_MESSAGE);
      } else {
        showFeedback('success', 'Tax profile questionnaire & readiness saved successfully!');
      }
      await refresh();
      onProfileUpdated();
    }
    setSaving(false);
  };

  const handleResolveTask = async (taskId: string) => {
    setResolvingId(taskId);
    const res = await apiClient.resolveTask(workspaceId, taskId);
    setResolvingId(null);

    if (res.error) {
      showFeedback('error', res.error);
    } else {
      showFeedback('success', 'Task marked as resolved!');
      await refresh();
      onProfileUpdated();
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-full rounded-full" />
        </div>
        <CardGridSkeleton count={3} />
      </div>
    );
  }

  // The form only exists once the saved answers are in hand: saving it writes
  // confirmed facts, so an editable form seeded with defaults would present
  // invented answers and then overwrite the real ones.
  if (!answers) {
    return (
      <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 shadow-xs">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-bold text-rose-950">The tax profile could not be loaded</h3>
            <p className="mt-1 text-xs text-rose-800">
              {loadError || 'The questionnaire is unavailable, so no answers are shown or saved.'}
            </p>
            <button
              type="button"
              onClick={() => refresh()}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-zinc-800"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Retry</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const unresolvedTasks = readiness?.tasks.filter((t) => !t.isResolved) || [];

  const inputClass =
    'w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-base font-medium text-zinc-950 placeholder:text-zinc-400 transition focus:border-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950/10 sm:py-2 sm:text-xs';

  return (
    <div className="space-y-6">
      <ToastBanner feedback={feedback} onDismiss={() => setFeedback(null)} />

      {/* Readiness Progress Card */}
      {readiness && (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
          <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Workspace Readiness &amp; Completeness
              </span>
              <h3 className="tabular-nums mt-0.5 text-2xl font-extrabold text-slate-900">
                {readiness.completionScore}% Completed
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {readiness.unresolvedBlockers > 0 && (
                <StatusBadge tone="danger">
                  <AlertCircle className="h-3 w-3" aria-hidden="true" />
                  <span>
                    {readiness.unresolvedBlockers} Blocker{readiness.unresolvedBlockers > 1 ? 's' : ''}
                  </span>
                </StatusBadge>
              )}
              {readiness.unresolvedWarnings > 0 && (
                <StatusBadge tone="warning">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  <span>
                    {readiness.unresolvedWarnings} Warning{readiness.unresolvedWarnings > 1 ? 's' : ''}
                  </span>
                </StatusBadge>
              )}
              {readiness.unresolvedBlockers === 0 && readiness.unresolvedWarnings === 0 && (
                <StatusBadge tone="success">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  <span>Ready for {readiness.taxYear} Filing</span>
                </StatusBadge>
              )}
            </div>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                readiness.completionScore > 80
                  ? 'bg-emerald-500'
                  : readiness.completionScore > 50
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
              }`}
              style={{ width: `${readiness.completionScore}%` }}
            />
          </div>
        </div>
      )}

      {/* Missing Information Checklist */}
      {unresolvedTasks.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 shadow-xs">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-amber-950">
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
            <span>Missing Information Checklist ({unresolvedTasks.length})</span>
          </h4>
          <div className="space-y-2.5">
            {unresolvedTasks.map((task) => (
              <div
                key={task.id}
                className="flex flex-col justify-between gap-3 rounded-xl border border-amber-200/80 bg-white p-3.5 shadow-2xs sm:flex-row sm:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={task.severity === TaskSeverity.BLOCKER ? 'danger' : 'warning'}>
                      {task.severity}
                    </StatusBadge>
                    <h5 className="text-xs font-bold text-slate-900">{task.title}</h5>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{task.description}</p>
                </div>
                <button
                  type="button"
                  disabled={resolvingId === task.id}
                  onClick={() => handleResolveTask(task.id)}
                  className="inline-flex shrink-0 items-center gap-1.5 self-end rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 sm:self-center"
                >
                  <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  <span>{resolvingId === task.id ? 'Resolving...' : 'Mark Resolved'}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Guided Questionnaire Form */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* Form Overview + Section Quick-Jump */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Guided household tax questionnaire
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Answers configure your Luxembourg tax class, deductions, and required Form 100 annexes.
              </p>
            </div>
            {isDirty && (
              <StatusBadge tone="warning">Unsaved changes</StatusBadge>
            )}
          </div>

          {/* Section 1: Marital / Household Status */}
          <div className="mt-5">
            <label className="mb-2.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
              1. Marital / Household Status <HelpTip id="householdStatus" />
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {MARITAL_OPTIONS.map((opt) => {
                const active = answers.maritalStatus === opt.value;
                return (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => patchAnswers({ ...answers, maritalStatus: opt.value })}
                    className={`rounded-xl border px-3 py-2.5 text-center text-xs font-bold transition ${
                      active
                        ? 'border-zinc-950 bg-zinc-950 text-white shadow-xs'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              {MARITAL_OPTIONS.find((o) => o.value === answers.maritalStatus)?.taxClassSummary}
            </p>
          </div>

          {/* Art. 3 d) — mixed couple */}
          {(answers.maritalStatus === 'MARRIED' || answers.maritalStatus === 'PACS') && (
            <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Where does your spouse live? <HelpTip id="mixedCouple" />
                </label>
                <select
                  value={answers.spouseResidence ?? ''}
                  onChange={(e) =>
                    patchAnswers({
                      ...answers,
                      spouseResidence: (e.target.value || undefined) as
                        | 'RESIDENT'
                        | 'NON_RESIDENT'
                        | undefined,
                    })
                  }
                  className={inputClass}
                >
                  <option value="">Same country as me</option>
                  <option value="RESIDENT">Luxembourg (resident)</option>
                  <option value="NON_RESIDENT">Abroad (non-resident)</option>
                </select>
              </div>

              {answers.spouseResidence && (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200/80 bg-white p-3 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={answers.mixedCoupleCollectiveRequested ?? false}
                    onChange={(e) =>
                      patchAnswers({
                        ...answers,
                        mixedCoupleCollectiveRequested: e.target.checked,
                      })
                    }
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="leading-relaxed">
                    Request collective assessment (Art. 3 d). Granted only when the resident spouse
                    earns at least 90 % of the household&apos;s professional income in Luxembourg;
                    otherwise the couple is taxed separately and the calculation says so.
                  </span>
                </label>
              )}
            </div>
          )}

          {/* Art. 119 n° 3 b–c: three-year Class 2 window after death / divorce */}
          {answers.maritalStatus === 'WIDOWED' && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                Year of spouse&apos;s death <HelpTip id="class2Window" />
              </label>
              <input
                type="number"
                value={answers.spouseDeathYear ?? ''}
                placeholder="e.g. 2024"
                onChange={(e) =>
                  patchAnswers({
                    ...answers,
                    spouseDeathYear: e.target.value ? parseInt(e.target.value) : undefined,
                  })
                }
                className={inputClass}
                min={1900}
                max={2100}
              />
              <p className="mt-1.5 text-[11px] text-slate-500">
                Class 2 is kept for the year of death and the three following years (Art. 119 n° 3 b).
              </p>
            </div>
          )}

          {answers.maritalStatus === 'DIVORCED' && (
            <div className="mt-4 grid items-start gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Year of divorce / separation
                </label>
                <input
                  type="number"
                  value={answers.divorceOrSeparationYear ?? ''}
                  placeholder="e.g. 2023"
                  onChange={(e) =>
                    patchAnswers({
                      ...answers,
                      divorceOrSeparationYear: e.target.value ? parseInt(e.target.value) : undefined,
                    })
                  }
                  className={inputClass}
                  min={1900}
                  max={2100}
                />
              </div>
              <div>
                <label className="flex cursor-pointer items-center gap-2.5 pt-1">
                  <input
                    type="checkbox"
                    checked={answers.class2BeforeEvent ?? false}
                    onChange={(e) =>
                      patchAnswers({ ...answers, class2BeforeEvent: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-xs font-medium text-slate-800">
                    Class 2 for five years before the divorce (Art. 119 n° 3 c)
                  </span>
                </label>
                <p className="mt-1 ml-6.5 text-[11px] text-slate-500">
                  If true, Class 2 is kept for the event year and the three following years.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Income Sources */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              2. Income Sources in Luxembourg
            </h4>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200/80 p-3.5">
              <div className="flex items-center gap-2">
                <label className="inline-flex w-fit cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={answers.hasEmploymentIncome}
                    onChange={(e) =>
                      patchAnswers({ ...answers, hasEmploymentIncome: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-xs font-semibold text-slate-900">
                    Employment Income (Salaires / Traitements)
                  </span>
                </label>
                <HelpTip id="employmentIncome" />
              </div>

              {answers.hasEmploymentIncome && (
                <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Estimated Annual Gross Salary (€)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 75000"
                      value={quickSalary}
                      onChange={(e) => {
                        setQuickSalary(e.target.value);
                        setIsDirty(true);
                      }}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Withheld Tax at Source (€)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 12500"
                      value={quickWithholding}
                      onChange={(e) => {
                        setQuickWithholding(e.target.value);
                        setIsDirty(true);
                      }}
                      className={inputClass}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200/80 p-3.5">
              <div className="flex items-center gap-2">
                <label className="inline-flex w-fit cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={answers.hasFreelanceIncome ?? false}
                    onChange={(e) =>
                      patchAnswers({ ...answers, hasFreelanceIncome: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-xs font-semibold text-slate-900">
                    Freelance &amp; Independent Business Income (Art. 14 / Art. 91 LIR)
                  </span>
                </label>
                <HelpTip id="freelanceIncome" />
              </div>

              {answers.hasFreelanceIncome && (
                <div className="mt-3 rounded-xl border border-zinc-200/80 bg-zinc-50/80 p-3 text-xs text-zinc-900">
                  <p className="font-semibold">Freelance &amp; Business Hub Active</p>
                  <p className="mt-0.5 text-[11px] text-zinc-600">
                    Use the dedicated <strong>Freelance &amp; Business</strong> navigation section to track client invoices, deductible operating expenses, and VAT returns for each spouse.
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200/80 p-3.5">
              <div className="flex items-center gap-2">
                <label className="inline-flex w-fit cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={answers.hasPensionIncome}
                    onChange={(e) =>
                      patchAnswers({ ...answers, hasPensionIncome: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-xs font-semibold text-slate-900">
                    Pension Income (Pensions ou rentes)
                  </span>
                </label>
                <HelpTip id="pensionIncome" />
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Deductions & Special Expenses */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              3. Deductions &amp; Special Expenses
            </h4>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200/80 p-3.5">
              <div className="flex items-center gap-2">
                <label className="inline-flex w-fit cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={answers.hasPrimaryResidenceMortgage}
                    onChange={(e) =>
                      patchAnswers({
                        ...answers,
                        hasPrimaryResidenceMortgage: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-xs font-semibold text-slate-900">
                    Mortgage Interest on Primary Residence (Habitation personnelle)
                  </span>
                </label>
                <HelpTip id="mortgageInterest" />
              </div>

              {answers.hasPrimaryResidenceMortgage && (
                <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 sm:grid-cols-2">
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Year the valeur locative was fixed (not the occupation year):
                    </span>
                    <input
                      type="number"
                      value={answers.mortgageOccupancyYear || 2020}
                      onChange={(e) =>
                        patchAnswers({
                          ...answers,
                          mortgageOccupancyYear: parseInt(e.target.value) || 2020,
                        })
                      }
                      className={inputClass}
                      min={1970}
                      max={2030}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Estimated Annual Interest Paid (€):
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 3500"
                      value={quickMortgage}
                      onChange={(e) => {
                        setQuickMortgage(e.target.value);
                        setIsDirty(true);
                      }}
                      className={inputClass}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200/80 p-3.5">
              <div className="flex items-center gap-2">
                <label className="inline-flex w-fit cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={answers.hasLifeInsuranceOrPensionPlan}
                    onChange={(e) =>
                      patchAnswers({
                        ...answers,
                        hasLifeInsuranceOrPensionPlan: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-xs font-semibold text-slate-900">
                    Private insurance / consumer-loan interest (Art. 111 — €672 envelope)
                  </span>
                </label>
                <HelpTip id="art111" />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/80 p-3.5">
              <div className="flex items-center gap-2">
                <label className="inline-flex w-fit cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={answers.hasPensionSavingsContract ?? false}
                    onChange={(e) =>
                      patchAnswers({
                        ...answers,
                        hasPensionSavingsContract: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-xs font-semibold text-slate-900">
                    I hold a prévoyance-vieillesse contract (Art. 111bis — cap €3,200 for 2025, €4,500 from 2026)
                  </span>
                </label>
                <HelpTip id="art111bis" />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/80 p-3.5">
              <div className="flex items-center gap-2">
                <label className="inline-flex w-fit cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={answers.hasSavingsHousingContract ?? false}
                    onChange={(e) =>
                      patchAnswers({
                        ...answers,
                        hasSavingsHousingContract: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-xs font-semibold text-slate-900">
                    I hold an épargne-logement contract (Art. 111 al. 5 — €1,344 / €672)
                  </span>
                </label>
                <HelpTip id="savingsHousing" />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/80 p-3.5">
              <div className="flex items-center gap-2">
                <label className="inline-flex w-fit cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={answers.hasDonations}
                    onChange={(e) => patchAnswers({ ...answers, hasDonations: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-xs font-semibold text-slate-900">
                    Charitable Donations to Recognized Foundations (Art 112 LIR)
                  </span>
                </label>
                <HelpTip id="donations" />
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Household, Children & Professional Profile */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              4. Household, Children &amp; Professional Profile
            </h4>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                Number of Dependent Children
              </label>
              <input
                type="number"
                value={answers.childrenCount}
                onChange={(e) =>
                  patchAnswers({
                    ...answers,
                    childrenCount: Math.max(0, parseInt(e.target.value) || 0),
                  })
                }
                className={inputClass}
                min={0}
                max={15}
              />
            </div>

            <div>
              <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                Your age on 1 January
              </span>
              <input
                type="number"
                value={answers.primaryAge ?? ''}
                placeholder="e.g. 42"
                onChange={(e) =>
                  patchAnswers({
                    ...answers,
                    primaryAge: e.target.value ? parseInt(e.target.value) : undefined,
                  })
                }
                className={inputClass}
                min={16}
                max={110}
              />
            </div>

            <div>
              <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                Spouse age on 1 January
              </span>
              <input
                type="number"
                value={answers.spouseAge ?? ''}
                placeholder="e.g. 40"
                onChange={(e) =>
                  patchAnswers({
                    ...answers,
                    spouseAge: e.target.value ? parseInt(e.target.value) : undefined,
                  })
                }
                className={inputClass}
                min={16}
                max={110}
              />
            </div>

            <div>
              <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                Unités d&apos;éloignement — you (Art. 105bis) <HelpTip id="travelUnits" />
              </span>
              <input
                type="number"
                value={answers.travelUnitsPrimary ?? ''}
                placeholder="0"
                onChange={(e) =>
                  patchAnswers({
                    ...answers,
                    travelUnitsPrimary: e.target.value ? parseInt(e.target.value) : undefined,
                  })
                }
                className={inputClass}
                min={0}
                max={60}
              />
            </div>

            <div>
              <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                Unités d&apos;éloignement — spouse
              </span>
              <input
                type="number"
                value={answers.travelUnitsSpouse ?? ''}
                placeholder="0"
                onChange={(e) =>
                  patchAnswers({
                    ...answers,
                    travelUnitsSpouse: e.target.value ? parseInt(e.target.value) : undefined,
                  })
                }
                className={inputClass}
                min={0}
                max={60}
              />
            </div>

            <div>
              <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                Prior-year losses carried forward (Art. 114, €) <HelpTip id="priorYearLosses" />
              </span>
              <input
                type="number"
                step="0.01"
                value={answers.priorYearLosses ?? ''}
                placeholder="0"
                onChange={(e) =>
                  patchAnswers({
                    ...answers,
                    priorYearLosses: e.target.value ? parseFloat(e.target.value) : undefined,
                  })
                }
                className={inputClass}
                min={0}
              />
            </div>
          </div>

          {(answers.maritalStatus === 'MARRIED' || answers.maritalStatus === 'PACS') && (
            <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2">
              <div>
                <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                  Assessment (Art. 3 / 3bis / 3ter)
                </span>
                <select
                  value={answers.assessmentMode ?? 'COLLECTIVE'}
                  onChange={(e) =>
                    patchAnswers({
                      ...answers,
                      assessmentMode: e.target.value as QuestionnaireAnswersDto['assessmentMode'],
                    })
                  }
                  className={inputClass}
                >
                  <option value="COLLECTIVE">Collective (Class 2)</option>
                  <option value="INDIVIDUAL_PURE">Individual, pure (Class 1 each)</option>
                  <option value="INDIVIDUAL_REALLOCATION">Individual with reallocation</option>
                </select>
              </div>
              {answers.assessmentMode === 'INDIVIDUAL_REALLOCATION' && (
                <div>
                  <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                    Your share of the joint income (%)
                  </span>
                  <input
                    type="number"
                    value={answers.reallocationPercentPrimary ?? 50}
                    onChange={(e) =>
                      patchAnswers({
                        ...answers,
                        reallocationPercentPrimary: parseFloat(e.target.value) || 50,
                      })
                    }
                    className={inputClass}
                    min={0}
                    max={100}
                  />
                </div>
              )}
            </div>
          )}

          <div className="space-y-2.5 border-t border-slate-100 pt-4">
            <div className="flex items-center gap-2">
              <label className="inline-flex w-fit cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={answers.spouseHasProfessionalIncome ?? false}
                  onChange={(e) =>
                    patchAnswers({ ...answers, spouseHasProfessionalIncome: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  My spouse also has professional income (salary or side-business) — Art. 129b AEP €4,500
                </span>
              </label>
              <HelpTip id="spouseProfessional" />
            </div>

            <div className="flex items-center gap-2">
              <label className="inline-flex w-fit cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={answers.spouseIsConjointAidant ?? false}
                  onChange={(e) =>
                    patchAnswers({ ...answers, spouseIsConjointAidant: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  My spouse is registered as conjoint-aidant in my business
                </span>
              </label>
              <HelpTip id="conjointAidant" />
            </div>

            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={answers.spouseEmployedByBusiness ?? false}
                onChange={(e) =>
                  patchAnswers({ ...answers, spouseEmployedByBusiness: e.target.checked })
                }
                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span className="text-xs font-medium text-slate-800">
                My spouse is paid a salary by our business — Art. 48 n° 3 blocks the deduction in Class 2
              </span>
            </label>
          </div>
        </div>

        {/* Section 5: Children Relief & Single Parent (CIM / Art. 122 / 123bis) */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              5. Child Relief &amp; Single-Parent Credits
            </h4>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                Children with a modération d&apos;impôt
              </span>
              <input
                type="number"
                value={answers.childrenWithModeration ?? ''}
                placeholder="same as dependants"
                onChange={(e) =>
                  patchAnswers({
                    ...answers,
                    childrenWithModeration: e.target.value ? parseInt(e.target.value) : undefined,
                  })
                }
                className={inputClass}
                min={0}
                max={20}
              />
            </div>

            <div>
              <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                Allocations paid for the child (CIM reduction, €) <HelpTip id="cim" />
              </span>
              <input
                type="number"
                step="0.01"
                value={answers.childAllocations ?? ''}
                placeholder="0"
                onChange={(e) =>
                  patchAnswers({
                    ...answers,
                    childAllocations: e.target.value ? parseFloat(e.target.value) : undefined,
                  })
                }
                className={inputClass}
                min={0}
              />
            </div>

            <div>
              <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                Moderated children with no family allowance / CEDIES / SNJ (Art. 122 dégrèvement){' '}
                <HelpTip id="childrenModeration" />
              </span>
              <input
                type="number"
                value={answers.moderatedChildrenWithoutBenefit ?? ''}
                placeholder="0"
                onChange={(e) =>
                  patchAnswers({
                    ...answers,
                    moderatedChildrenWithoutBenefit: e.target.value
                      ? parseInt(e.target.value)
                      : undefined,
                  })
                }
                className={inputClass}
                min={0}
                max={20}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Each such child gives EUR 922.50, capped at the tax due and never refundable.
              </p>
            </div>

            <div>
              <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                Children with expired moderation (bonification, Art. 123bis){' '}
                <HelpTip id="childrenBonification" />
              </span>
              <input
                type="number"
                value={answers.childrenWithBonification ?? ''}
                placeholder="0"
                onChange={(e) =>
                  patchAnswers({
                    ...answers,
                    childrenWithBonification: e.target.value
                      ? parseInt(e.target.value)
                      : undefined,
                  })
                }
                className={inputClass}
                min={0}
                max={20}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Child left the household / studies finished; at most two bonifications per child.
              </p>
            </div>
          </div>

          <div className="space-y-2.5 pt-2">
            <div className="flex items-start gap-2">
              <label className="inline-flex w-fit cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={
                    answers.isSingleParent ??
                    ((answers.maritalStatus === 'SINGLE' ||
                      answers.maritalStatus === 'DIVORCED' ||
                      answers.maritalStatus === 'WIDOWED') &&
                      (answers.childrenWithModeration ?? answers.childrenCount ?? 0) > 0)
                  }
                  onChange={(e) => patchAnswers({ ...answers, isSingleParent: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  Single parent (CIM, Art. 154ter)
                  <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                    Automatic for a single, divorced or widowed parent with a moderated child; tick only to force it on or off.
                  </span>
                </span>
              </label>
              <HelpTip id="cim" />
            </div>

            <div className="flex items-center gap-2">
              <label className="inline-flex w-fit cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={answers.bothParentsSameHome ?? false}
                  onChange={(e) =>
                    patchAnswers({ ...answers, bothParentsSameHome: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  Both parents live in the same home as the child (excludes the CIM)
                </span>
              </label>
              <HelpTip id="cim" />
            </div>
          </div>

          {/* Per-child relief history */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Child relief history (Art. 122 / 123bis) — optional, overrides the counts above
                </span>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Per child: still moderated this year, or the year moderation ended, and bonifications already granted (max 2).
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  patchAnswers({
                    ...answers,
                    childReliefHistory: [
                      ...(answers.childReliefHistory ?? []),
                      {
                        childId: `Child ${(answers.childReliefHistory?.length ?? 0) + 1}`,
                        // Conservative default, matching the scalar path: the user
                        // must untick it when no allowance/CEDIES/SNJ was paid.
                        benefitReceived: true,
                      },
                    ],
                  })
                }
                className="inline-flex items-center gap-1 rounded-xl bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-zinc-800"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Add child</span>
              </button>
            </div>

            {(answers.childReliefHistory ?? []).length > 0 && (
              <div className="mt-3 space-y-2.5">
                {(answers.childReliefHistory ?? []).map((child, index) => (
                  <div
                    key={index}
                    className="grid gap-2.5 rounded-xl border border-zinc-200 bg-white p-3 sm:grid-cols-6"
                  >
                    <label className="text-[11px] font-semibold text-zinc-600">
                      Label
                      <input
                        type="text"
                        value={child.childId ?? ''}
                        onChange={(e) => updateChildRelief(index, { childId: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-950 focus:border-zinc-950 focus:outline-none"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                      <input
                        type="checkbox"
                        checked={child.moderationThisYear === true}
                        onChange={(e) =>
                          updateChildRelief(index, { moderationThisYear: e.target.checked })
                        }
                      />
                      Moderated this year
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                      <input
                        type="checkbox"
                        checked={child.benefitReceived === true}
                        onChange={(e) =>
                          updateChildRelief(index, { benefitReceived: e.target.checked })
                        }
                      />
                      Allowance / CEDIES / SNJ paid
                    </label>
                    <label className="text-[11px] font-semibold text-zinc-600">
                      Moderation ended (year)
                      <input
                        type="number"
                        value={child.moderationEndYear ?? ''}
                        placeholder="e.g. 2024"
                        onChange={(e) =>
                          updateChildRelief(index, {
                            moderationEndYear: e.target.value
                              ? parseInt(e.target.value)
                              : undefined,
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-base text-zinc-950 focus:border-zinc-950 focus:outline-none sm:text-xs"
                        min={1900}
                        max={2100}
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-zinc-600">
                      Bonifications granted
                      <input
                        type="number"
                        value={child.bonificationsGranted ?? ''}
                        placeholder="0"
                        onChange={(e) =>
                          updateChildRelief(index, {
                            bonificationsGranted: e.target.value
                              ? parseInt(e.target.value)
                              : undefined,
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-base text-zinc-950 focus:border-zinc-950 focus:outline-none sm:text-xs"
                        min={0}
                        max={2}
                      />
                    </label>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => removeChildRelief(index)}
                        className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                        <span>Remove</span>
                      </button>
                    </div>
                    <div className="grid gap-2 border-t border-slate-100 pt-2 sm:col-span-6 sm:grid-cols-3">
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                        <input
                          type="checkbox"
                          checked={child.inHousehold === false}
                          onChange={(e) =>
                            updateChildRelief(index, {
                              inHousehold: e.target.checked ? false : undefined,
                            })
                          }
                        />
                        Lives outside this household
                      </label>
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                        <input
                          type="checkbox"
                          checked={child.residenceAlternee === true}
                          onChange={(e) =>
                            updateChildRelief(index, { residenceAlternee: e.target.checked })
                          }
                        />
                        Résidence alternée (2025–2026 only)
                      </label>
                      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                        <input
                          type="checkbox"
                          checked={
                            child.jointParentalAuthority === true &&
                            child.familyAllowanceReceived === true
                          }
                          onChange={(e) =>
                            updateChildRelief(index, {
                              jointParentalAuthority: e.target.checked,
                              familyAllowanceReceived: e.target.checked,
                            })
                          }
                        />
                        Joint parental authority + allowance here
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Section 6 (Collapsible): Special Reliefs, ASRD, Invalidity & Assimilation */}
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
          <button
            type="button"
            onClick={() => setShowSpecialProfile((prev) => !prev)}
            aria-expanded={showSpecialProfile}
            className="flex w-full items-center justify-between px-6 py-4 text-left transition hover:bg-slate-50"
          >
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                6. Special Reliefs, Age Limits, ASRD &amp; Non-Resident Assimilation
              </h4>
              <p className="mt-0.5 text-xs text-slate-500">
                Optional: ASRD single premium, invalidity rate, prime jeune salarié, start-up investment, or cross-border assimilation.
              </p>
            </div>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-150 ${
                showSpecialProfile ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </button>

          {showSpecialProfile && (
            <div className="space-y-4 border-t border-slate-100 p-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                    Reduced working capacity (0–1, invalidity forfait) <HelpTip id="invalidity" />
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={answers.invalidityRatePrimary ?? ''}
                    placeholder="e.g. 0.40"
                    onChange={(e) =>
                      patchAnswers({
                        ...answers,
                        invalidityRatePrimary: e.target.value
                          ? parseFloat(e.target.value)
                          : undefined,
                      })
                    }
                    className={inputClass}
                    min={0}
                    max={1}
                  />
                </div>

                <div>
                  <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                    Épargne-logement subscriber age on 1 January <HelpTip id="savingsHousing" />
                  </span>
                  <input
                    type="number"
                    value={answers.savingsHousingSubscriberAge ?? ''}
                    placeholder="≤ 40 gives €1,344"
                    onChange={(e) =>
                      patchAnswers({
                        ...answers,
                        savingsHousingSubscriberAge: e.target.value
                          ? parseInt(e.target.value)
                          : undefined,
                      })
                    }
                    className={inputClass}
                    min={16}
                    max={110}
                  />
                </div>

                <div>
                  <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                    111bis souscripteurs (1 or 2)
                  </span>
                  <input
                    type="number"
                    value={answers.art111bisContributors ?? ''}
                    placeholder="default 2 if married"
                    onChange={(e) =>
                      patchAnswers({
                        ...answers,
                        art111bisContributors: e.target.value
                          ? parseInt(e.target.value)
                          : undefined,
                      })
                    }
                    className={inputClass}
                    min={1}
                    max={2}
                  />
                </div>

                <div>
                  <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                    Prime jeune salarié received (€, Art. 115 n° 13d)
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={answers.youngEmployeePrime ?? ''}
                    placeholder="0"
                    onChange={(e) =>
                      patchAnswers({
                        ...answers,
                        youngEmployeePrime: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    className={inputClass}
                    min={0}
                  />
                </div>

                <div>
                  <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                    Prime jeune salarié conditions met?
                  </span>
                  <select
                    value={answers.youngEmployeePrimeEligible ? 'yes' : 'no'}
                    onChange={(e) =>
                      patchAnswers({
                        ...answers,
                        youngEmployeePrimeEligible: e.target.value === 'yes',
                      })
                    }
                    className={inputClass}
                  >
                    <option value="no">No / not applicable</option>
                    <option value="yes">Under 30, first CDI in LU, first prime &lt; 5 years</option>
                  </select>
                </div>

                <div>
                  <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                    ASRD single premium (€, Art. 111 al. 3/4) <HelpTip id="asrd" />
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={answers.asrdPrimeUnique ?? ''}
                    placeholder="0"
                    onChange={(e) =>
                      patchAnswers({
                        ...answers,
                        asrdPrimeUnique: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    className={inputClass}
                    min={0}
                  />
                </div>

                <div>
                  <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                    Your age when the ASRD was taken out
                  </span>
                  <input
                    type="number"
                    value={answers.asrdSubscriberAge ?? ''}
                    placeholder="e.g. 35"
                    onChange={(e) =>
                      patchAnswers({
                        ...answers,
                        asrdSubscriberAge: e.target.value ? parseInt(e.target.value) : undefined,
                      })
                    }
                    className={inputClass}
                    min={16}
                    max={110}
                  />
                </div>

                <div>
                  <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                    Start-up investment (2026, € — 20 % credit, cap €100,000){' '}
                    <HelpTip id="startupInvestment" />
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={answers.startupInvestment ?? ''}
                    placeholder="0"
                    onChange={(e) =>
                      patchAnswers({
                        ...answers,
                        startupInvestment: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    className={inputClass}
                    min={0}
                  />
                </div>
              </div>

              <div className="space-y-2.5 border-t border-slate-100 pt-3">
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={answers.amvpEligible ?? false}
                    onChange={(e) =>
                      patchAnswers({ ...answers, amvpEligible: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-xs font-medium text-slate-800">
                    I keep working after becoming eligible for an early pension — AMVP €9,000 (2026 only)
                  </span>
                </label>

                <label className="flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={answers.nonResidentAssimilation ?? false}
                    onChange={(e) =>
                      patchAnswers({ ...answers, nonResidentAssimilation: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-xs font-medium text-slate-800">
                    I am a non-resident asking for assimilation (≥ 90 % of worldwide income in Luxembourg, or foreign net &lt; €13,000)
                  </span>
                </label>

                {answers.nonResidentAssimilation && (
                  <div className="mt-2 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                    <div>
                      <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                        Worldwide income (€)
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        value={answers.worldwideIncome ?? ''}
                        onChange={(e) =>
                          patchAnswers({
                            ...answers,
                            worldwideIncome: e.target.value
                              ? parseFloat(e.target.value)
                              : undefined,
                          })
                        }
                        className={inputClass}
                        min={0}
                      />
                    </div>
                    <div>
                      <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                        Luxembourg professional income (€)
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        value={answers.luxembourgProfessionalIncome ?? ''}
                        onChange={(e) =>
                          patchAnswers({
                            ...answers,
                            luxembourgProfessionalIncome: e.target.value
                              ? parseFloat(e.target.value)
                              : undefined,
                          })
                        }
                        className={inputClass}
                        min={0}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Section 7 (Collapsible): Capital, Rental, Gains & Foreign Income */}
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
          <button
            type="button"
            onClick={() => setShowInvestmentsAndForeign((prev) => !prev)}
            aria-expanded={showInvestmentsAndForeign}
            className="flex w-full items-center justify-between px-6 py-4 text-left transition hover:bg-slate-50"
          >
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                7. Capital, Rental, Capital Gains &amp; Foreign Income
              </h4>
              <p className="mt-0.5 text-xs text-slate-500">
                Optional: securities dividends, RELIBI withholding, Luxembourg rental property, capital gains, or treaty foreign income.
              </p>
            </div>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-150 ${
                showInvestmentsAndForeign ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </button>

          {showInvestmentsAndForeign && (
            <div className="space-y-6 border-t border-slate-100 p-6">
              {/* Capital and Rental */}
              <div>
                <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
                  <span>Capital and rental (one row each)</span>
                  <HelpTip id="capitalIncome" />
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Securities income €
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={answers.securitiesGrossIncome ?? ''}
                      onChange={(e) =>
                        patchAnswers({
                          ...answers,
                          securitiesGrossIncome: e.target.value
                            ? parseFloat(e.target.value)
                            : undefined,
                        })
                      }
                      className={inputClass}
                      min={0}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Qualifying dividend?
                    </span>
                    <select
                      value={answers.securitiesQualifying ? 'yes' : 'no'}
                      onChange={(e) =>
                        patchAnswers({
                          ...answers,
                          securitiesQualifying: e.target.value === 'yes',
                        })
                      }
                      className={inputClass}
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes (50 % exempt, Art. 115 n°15a)</option>
                    </select>
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Foreign tax on it €
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={answers.securitiesForeignTax ?? ''}
                      onChange={(e) =>
                        patchAnswers({
                          ...answers,
                          securitiesForeignTax: e.target.value
                            ? parseFloat(e.target.value)
                            : undefined,
                        })
                      }
                      className={inputClass}
                      min={0}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                      RELIBI 20 % withheld €
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={answers.securitiesRelibiWithheld ?? ''}
                      onChange={(e) =>
                        patchAnswers({
                          ...answers,
                          securitiesRelibiWithheld: e.target.value
                            ? parseFloat(e.target.value)
                            : undefined,
                        })
                      }
                      className={inputClass}
                      min={0}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Rent received €
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={answers.rentalGrossRent ?? ''}
                      onChange={(e) =>
                        patchAnswers({
                          ...answers,
                          rentalGrossRent: e.target.value ? parseFloat(e.target.value) : undefined,
                        })
                      }
                      className={inputClass}
                      min={0}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Rental charges €
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={answers.rentalCharges ?? ''}
                      onChange={(e) =>
                        patchAnswers({
                          ...answers,
                          rentalCharges: e.target.value ? parseFloat(e.target.value) : undefined,
                        })
                      }
                      className={inputClass}
                      min={0}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Purchase price €
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={answers.rentalPurchasePrice ?? ''}
                      onChange={(e) =>
                        patchAnswers({
                          ...answers,
                          rentalPurchasePrice: e.target.value
                            ? parseFloat(e.target.value)
                            : undefined,
                        })
                      }
                      className={inputClass}
                      min={0}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Completion year
                    </span>
                    <input
                      type="number"
                      value={answers.rentalCompletionYear ?? ''}
                      onChange={(e) =>
                        patchAnswers({
                          ...answers,
                          rentalCompletionYear: e.target.value
                            ? parseInt(e.target.value)
                            : undefined,
                        })
                      }
                      className={inputClass}
                      min={1800}
                      max={2100}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Energy renovation €
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={answers.rentalEnergyRenovationAmount ?? ''}
                      onChange={(e) =>
                        patchAnswers({
                          ...answers,
                          rentalEnergyRenovationAmount: e.target.value
                            ? parseFloat(e.target.value)
                            : undefined,
                        })
                      }
                      className={inputClass}
                      min={0}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Loan interest on it €
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={answers.rentalInterest ?? ''}
                      onChange={(e) =>
                        patchAnswers({
                          ...answers,
                          rentalInterest: e.target.value ? parseFloat(e.target.value) : undefined,
                        })
                      }
                      className={inputClass}
                      min={0}
                    />
                  </div>
                </div>

                <div className="mt-4 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <label className="inline-flex w-fit cursor-pointer items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={answers.rentalForfaitEligible ?? false}
                        onChange={(e) =>
                          patchAnswers({ ...answers, rentalForfaitEligible: e.target.checked })
                        }
                        className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span className="text-xs font-medium text-slate-800">
                        Rental property: private patrimoine completed ≥ 15 years ago — 35 % forfait (max €2,700)
                      </span>
                    </label>
                    <HelpTip id="rentalIncome" />
                  </div>

                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={answers.rentalSocial ?? false}
                      onChange={(e) =>
                        patchAnswers({ ...answers, rentalSocial: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    <span className="text-xs font-medium text-slate-800">
                      Rental managed through a conventioned social agency — 90 % exempt (Art. 115 n° 22a)
                    </span>
                  </label>

                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={answers.relibiFinalElective ?? false}
                      onChange={(e) =>
                        patchAnswers({ ...answers, relibiFinalElective: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    <span className="text-xs font-medium text-slate-800">
                      Treat the 20 % RELIBI withholding as final (interest excluded from the base)
                    </span>
                  </label>
                </div>
              </div>

              {/* Gains and Foreign Income */}
              <div className="border-t border-slate-100 pt-5">
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-700">
                  Gains and foreign income (one row each)
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Movable: proceeds €
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={answers.movableGainProceeds ?? ''}
                      onChange={(e) =>
                        patchAnswers({
                          ...answers,
                          movableGainProceeds: e.target.value
                            ? parseFloat(e.target.value)
                            : undefined,
                        })
                      }
                      className={inputClass}
                      min={0}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Movable: cost €
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={answers.movableGainCost ?? ''}
                      onChange={(e) =>
                        patchAnswers({
                          ...answers,
                          movableGainCost: e.target.value ? parseFloat(e.target.value) : undefined,
                        })
                      }
                      className={inputClass}
                      min={0}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Held (months)
                    </span>
                    <input
                      type="number"
                      value={answers.movableGainHoldingMonths ?? ''}
                      onChange={(e) =>
                        patchAnswers({
                          ...answers,
                          movableGainHoldingMonths: e.target.value
                            ? parseInt(e.target.value)
                            : undefined,
                        })
                      }
                      className={inputClass}
                      min={0}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Participation %
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={answers.movableGainParticipationPercent ?? ''}
                      onChange={(e) =>
                        patchAnswers({
                          ...answers,
                          movableGainParticipationPercent: e.target.value
                            ? parseFloat(e.target.value)
                            : undefined,
                        })
                      }
                      className={inputClass}
                      min={0}
                      max={100}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Real estate: proceeds €
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={answers.realEstateGainProceeds ?? ''}
                      onChange={(e) =>
                        patchAnswers({
                          ...answers,
                          realEstateGainProceeds: e.target.value
                            ? parseFloat(e.target.value)
                            : undefined,
                        })
                      }
                      className={inputClass}
                      min={0}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Real estate: cost €
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={answers.realEstateGainCost ?? ''}
                      onChange={(e) =>
                        patchAnswers({
                          ...answers,
                          realEstateGainCost: e.target.value
                            ? parseFloat(e.target.value)
                            : undefined,
                        })
                      }
                      className={inputClass}
                      min={0}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Held (years)
                    </span>
                    <input
                      type="number"
                      value={answers.realEstateGainHoldingYears ?? ''}
                      onChange={(e) =>
                        patchAnswers({
                          ...answers,
                          realEstateGainHoldingYears: e.target.value
                            ? parseInt(e.target.value)
                            : undefined,
                        })
                      }
                      className={inputClass}
                      min={0}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Principal residence?
                    </span>
                    <select
                      value={answers.realEstateGainPrincipalResidence ? 'yes' : 'no'}
                      onChange={(e) =>
                        patchAnswers({
                          ...answers,
                          realEstateGainPrincipalResidence: e.target.value === 'yes',
                        })
                      }
                      className={inputClass}
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes (exempt)</option>
                    </select>
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Foreign country (ISO)
                    </span>
                    <input
                      type="text"
                      maxLength={2}
                      value={answers.foreignCountry ?? ''}
                      placeholder="FR / DE / BE"
                      onChange={(e) =>
                        patchAnswers({ ...answers, foreignCountry: e.target.value.toUpperCase() })
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Foreign amount €
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={answers.foreignAmount ?? ''}
                      onChange={(e) =>
                        patchAnswers({
                          ...answers,
                          foreignAmount: e.target.value ? parseFloat(e.target.value) : undefined,
                        })
                      }
                      className={inputClass}
                      min={0}
                    />
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Foreign tax paid €
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={answers.foreignTax ?? ''}
                      onChange={(e) =>
                        patchAnswers({
                          ...answers,
                          foreignTax: e.target.value ? parseFloat(e.target.value) : undefined,
                        })
                      }
                      className={inputClass}
                      min={0}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sticky Save Footer Bar (clears mobile bottom dock on < 768px) */}
        <div className="sticky bottom-20 z-20 flex flex-col justify-between gap-3 rounded-2xl border border-zinc-200/90 bg-white/95 px-5 py-3.5 shadow-lg backdrop-blur-md sm:flex-row sm:items-center sm:px-6 sm:py-4 md:bottom-4">
          <div className="text-xs text-zinc-600">
            {isDirty ? (
              <span className="font-semibold text-amber-800">
                You have unsaved questionnaire updates. Save to recalculate readiness.
              </span>
            ) : (
              <span>Your questionnaire answers are synchronized with the calculation engine.</span>
            )}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-950 px-6 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{saving ? 'Saving Questionnaire...' : 'Save Questionnaire & Update Readiness'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
