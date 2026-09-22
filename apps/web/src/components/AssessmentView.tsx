'use client';

import React, { useState, useEffect } from 'react';
import { apiClient } from '../lib/api';
import { AssessmentDto, TaxYearWorkspaceDto } from '@luxtax/contracts';

interface AssessmentViewProps {
  workspace: TaxYearWorkspaceDto;
  onRefresh: () => void;
}

export function AssessmentView({ workspace, onRefresh }: AssessmentViewProps) {
  const [assessment, setAssessment] = useState<AssessmentDto | null>(null);
  const [bulletinDate, setBulletinDate] = useState('2026-09-01');
  const [assessedIncome, setAssessedIncome] = useState('');
  const [assessedTax, setAssessedTax] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [rollingOver, setRollingOver] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5000);
  };

  const loadAssessment = async () => {
    const res = await apiClient.getAssessment(workspace.id);
    if (res.data) {
      setAssessment(res.data);
    }
  };

  useEffect(() => {
    loadAssessment();
  }, [workspace.id]);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const res = await apiClient.importAssessment(workspace.id, {
      taxYear: workspace.taxYear,
      bulletinDate,
      assessedTaxableIncome: assessedIncome,
      assessedTaxDue: assessedTax,
    });
    setSubmitting(false);

    if (res.error) {
      showFeedback('error', res.error);
    } else if (res.data) {
      setAssessment(res.data);
      showFeedback('success', 'Official ACD Bulletin imported & discrepancy reconciliation generated!');
      onRefresh();
    }
  };

  const handleRollover = async () => {
    if (!confirm(`Roll forward profile and dependants into the ${workspace.taxYear + 1} tax year?`)) return;
    setRollingOver(true);

    const res = await apiClient.rolloverToNextYear(workspace.id);
    setRollingOver(false);

    if (res.error) {
      showFeedback('error', res.error);
    } else if (res.data) {
      showFeedback(
        'success',
        `✓ Successfully rolled over into tax year ${res.data.nextTaxYear}! Switch years using the tax year selector.`
      );
      onRefresh();
    }
  };

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

      {/* Annual Rollover Card */}
      <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-800">
              Tax Year Transition
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-1">
              Roll Over to Next Tax Year ({workspace.taxYear + 1})
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Copy reusable household data, dependants, and employer details into the {workspace.taxYear + 1} workspace. All data requires reconfirmation.
            </p>
          </div>

          <button
            onClick={handleRollover}
            disabled={rollingOver}
            className="rounded-lg bg-sky-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-sky-500 disabled:opacity-50 transition-colors"
          >
            {rollingOver ? 'Rolling Over...' : `📅 Start ${workspace.taxYear + 1} Workspace`}
          </button>
        </div>
      </div>

      {/* Import Assessment Form */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-1">
          Import ACD Tax Assessment Notice (Bulletin d&apos;imposition)
        </h3>
        <p className="text-xs text-slate-500 mb-6">
          Compare the official tax assessment received from the Administration des contributions directes against your filed declaration.
        </p>

        <form onSubmit={handleImport} className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              Bulletin Notice Date
            </label>
            <input
              type="date"
              required
              value={bulletinDate}
              onChange={(e) => setBulletinDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              Assessed Taxable Income (€)
            </label>
            <input
              type="number"
              step="0.01"
              required
              placeholder="e.g. 58200"
              value={assessedIncome}
              onChange={(e) => setAssessedIncome(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              Official Tax Due (€)
            </label>
            <input
              type="number"
              step="0.01"
              required
              placeholder="e.g. 8450"
              value={assessedTax}
              onChange={(e) => setAssessedTax(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium"
            />
          </div>

          <div className="sm:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50 transition"
            >
              {submitting ? 'Comparing with Return...' : '🔍 Import & Compare Assessment'}
            </button>
          </div>
        </form>
      </div>

      {/* Discrepancy Breakdown Section */}
      {assessment && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Bulletin Notice Date: {new Date(assessment.bulletinDate).toLocaleDateString()}
              </span>
              <h4 className="text-lg font-bold text-slate-900 mt-0.5">
                Assessment Variance: €{Math.abs(assessment.differenceWithDeclared).toFixed(2)}{' '}
                {assessment.differenceWithDeclared > 0
                  ? '(ACD Tax Due Higher)'
                  : assessment.differenceWithDeclared < 0
                  ? '(ACD Refund Higher)'
                  : '(Exact Match)'}
              </h4>
            </div>

            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                assessment.differenceWithDeclared === 0
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {assessment.differenceWithDeclared === 0 ? '✓ In Full Agreement' : '⚠ Discrepancies Detected'}
            </span>
          </div>

          {assessment.discrepancies.length > 0 && (
            <div className="space-y-3">
              <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Discrepancy Line-Items
              </h5>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {assessment.discrepancies.map((d, i) => (
                  <div key={i} className="flex items-center justify-between p-3.5 text-xs">
                    <div>
                      <p className="font-bold text-slate-900">{d.field}</p>
                      <span className="text-slate-500">{d.notes}</span>
                    </div>
                    <div className="text-right space-y-0.5">
                      <div>
                        <span className="text-slate-400">Declared:</span> €{d.declaredValue.toFixed(2)} |{' '}
                        <span className="text-slate-400">ACD:</span> €{d.assessedValue.toFixed(2)}
                      </div>
                      <span
                        className={`font-bold ${
                          d.difference > 0 ? 'text-rose-600' : 'text-emerald-600'
                        }`}
                      >
                        Variance: {d.difference > 0 ? '+' : ''}€{d.difference.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
