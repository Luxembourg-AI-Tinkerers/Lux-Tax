'use client';

import React, { useState, useEffect } from 'react';
import { apiClient } from '../lib/api';
import {
  QuestionnaireAnswersDto,
  ReadinessDetailsDto,
  TaskSeverity,
  FactCategory,
} from '@luxtax/contracts';

interface QuestionnaireViewProps {
  workspaceId: string;
  onProfileUpdated: () => void;
}

export function QuestionnaireView({ workspaceId, onProfileUpdated }: QuestionnaireViewProps) {
  const [answers, setAnswers] = useState<QuestionnaireAnswersDto>({
    maritalStatus: 'SINGLE',
    hasEmploymentIncome: true,
    hasPensionIncome: false,
    hasPrimaryResidenceMortgage: false,
    mortgageOccupancyYear: 2020,
    hasLifeInsuranceOrPensionPlan: false,
    hasDonations: false,
    childrenCount: 0,
  });

  // Optional quick estimates
  const [quickSalary, setQuickSalary] = useState('');
  const [quickWithholding, setQuickWithholding] = useState('');
  const [quickMortgage, setQuickMortgage] = useState('');

  const [readiness, setReadiness] = useState<ReadinessDetailsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const refresh = async () => {
    setLoading(true);
    const res = await apiClient.getQuestionnaire(workspaceId);
    if (res.data) {
      setAnswers(res.data.answers);
      setReadiness(res.data.readiness);
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, [workspaceId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
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

      // If user entered quick financial estimates, save them as confirmed facts
      if (quickSalary && parseFloat(quickSalary) > 0) {
        await apiClient.confirmFact(workspaceId, {
          category: FactCategory.EMPLOYMENT_INCOME,
          fieldKey: 'grossSalary',
          amount: parseFloat(quickSalary).toFixed(2),
          currency: 'EUR',
          description: 'Estimated Annual Gross Salary',
          isIncludedInReturn: true,
          isSharedWithHousehold: true,
        });
      }
      if (quickWithholding && parseFloat(quickWithholding) > 0) {
        await apiClient.confirmFact(workspaceId, {
          category: FactCategory.EMPLOYMENT_INCOME,
          fieldKey: 'withholdingTax',
          amount: parseFloat(quickWithholding).toFixed(2),
          currency: 'EUR',
          description: 'Tax Withheld at Source',
          isIncludedInReturn: true,
          isSharedWithHousehold: true,
        });
      }
      if (quickMortgage && parseFloat(quickMortgage) > 0) {
        await apiClient.confirmFact(workspaceId, {
          category: FactCategory.MORTGAGE_DEDUCTION,
          fieldKey: 'mortgageInterest',
          amount: parseFloat(quickMortgage).toFixed(2),
          currency: 'EUR',
          description: 'Primary Residence Mortgage Interest',
          isIncludedInReturn: true,
          isSharedWithHousehold: true,
        });
      }

      showFeedback('success', 'Tax profile questionnaire & readiness saved successfully!');
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
          Guided Household Tax Questionnaire (2025)
        </h3>
        <p className="text-xs text-slate-500 mb-6">
          Answers adapt the required tax schedule, deductions, and form annexes without requiring complex tax knowledge.
        </p>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Marital Status */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Marital / Household Status
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

          {/* Income Sources */}
          <div className="border-t border-slate-100 pt-5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
              Income Sources in Luxembourg
            </label>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
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

              <label className="flex items-center gap-3 cursor-pointer">
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
            </div>
          </div>

          {/* Deductions & Mortgage */}
          <div className="border-t border-slate-100 pt-5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
              Deductions & Special Expenses
            </label>
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
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
                {answers.hasPrimaryResidenceMortgage && (
                  <div className="mt-3 ml-7 grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                      <span className="block text-[11px] font-semibold text-slate-600 mb-1">Year of First Occupation:</span>
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
                        max={2025}
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

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={answers.hasLifeInsuranceOrPensionPlan}
                  onChange={(e) =>
                    setAnswers({ ...answers, hasLifeInsuranceOrPensionPlan: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-slate-800">
                  Life Insurance / Private Pension Plans (Art 111 / 111bis LIR)
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
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
            </div>
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
