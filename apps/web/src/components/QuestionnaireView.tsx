'use client';

import React, { useState, useEffect } from 'react';
import { apiClient } from '../lib/api';
import {
  QuestionnaireAnswersDto,
  ReadinessDetailsDto,
  TaskSeverity,
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
  const [readiness, setReadiness] = useState<ReadinessDetailsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

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
    setSaveSuccess(false);

    const res = await apiClient.saveQuestionnaire(workspaceId, answers);
    if (res.data) {
      setAnswers(res.data.answers);
      setReadiness(res.data.readiness);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      onProfileUpdated();
    }
    setSaving(false);
  };

  const handleResolveTask = async (taskId: string) => {
    await apiClient.resolveTask(workspaceId, taskId);
    await refresh();
    onProfileUpdated();
  };

  if (loading) {
    return <div className="p-8 text-center text-sm text-slate-500">Loading tax profile questionnaire...</div>;
  }

  return (
    <div className="space-y-6">
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
      {readiness && readiness.tasks.filter((t) => !t.isResolved).length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-5">
          <h4 className="text-sm font-bold text-amber-900 mb-3">
            Missing Information Checklist ({readiness.tasks.filter((t) => !t.isResolved).length})
          </h4>
          <div className="space-y-2">
            {readiness.tasks
              .filter((t) => !t.isResolved)
              .map((task) => (
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
                    onClick={() => handleResolveTask(task.id)}
                    className="self-end sm:self-center shrink-0 rounded bg-slate-100 hover:bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
                  >
                    Mark Resolved
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
                  <div className="mt-2 ml-7 flex items-center gap-3">
                    <span className="text-xs text-slate-500">Year of Occupation:</span>
                    <input
                      type="number"
                      value={answers.mortgageOccupancyYear || 2020}
                      onChange={(e) =>
                        setAnswers({
                          ...answers,
                          mortgageOccupancyYear: parseInt(e.target.value) || 2020,
                        })
                      }
                      className="w-24 rounded border border-slate-300 px-2 py-1 text-xs"
                      min={1970}
                      max={2025}
                    />
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
              className="w-24 rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold"
              min={0}
              max={15}
            />
          </div>

          <div className="flex items-center gap-4 pt-4 border-t border-slate-100">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-500 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Questionnaire & Update Readiness'}
            </button>
            {saveSuccess && (
              <span className="text-xs font-semibold text-emerald-600">
                ✓ Questionnaire saved successfully
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
