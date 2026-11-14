'use client';

import React, { useState, useEffect } from 'react';
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

interface QuestionnaireViewProps {
  workspaceId: string;
  onProfileUpdated: () => void;
}

export function QuestionnaireView({ workspaceId, onProfileUpdated }: QuestionnaireViewProps) {
  // No seeded object: until the saved answers arrive there is nothing to edit
  // or to save, so the form must not exist yet.
  const [answers, setAnswers] = useState<QuestionnaireAnswersDto | null>(null);

  // Optional quick estimates
  const [quickSalary, setQuickSalary] = useState('');
  const [quickWithholding, setQuickWithholding] = useState('');
  const [quickMortgage, setQuickMortgage] = useState('');

  const [readiness, setReadiness] = useState<ReadinessDetailsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const updateChildRelief = (index: number, patch: Partial<ChildReliefHistoryEntry>) => {
    if (!answers) return;
    const list = [...(answers.childReliefHistory ?? [])];
    list[index] = { ...list[index], ...patch };
    setAnswers({ ...answers, childReliefHistory: list });
  };

  const removeChildRelief = (index: number) => {
    if (!answers) return;
    const list = (answers.childReliefHistory ?? []).filter((_, i) => i !== index);
    setAnswers({ ...answers, childReliefHistory: list.length > 0 ? list : undefined });
  };

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
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
      setAnswers(res.data.answers);
      setReadiness(res.data.readiness);
      setLoadError('');
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
    return <div className="p-8 text-center text-sm text-slate-500">Loading tax profile questionnaire...</div>;
  }

  // The form only exists once the saved answers are in hand: saving it writes
  // confirmed facts, so an editable form seeded with defaults would present
  // invented answers and then overwrite the real ones.
  if (!answers) {
    return (
      <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-6">
        <h3 className="text-sm font-bold text-rose-900">The tax profile could not be loaded</h3>
        <p className="mt-1 text-xs text-rose-800">
          {loadError || 'The questionnaire is unavailable, so no answers are shown or saved.'}
        </p>
        <button
          onClick={() => refresh()}
          className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  const unresolvedTasks = readiness?.tasks.filter((t) => !t.isResolved) || [];

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {feedback && (
        <div
          className={`p-4 rounded-xl text-sm font-semibold flex items-center justify-between border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="text-xs opacity-60 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* Readiness Progress Bar */}
      {readiness && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Workspace Readiness & Completeness
              </span>
              <h3 className="text-xl font-bold text-slate-900 mt-0.5">
                {readiness.completionScore}% Completed
              </h3>
            </div>
            <div className="flex gap-2">
              {readiness.unresolvedBlockers > 0 && (
                <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800">
                  {readiness.unresolvedBlockers} Blocker{readiness.unresolvedBlockers > 1 ? 's' : ''}
                </span>
              )}
              {readiness.unresolvedWarnings > 0 && (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                  {readiness.unresolvedWarnings} Warning{readiness.unresolvedWarnings > 1 ? 's' : ''}
                </span>
              )}
              {readiness.unresolvedBlockers === 0 && readiness.unresolvedWarnings === 0 && (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                  ✓ Ready for 2025 Filing
                </span>
              )}
            </div>
          </div>
          <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
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
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-5">
          <h4 className="text-sm font-bold text-amber-900 mb-3">
            Missing Information Checklist ({unresolvedTasks.length})
          </h4>
          <div className="space-y-2">
            {unresolvedTasks.map((task) => (
              <div
                key={task.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border border-amber-200 bg-white p-3 shadow-sm gap-2"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        task.severity === TaskSeverity.BLOCKER
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {task.severity}
                    </span>
                    <h5 className="text-xs font-bold text-slate-900">{task.title}</h5>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{task.description}</p>
                </div>
                <button
                  type="button"
                  disabled={resolvingId === task.id}
                  onClick={() => handleResolveTask(task.id)}
                  className="self-end sm:self-center shrink-0 rounded bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition disabled:opacity-50"
                >
                  {resolvingId === task.id ? 'Resolving...' : '✓ Mark Resolved'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Guided Questionnaire Form */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-1">
          Guided household tax questionnaire
        </h3>
        <p className="text-xs text-slate-500 mb-6">
          Answers adapt the required tax schedule, deductions, and form annexes without requiring complex tax knowledge.
        </p>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Marital Status */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Marital / Household Status
                  {' '}
                  <HelpTip id="householdStatus" />
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {(['SINGLE', 'MARRIED', 'PACS', 'DIVORCED', 'WIDOWED'] as const).map((status) => (
                <button
                  type="button"
                  key={status}
                  onClick={() => setAnswers({ ...answers, maritalStatus: status })}
                  className={`rounded-lg border py-2.5 px-3 text-xs font-bold transition-all ${
                    answers.maritalStatus === status
                      ? 'border-sky-600 bg-sky-50 text-sky-700 shadow-sm'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {/* Art. 3 d) — mixed couple: where the spouse lives, and the collective request */}
          {(answers.maritalStatus === 'MARRIED' || answers.maritalStatus === 'PACS') && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <label className="block text-[11px] font-semibold text-slate-600">
                Where does your spouse live?
                  {' '}
                  <HelpTip id="mixedCouple" />
              </label>
              <select
                value={answers.spouseResidence ?? ''}
                onChange={(e) =>
                  setAnswers({
                    ...answers,
                    spouseResidence: (e.target.value || undefined) as
                      | 'RESIDENT'
                      | 'NON_RESIDENT'
                      | undefined,
                  })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
              >
                <option value="">Same country as me</option>
                <option value="RESIDENT">Luxembourg (resident)</option>
                <option value="NON_RESIDENT">Abroad (non-resident)</option>
              </select>

              {answers.spouseResidence && (
                  <label className="flex items-start gap-2 text-[11px] text-slate-700">
                    <input
                      type="checkbox"
                      checked={answers.mixedCoupleCollectiveRequested ?? false}
                      onChange={(e) =>
                        setAnswers({ ...answers, mixedCoupleCollectiveRequested: e.target.checked })
                      }
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    <span>
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
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Year of spouse's death
                  {' '}
                  <HelpTip id="class2Window" />
              </label>
              <input
                type="number"
                value={answers.spouseDeathYear ?? ''}
                placeholder="e.g. 2024"
                onChange={(e) =>
                  setAnswers({ ...answers, spouseDeathYear: e.target.value ? parseInt(e.target.value) : undefined })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                min={1900}
                max={2100}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Class 2 is kept for the year of death and the three following years (Art. 119 n° 3 b).
              </p>
            </div>
          )}

          {answers.maritalStatus === 'DIVORCED' && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 grid gap-3 sm:grid-cols-2 items-start">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Year of divorce / separation
                </label>
                <input
                  type="number"
                  value={answers.divorceOrSeparationYear ?? ''}
                  placeholder="e.g. 2023"
                  onChange={(e) =>
                    setAnswers({
                      ...answers,
                      divorceOrSeparationYear: e.target.value ? parseInt(e.target.value) : undefined,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={1900}
                  max={2100}
                />
              </div>
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={answers.class2BeforeEvent ?? false}
                    onChange={(e) => setAnswers({ ...answers, class2BeforeEvent: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-xs font-medium text-slate-800">
                    Class 2 for five years before the divorce (Art. 119 n° 3 c)
                  </span>
                </label>
                <p className="mt-1 ml-7 text-[11px] text-slate-500">
                  If true, Class 2 is kept for the event year and the three following years.
                </p>
              </div>
            </div>
          )}

          {/* Income Sources */}
          <div className="border-t border-slate-100 pt-5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
              Income Sources in Luxembourg
            </label>
            <div className="space-y-3">
              <label className="inline-flex items-center gap-3 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={answers.hasEmploymentIncome}
                  onChange={(e) => setAnswers({ ...answers, hasEmploymentIncome: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  Employment Income (Salaires / Traitements)

                </span>
              </label>
              <HelpTip id="employmentIncome" className="ml-1" />

              {answers.hasEmploymentIncome && (
                <div className="ml-7 grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Estimated Annual Gross Salary (€)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 75000"
                      value={quickSalary}
                      onChange={(e) => setQuickSalary(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Withheld Tax at Source (€)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 12500"
                      value={quickWithholding}
                      onChange={(e) => setQuickWithholding(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                    />
                  </div>
                </div>
              )}

              <label className="inline-flex items-center gap-3 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={answers.hasFreelanceIncome ?? false}
                  onChange={(e) => setAnswers({ ...answers, hasFreelanceIncome: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  Freelance & Independent Business Income (Art. 14 / Art. 91 LIR)

                </span>
              </label>
              <HelpTip id="freelanceIncome" className="ml-1" />

              {answers.hasFreelanceIncome && (
                <div className="ml-7 p-3 bg-indigo-50/70 rounded-xl border border-indigo-200 text-xs text-indigo-900">
                  <p className="font-semibold mb-1">Freelance & Business Hub Active</p>
                  <p className="text-[11px] text-indigo-700">
                    Use the dedicated <strong>Freelance & Business</strong> tab to track client invoices, deductible operating expenses, and VAT returns for each spouse.
                  </p>
                </div>
              )}

              <label className="inline-flex items-center gap-3 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={answers.hasPensionIncome}
                  onChange={(e) => setAnswers({ ...answers, hasPensionIncome: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  Pension Income (Pensions ou rentes)

                </span>
              </label>
              <HelpTip id="pensionIncome" className="ml-1" />
            </div>
          </div>

          {/* Deductions & Mortgage */}
          <div className="border-t border-slate-100 pt-5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
              Deductions & Special Expenses
            </label>
            <div className="space-y-4">
              <div>
                <label className="inline-flex items-center gap-3 cursor-pointer w-fit">
                  <input
                    type="checkbox"
                    checked={answers.hasPrimaryResidenceMortgage}
                    onChange={(e) =>
                      setAnswers({ ...answers, hasPrimaryResidenceMortgage: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-xs font-medium text-slate-800">
                    Mortgage Interest on Primary Residence (Habitation personnelle)

                  </span>
                </label>
              <HelpTip id="mortgageInterest" className="ml-1" />
                {answers.hasPrimaryResidenceMortgage && (
                  <div className="mt-3 ml-7 grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                      <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Year the valeur locative was fixed (not the occupation year):
                      </span>
                      <input
                        type="number"
                        value={answers.mortgageOccupancyYear || 2020}
                        onChange={(e) =>
                          setAnswers({
                            ...answers,
                            mortgageOccupancyYear: parseInt(e.target.value) || 2020,
                          })
                        }
                        className="w-full rounded border border-slate-300 px-3 py-1.5 text-xs"
                        min={1970}
                        max={2030}
                      />
                    </div>
                    <div>
                      <span className="block text-[11px] font-semibold text-slate-600 mb-1">Estimated Annual Interest Paid (€):</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="e.g. 3500"
                        value={quickMortgage}
                        onChange={(e) => setQuickMortgage(e.target.value)}
                        className="w-full rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                      />
                    </div>
                  </div>
                )}
              </div>

              <label className="inline-flex items-center gap-3 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={answers.hasLifeInsuranceOrPensionPlan}
                  onChange={(e) =>
                    setAnswers({ ...answers, hasLifeInsuranceOrPensionPlan: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  Private insurance / consumer-loan interest (Art. 111 — €672 envelope)

                </span>
              </label>
              <HelpTip id="art111" className="ml-1" />

              <label className="inline-flex items-center gap-3 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={answers.hasDonations}
                  onChange={(e) => setAnswers({ ...answers, hasDonations: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  Charitable Donations to Recognized Foundations (Art 112 LIR)

                </span>
              </label>
              <HelpTip id="donations" className="ml-1" />
            </div>
          </div>

          {/* Household & professional profile (drives class, AEP, plafonds) */}
          <div className="border-t border-slate-100 pt-5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
              Household &amp; professional profile
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Your age on 1 January
                </span>
                <input
                  type="number"
                  value={answers.primaryAge ?? ''}
                  placeholder="e.g. 42"
                  onChange={(e) =>
                    setAnswers({ ...answers, primaryAge: e.target.value ? parseInt(e.target.value) : undefined })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={16}
                  max={110}
                />
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Spouse age on 1 January
                </span>
                <input
                  type="number"
                  value={answers.spouseAge ?? ''}
                  placeholder="e.g. 40"
                  onChange={(e) =>
                    setAnswers({ ...answers, spouseAge: e.target.value ? parseInt(e.target.value) : undefined })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={16}
                  max={110}
                />
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Unités d'éloignement — you (Art. 105bis)
                  {' '}
                  <HelpTip id="travelUnits" />
                </span>
                <input
                  type="number"
                  value={answers.travelUnitsPrimary ?? ''}
                  placeholder="0"
                  onChange={(e) =>
                    setAnswers({ ...answers, travelUnitsPrimary: e.target.value ? parseInt(e.target.value) : undefined })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={0}
                  max={60}
                />
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Unités d'éloignement — spouse
                </span>
                <input
                  type="number"
                  value={answers.travelUnitsSpouse ?? ''}
                  placeholder="0"
                  onChange={(e) =>
                    setAnswers({ ...answers, travelUnitsSpouse: e.target.value ? parseInt(e.target.value) : undefined })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={0}
                  max={60}
                />
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Prior-year losses carried forward (Art. 114, €)
                  {' '}
                  <HelpTip id="priorYearLosses" />
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={answers.priorYearLosses ?? ''}
                  placeholder="0"
                  onChange={(e) =>
                    setAnswers({ ...answers, priorYearLosses: e.target.value ? parseFloat(e.target.value) : undefined })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={0}
                />
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Children with a modération d'impôt
                </span>
                <input
                  type="number"
                  value={answers.childrenWithModeration ?? ''}
                  placeholder="same as dependants"
                  onChange={(e) =>
                    setAnswers({
                      ...answers,
                      childrenWithModeration: e.target.value ? parseInt(e.target.value) : undefined,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={0}
                  max={20}
                />
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Moderated children with no family allowance / CEDIES / SNJ (Art. 122 dégrèvement)
                  {' '}
                  <HelpTip id="childrenModeration" />
                </span>
                <input
                  type="number"
                  value={answers.moderatedChildrenWithoutBenefit ?? ''}
                  placeholder="0"
                  onChange={(e) =>
                    setAnswers({
                      ...answers,
                      moderatedChildrenWithoutBenefit: e.target.value ? parseInt(e.target.value) : undefined,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={0}
                  max={20}
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Each such child gives EUR 922.50, capped at the tax due and never refundable.
                </p>
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Children with expired moderation (bonification, Art. 123bis)
                  {' '}
                  <HelpTip id="childrenBonification" />
                </span>
                <input
                  type="number"
                  value={answers.childrenWithBonification ?? ''}
                  placeholder="0"
                  onChange={(e) =>
                    setAnswers({
                      ...answers,
                      childrenWithBonification: e.target.value ? parseInt(e.target.value) : undefined,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={0}
                  max={20}
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Child left the household / studies finished; at most two bonifications per child.
                </p>
              </div>

              <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Child relief history (Art. 122 / 123bis) — optional, overrides the three counts above
                    </span>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Per child: still moderated this year, or the year the moderation ended, and how many bonifications
                      it has already generated (maximum two over its lifetime).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setAnswers({
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
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white"
                  >
                    + Add child
                  </button>
                </div>

                {(answers.childReliefHistory ?? []).length > 0 && (
                  <div className="mt-2 space-y-2">
                    {(answers.childReliefHistory ?? []).map((child, index) => (
                      <div
                        key={index}
                        className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 sm:grid-cols-6"
                      >
                        <label className="text-[11px] font-semibold text-slate-600">
                          Label
                          <input
                            type="text"
                            value={child.childId ?? ''}
                            onChange={(e) => updateChildRelief(index, { childId: e.target.value })}
                            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                          <input
                            type="checkbox"
                            checked={child.moderationThisYear === true}
                            onChange={(e) => updateChildRelief(index, { moderationThisYear: e.target.checked })}
                          />
                          Moderated this year
                        </label>
                        <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                          <input
                            type="checkbox"
                            checked={child.benefitReceived === true}
                            onChange={(e) => updateChildRelief(index, { benefitReceived: e.target.checked })}
                          />
                          Allowance / CEDIES / SNJ paid
                        </label>
                        <label className="text-[11px] font-semibold text-slate-600">
                          Moderation ended (year)
                          <input
                            type="number"
                            value={child.moderationEndYear ?? ''}
                            placeholder="e.g. 2024"
                            onChange={(e) =>
                              updateChildRelief(index, {
                                moderationEndYear: e.target.value ? parseInt(e.target.value) : undefined,
                              })
                            }
                            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                            min={1900}
                            max={2100}
                          />
                        </label>
                        <label className="text-[11px] font-semibold text-slate-600">
                          Bonifications already granted
                          <input
                            type="number"
                            value={child.bonificationsGranted ?? ''}
                            placeholder="0"
                            onChange={(e) =>
                              updateChildRelief(index, {
                                bonificationsGranted: e.target.value ? parseInt(e.target.value) : undefined,
                              })
                            }
                            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs"
                            min={0}
                            max={2}
                          />
                        </label>
                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={() => removeChildRelief(index)}
                            className="w-full rounded border border-rose-200 px-2 py-1.5 text-[11px] font-semibold text-rose-600"
                          >
                            Remove
                          </button>
                        </div>
                        <div className="grid gap-2 sm:col-span-6 sm:grid-cols-3">
                          <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                            <input
                              type="checkbox"
                              checked={child.inHousehold === false}
                              onChange={(e) => updateChildRelief(index, { inHousehold: e.target.checked ? false : undefined })}
                            />
                            Lives outside this household
                          </label>
                          <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                            <input
                              type="checkbox"
                              checked={child.residenceAlternee === true}
                              onChange={(e) => updateChildRelief(index, { residenceAlternee: e.target.checked })}
                            />
                            Résidence alternée (2025–2026 only)
                          </label>
                          <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                            <input
                              type="checkbox"
                              checked={child.jointParentalAuthority === true && child.familyAllowanceReceived === true}
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

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Reduced working capacity (0–1, invalidity forfait)
                  {' '}
                  <HelpTip id="invalidity" />
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={answers.invalidityRatePrimary ?? ''}
                  placeholder="e.g. 0.40"
                  onChange={(e) =>
                    setAnswers({ ...answers, invalidityRatePrimary: e.target.value ? parseFloat(e.target.value) : undefined })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={0}
                  max={1}
                />
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Épargne-logement subscriber age on 1 January
                  {' '}
                  <HelpTip id="savingsHousing" />
                </span>
                <input
                  type="number"
                  value={answers.savingsHousingSubscriberAge ?? ''}
                  placeholder="≤ 40 gives €1,344"
                  onChange={(e) =>
                    setAnswers({
                      ...answers,
                      savingsHousingSubscriberAge: e.target.value ? parseInt(e.target.value) : undefined,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={16}
                  max={110}
                />
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Prime jeune salarié received (€, Art. 115 n° 13d)
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={answers.youngEmployeePrime ?? ''}
                  placeholder="0"
                  onChange={(e) =>
                    setAnswers({ ...answers, youngEmployeePrime: e.target.value ? parseFloat(e.target.value) : undefined })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={0}
                />
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Prime jeune salarié conditions met?
                </span>
                <select
                  value={answers.youngEmployeePrimeEligible ? 'yes' : 'no'}
                  onChange={(e) => setAnswers({ ...answers, youngEmployeePrimeEligible: e.target.value === 'yes' })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                >
                  <option value="no">No / not applicable</option>
                  <option value="yes">Under 30, first CDI in LU, first prime &lt; 5 years</option>
                </select>
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  111bis souscripteurs (1 or 2)
                </span>
                <input
                  type="number"
                  value={answers.art111bisContributors ?? ''}
                  placeholder="default 2 if married"
                  onChange={(e) =>
                    setAnswers({
                      ...answers,
                      art111bisContributors: e.target.value ? parseInt(e.target.value) : undefined,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={1}
                  max={2}
                />
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Allocations paid for the child (CIM reduction, €)
                  {' '}
                  <HelpTip id="cim" />
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={answers.childAllocations ?? ''}
                  placeholder="0"
                  onChange={(e) =>
                    setAnswers({ ...answers, childAllocations: e.target.value ? parseFloat(e.target.value) : undefined })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={0}
                />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <label className="inline-flex items-center gap-3 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={answers.spouseHasProfessionalIncome ?? false}
                  onChange={(e) => setAnswers({ ...answers, spouseHasProfessionalIncome: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  My spouse also has professional income (salary or side-business) — Art. 129b AEP €4,500

                </span>
              </label>
              <HelpTip id="spouseProfessional" className="ml-1" />

              <label className="inline-flex items-center gap-3 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={answers.spouseIsConjointAidant ?? false}
                  onChange={(e) => setAnswers({ ...answers, spouseIsConjointAidant: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  My spouse is registered as conjoint-aidant in my business

                </span>
              </label>
              <HelpTip id="conjointAidant" className="ml-1" />

              <label className="inline-flex items-center gap-3 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={
                    answers.isSingleParent ??
                    ((answers.maritalStatus === 'SINGLE' ||
                      answers.maritalStatus === 'DIVORCED' ||
                      answers.maritalStatus === 'WIDOWED') &&
                      (answers.childrenWithModeration ?? answers.childrenCount ?? 0) > 0)
                  }
                  onChange={(e) => setAnswers({ ...answers, isSingleParent: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  Single parent (CIM, Art. 154ter)

                  <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                    Automatic for a single, divorced or widowed parent with a moderated child; tick only to force it
                    on or off.
                  </span>
                </span>
              </label>
              <HelpTip id="cim" className="ml-1" />

              <label className="inline-flex items-center gap-3 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={answers.bothParentsSameHome ?? false}
                  onChange={(e) => setAnswers({ ...answers, bothParentsSameHome: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  Both parents live in the same home as the child (excludes the CIM)

                </span>
              </label>
              <HelpTip id="cim" className="ml-1" />

              <label className="inline-flex items-center gap-3 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={answers.hasPensionSavingsContract ?? false}
                  onChange={(e) => setAnswers({ ...answers, hasPensionSavingsContract: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  I hold a prévoyance-vieillesse contract (Art. 111bis — cap €3,200 for 2025, €4,500 from 2026)

                </span>
              </label>
              <HelpTip id="art111bis" className="ml-1" />

              <label className="inline-flex items-center gap-3 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={answers.hasSavingsHousingContract ?? false}
                  onChange={(e) => setAnswers({ ...answers, hasSavingsHousingContract: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  I hold an épargne-logement contract (Art. 111 al. 5 — €1,344 / €672)

                </span>
              </label>
              <HelpTip id="savingsHousing" className="ml-1" />

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={answers.amvpEligible ?? false}
                  onChange={(e) => setAnswers({ ...answers, amvpEligible: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  I keep working after becoming eligible for an early pension — AMVP €9,000 (2026 only)
                </span>
              </label>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  ASRD single premium (€, Art. 111 al. 3/4)
                  {' '}
                  <HelpTip id="asrd" />
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={answers.asrdPrimeUnique ?? ''}
                  placeholder="0"
                  onChange={(e) =>
                    setAnswers({ ...answers, asrdPrimeUnique: e.target.value ? parseFloat(e.target.value) : undefined })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={0}
                />
              </div>
              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Your age when the ASRD was taken out
                </span>
                <input
                  type="number"
                  value={answers.asrdSubscriberAge ?? ''}
                  placeholder="e.g. 35"
                  onChange={(e) =>
                    setAnswers({ ...answers, asrdSubscriberAge: e.target.value ? parseInt(e.target.value) : undefined })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={16}
                  max={110}
                />
              </div>
              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Start-up investment (2026, € — 20 % credit, cap €100,000)
                  {' '}
                  <HelpTip id="startupInvestment" />
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={answers.startupInvestment ?? ''}
                  placeholder="0"
                  onChange={(e) =>
                    setAnswers({ ...answers, startupInvestment: e.target.value ? parseFloat(e.target.value) : undefined })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  min={0}
                />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={answers.spouseEmployedByBusiness ?? false}
                  onChange={(e) => setAnswers({ ...answers, spouseEmployedByBusiness: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  My spouse is paid a salary by our business — Art. 48 n° 3 blocks the deduction in Class 2
                </span>
              </label>

              <label className="inline-flex items-center gap-3 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={answers.rentalForfaitEligible ?? false}
                  onChange={(e) => setAnswers({ ...answers, rentalForfaitEligible: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  Rental property: private patrimoine completed ≥ 15 years ago — 35 % forfait (max €2,700)

                </span>
              </label>
              <HelpTip id="rentalIncome" className="ml-1" />

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={answers.rentalSocial ?? false}
                  onChange={(e) => setAnswers({ ...answers, rentalSocial: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  Rental managed through a conventioned social agency — 90 % exempt (Art. 115 n° 22a)
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={answers.nonResidentAssimilation ?? false}
                  onChange={(e) => setAnswers({ ...answers, nonResidentAssimilation: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  I am a non-resident asking for assimilation (≥ 90 % of worldwide income in Luxembourg, or foreign net &lt; €13,000)
                </span>
              </label>
            </div>

            {answers.nonResidentAssimilation && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Worldwide income (€)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={answers.worldwideIncome ?? ''}
                    onChange={(e) =>
                      setAnswers({ ...answers, worldwideIncome: e.target.value ? parseFloat(e.target.value) : undefined })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                    min={0}
                  />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Luxembourg professional income (€)
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={answers.luxembourgProfessionalIncome ?? ''}
                    onChange={(e) =>
                      setAnswers({
                        ...answers,
                        luxembourgProfessionalIncome: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                    min={0}
                  />
                </div>
              </div>
            )}

            <div className="mt-6 border-t border-slate-100 pt-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-2">
                Capital and rental (one row each)
                    {" "}<HelpTip id="capitalIncome" />
              </p>
              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Securities income €</span>
                  <input type="number" step="0.01" value={answers.securitiesGrossIncome ?? ''}
                    onChange={(e) => setAnswers({ ...answers, securitiesGrossIncome: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Qualifying dividend?</span>
                  <select value={answers.securitiesQualifying ? 'yes' : 'no'}
                    onChange={(e) => setAnswers({ ...answers, securitiesQualifying: e.target.value === 'yes' })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold">
                    <option value="no">No</option>
                    <option value="yes">Yes (50 % exempt, Art. 115 n°15a)</option>
                  </select>
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Foreign tax on it €</span>
                  <input type="number" step="0.01" value={answers.securitiesForeignTax ?? ''}
                    onChange={(e) => setAnswers({ ...answers, securitiesForeignTax: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">RELIBI 20 % withheld €</span>
                  <input type="number" step="0.01" value={answers.securitiesRelibiWithheld ?? ''}
                    onChange={(e) => setAnswers({ ...answers, securitiesRelibiWithheld: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Rent received €</span>
                  <input type="number" step="0.01" value={answers.rentalGrossRent ?? ''}
                    onChange={(e) => setAnswers({ ...answers, rentalGrossRent: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Rental charges €</span>
                  <input type="number" step="0.01" value={answers.rentalCharges ?? ''}
                    onChange={(e) => setAnswers({ ...answers, rentalCharges: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Purchase price €</span>
                  <input type="number" step="0.01" value={answers.rentalPurchasePrice ?? ''}
                    onChange={(e) => setAnswers({ ...answers, rentalPurchasePrice: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Completion year</span>
                  <input type="number" value={answers.rentalCompletionYear ?? ''}
                    onChange={(e) => setAnswers({ ...answers, rentalCompletionYear: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={1800} max={2100} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Energy renovation €</span>
                  <input type="number" step="0.01" value={answers.rentalEnergyRenovationAmount ?? ''}
                    onChange={(e) => setAnswers({ ...answers, rentalEnergyRenovationAmount: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Loan interest on it €</span>
                  <input type="number" step="0.01" value={answers.rentalInterest ?? ''}
                    onChange={(e) => setAnswers({ ...answers, rentalInterest: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
              </div>
              <label className="mt-2 flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={answers.relibiFinalElective ?? false}
                  onChange={(e) => setAnswers({ ...answers, relibiFinalElective: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                <span className="text-xs font-medium text-slate-800">
                  Treat the 20 % RELIBI withholding as final (interest excluded from the base)
                </span>
              </label>
            </div>

            <div className="mt-6 border-t border-slate-100 pt-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-2">
                Gains and foreign income (one row each)
              </p>
              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Movable: proceeds €</span>
                  <input type="number" step="0.01" value={answers.movableGainProceeds ?? ''}
                    onChange={(e) => setAnswers({ ...answers, movableGainProceeds: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Movable: cost €</span>
                  <input type="number" step="0.01" value={answers.movableGainCost ?? ''}
                    onChange={(e) => setAnswers({ ...answers, movableGainCost: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Held (months)</span>
                  <input type="number" value={answers.movableGainHoldingMonths ?? ''}
                    onChange={(e) => setAnswers({ ...answers, movableGainHoldingMonths: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Participation %</span>
                  <input type="number" step="0.01" value={answers.movableGainParticipationPercent ?? ''}
                    onChange={(e) => setAnswers({ ...answers, movableGainParticipationPercent: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} max={100} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Real estate: proceeds €</span>
                  <input type="number" step="0.01" value={answers.realEstateGainProceeds ?? ''}
                    onChange={(e) => setAnswers({ ...answers, realEstateGainProceeds: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Real estate: cost €</span>
                  <input type="number" step="0.01" value={answers.realEstateGainCost ?? ''}
                    onChange={(e) => setAnswers({ ...answers, realEstateGainCost: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Held (years)</span>
                  <input type="number" value={answers.realEstateGainHoldingYears ?? ''}
                    onChange={(e) => setAnswers({ ...answers, realEstateGainHoldingYears: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Principal residence?</span>
                  <select value={answers.realEstateGainPrincipalResidence ? 'yes' : 'no'}
                    onChange={(e) => setAnswers({ ...answers, realEstateGainPrincipalResidence: e.target.value === 'yes' })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold">
                    <option value="no">No</option>
                    <option value="yes">Yes (exempt)</option>
                  </select>
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Foreign country (ISO)</span>
                  <input type="text" maxLength={2} value={answers.foreignCountry ?? ''}
                    placeholder="FR / DE / BE"
                    onChange={(e) => setAnswers({ ...answers, foreignCountry: e.target.value.toUpperCase() })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Foreign amount €</span>
                  <input type="number" step="0.01" value={answers.foreignAmount ?? ''}
                    onChange={(e) => setAnswers({ ...answers, foreignAmount: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">Foreign tax paid €</span>
                  <input type="number" step="0.01" value={answers.foreignTax ?? ''}
                    onChange={(e) => setAnswers({ ...answers, foreignTax: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" min={0} />
                </div>
              </div>
            </div>

            {(answers.maritalStatus === 'MARRIED' || answers.maritalStatus === 'PACS') && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Assessment (Art. 3 / 3bis / 3ter)
                  </span>
                  <select
                    value={answers.assessmentMode ?? 'COLLECTIVE'}
                    onChange={(e) =>
                      setAnswers({ ...answers, assessmentMode: e.target.value as QuestionnaireAnswersDto['assessmentMode'] })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                  >
                    <option value="COLLECTIVE">Collective (Class 2)</option>
                    <option value="INDIVIDUAL_PURE">Individual, pure (Class 1 each)</option>
                    <option value="INDIVIDUAL_REALLOCATION">Individual with reallocation</option>
                  </select>
                </div>
                {answers.assessmentMode === 'INDIVIDUAL_REALLOCATION' && (
                  <div>
                    <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Your share of the joint income (%)
                    </span>
                    <input
                      type="number"
                      value={answers.reallocationPercentPrimary ?? 50}
                      onChange={(e) =>
                        setAnswers({ ...answers, reallocationPercentPrimary: parseFloat(e.target.value) || 50 })
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                      min={0}
                      max={100}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Children & Dependants */}
          <div className="border-t border-slate-100 pt-5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Number of Dependent Children
            </label>
            <input
              type="number"
              value={answers.childrenCount}
              onChange={(e) =>
                setAnswers({ ...answers, childrenCount: Math.max(0, parseInt(e.target.value) || 0) })
              }
              className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
              min={0}
              max={15}
            />
          </div>

          <div className="flex items-center gap-4 pt-4 border-t border-slate-100">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-sky-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-sky-500 disabled:opacity-50 transition"
            >
              {saving ? 'Saving Questionnaire...' : 'Save Questionnaire & Update Readiness'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
