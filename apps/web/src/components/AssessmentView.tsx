'use client';

import React, { useState } from 'react';
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
  const [rolloverSuccess, setRolloverSuccess] = useState<number | null>(null);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const res = await apiClient.importAssessment(workspace.id, {
      taxYear: workspace.taxYear,
      bulletinDate,
      assessedTaxableIncome: assessedIncome,
      assessedTaxDue: assessedTax,
    });

    if (res.data) {
      setAssessment(res.data);
      onRefresh();
    }
    setSubmitting(false);
  };

  const handleRollover = async () => {
    if (!confirm('Roll forward profile and dependants into the 2026 tax year?')) return;
    setRollingOver(true);

    const res = await apiClient.rolloverToNextYear(workspace.id);
    if (res.data) {
      setRolloverSuccess(res.data.nextTaxYear);
      onRefresh();
    }
    setRollingOver(false);
  };

  return (
    <div className="space-y-6">
      {/* Annual Rollover Card */}
      <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-800">
              Tax Year Transition
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-1">
              Roll Over to Next Tax Year (2026)
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Copy reusable household data, dependants, and employer details into the 2026 workspace. All data requires reconfirmation.
            </p>
          </div>

          <button
            onClick={handleRollover}
            disabled={rollingOver}
            className="rounded-lg bg-sky-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-sky-500 disabled:opacity-50 transition-colors"
          >
            {rollingOver ? 'Rolling Over...' : '📅 Start 2026 Workspace'}
          </button>
        </div>

        {rolloverSuccess && (
          <p className="mt-3 text-xs font-bold text-emerald-700 bg-emerald-100 p-2.5 rounded-lg">
            ✓ Successfully created {rolloverSuccess} Tax Year Workspace! You can switch years in the top menu.
          </p>
        )}
      </div>

      {/* Import Assessment Form */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-1">
          Import ACD Tax Assessment Notice (Bulletin d'imposition)
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
              value={bulletinDate}
              onChange={(e) => setBulletinDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2.5 text-xs"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              Assessed Taxable Income (EUR)
            </label>
            <input
              type="text"
              placeholder="e.g. 65000.00"
              value={assessedIncome}
              onChange={(e) => setAssessedIncome(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2.5 text-xs font-semibold"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              Assessed Tax Due (EUR)
            </label>
            <input
              type="text"
              placeholder="e.g. 11500.00"
              value={assessedTax}
              onChange={(e) => setAssessedTax(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2.5 text-xs font-semibold"
              required
            />
          </div>

          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {submitting ? 'Comparing Discrepancies...' : 'Compare Assessment with Return'}
            </button>
          </div>
        </form>

        {/* Assessment Discrepancy Breakdown */}
        {assessment && (
          <div className="mt-6 border-t border-slate-100 pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900">
                Assessment Reconciliation Results
              </h4>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  assessment.differenceWithDeclared === 0
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {assessment.differenceWithDeclared === 0
                  ? 'Exact Match (No Discrepancy)'
                  : `Variance: €${assessment.differenceWithDeclared.toFixed(2)}`}
              </span>
            </div>

            {assessment.discrepancies.length > 0 ? (
              <div className="space-y-2">
                {assessment.discrepancies.map((disc, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs gap-2"
                  >
                    <div>
                      <span className="font-bold text-slate-900">{disc.field}</span>
                      <p className="text-slate-600 mt-0.5">{disc.notes}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-slate-500">
                        Declared: €{disc.declaredValue.toFixed(2)} | Assessed: €{disc.assessedValue.toFixed(2)}
                      </div>
                      <div className="font-bold text-rose-600">
                        Diff: €{disc.difference.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                The assessed tax liability matches the declared figures calculated by LuxTax.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
