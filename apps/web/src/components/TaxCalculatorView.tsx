'use client';

import React, { useState, useEffect } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Calculator,
  ChevronDown,
  Loader2,
  Scale,
  Sparkles,
} from 'lucide-react';
import { HelpTip } from './HelpTip';
import { apiClient } from '../lib/api';
import { formatEuro } from '../lib/money';
import { TaxCalculationResultDto, ScenarioComparisonDto } from '@luxtax/contracts';
import { ToastBanner, type ToastMessage } from './ui/ToastBanner';
import { CardGridSkeleton, Skeleton } from './ui/Skeleton';
import { StatusBadge } from './ui/StatusBadge';

interface TaxCalculatorViewProps {
  workspaceId: string;
  /** Tax year of the active workspace. 2025 stays fully supported (filing until 31 Dec 2026). */
  taxYear?: number;
  onCalculated?: () => void;
  onNavigateToFiling?: () => void;
}

export function TaxCalculatorView({
  workspaceId,
  taxYear = 2025,
  onCalculated,
  onNavigateToFiling,
}: TaxCalculatorViewProps) {
  const [calc, setCalc] = useState<TaxCalculationResultDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [showProvenance, setShowProvenance] = useState(false);
  const [feedback, setFeedback] = useState<ToastMessage | null>(null);
  const [comparison, setComparison] = useState<ScenarioComparisonDto | null>(null);
  const [comparing, setComparing] = useState(false);
  const [loadError, setLoadError] = useState('');

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback((curr) => (curr?.message === message ? null : curr)), 4500);
  };

  const loadCalculation = async () => {
    setLoading(true);
    const res = await apiClient.getCalculation(workspaceId);
    // A stored result belongs to the workspace that was asked for: a failed or
    // empty read clears it, so the previous year's figures are never shown as
    // if they were the current ones.
    if (res.error) {
      setCalc(null);
      setLoadError(res.error);
    } else {
      setCalc(res.data ?? null);
      setLoadError('');
    }
    setLoading(false);
  };

  useEffect(() => {
    setComparison(null);
    loadCalculation();
  }, [workspaceId]);

  const handleRunCalculation = async () => {
    setCalculating(true);
    const res = await apiClient.calculateTax(workspaceId);
    setCalculating(false);

    if (res.error) {
      showFeedback('error', res.error);
    } else if (res.data) {
      setCalc(res.data);
      showFeedback('success', `${res.data.taxYear} tax calculation completed successfully!`);
      onCalculated?.();
    }
  };

  // Reads the saved facts and questionnaire three times; never persists a run
  // and never changes the active assessment election.
  const handleCompareScenarios = async () => {
    setComparing(true);
    const res = await apiClient.compareScenarios(workspaceId);
    setComparing(false);

    if (res.error) {
      setComparison(null);
      showFeedback('error', res.error);
    } else if (res.data) {
      setComparison(res.data);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-3">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-3.5 w-80" />
        </div>
        <CardGridSkeleton count={3} />
      </div>
    );
  }

  // A result stored before the deduction/credit breakdown existed cannot be
  // rendered, and must not be shown as if it were current: every line below
  // dereferences `credits` and `deductions`. Ask for a recalculation instead.
  const staleStoredResult =
    calc !== null && (!calc.credits || !calc.deductions || !calc.assessmentMode);

  if (staleStoredResult) {
    return (
      <div className="py-4">
        <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            <div>
              <h3 className="text-sm font-bold text-amber-950">
                This stored estimate predates the current model
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-amber-900">
                It carries no deduction or credit breakdown, so its lines cannot be shown safely. Recalculate to rebuild
                it from the saved facts and questionnaire. Nothing is filed until you approve the new result.
              </p>
              <button
                type="button"
                onClick={handleRunCalculation}
                disabled={calculating}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-zinc-800 disabled:opacity-50"
              >
                {calculating && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                <span>{calculating ? 'Recalculating…' : 'Recalculate now'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isRefund = calc ? calc.balancePayableOrRefund < 0 : false;
  const balanceAbs = calc ? Math.abs(calc.balancePayableOrRefund) : 0;
  const eur = (value: number) => formatEuro(value);
  const signedEur = (value: number) => `${value >= 0 ? '+' : '−'}${formatEuro(Math.abs(value))}`;

  const appliedCredits = calc
    ? Math.min(
        calc.totalTaxCredits - (calc.credits.cimRefund ?? 0),
        Math.max(0, calc.totalTaxBeforeCredits),
      )
    : 0;

  const lowestScenarioLiability =
    comparison && comparison.comparable
      ? Math.min(
          comparison.collective.finalTaxLiability,
          comparison.individualPure.finalTaxLiability,
          comparison.individualReallocation.finalTaxLiability,
        )
      : null;

  const rowTone = (amount: number) =>
    Math.abs(amount) > 0.004 ? 'font-semibold text-slate-900' : 'font-normal text-slate-400';

  return (
    <div className="space-y-6">
      <ToastBanner feedback={feedback} onDismiss={() => setFeedback(null)} />

      {/* Unsupported-scenario banner */}
      {calc && Array.isArray(calc.unsupported) && calc.unsupported.length > 0 && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-xs text-rose-900 shadow-xs"
        >
          <div className="flex items-start gap-2.5">
            <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
            <div>
              <p className="font-bold mb-1">This scenario is not fully supported</p>
              <ul className="list-disc space-y-1 pl-4">
                {calc.unsupported.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
              <p className="mt-2 font-medium text-rose-800">
                The figures below use resident rules only. Do not file from this estimate.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Top Action Bar */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-zinc-200/85 bg-white p-5 shadow-[0_1px_2px_rgba(9,9,11,0.03)] sm:flex-row sm:items-center">
        <div>
          <h3 className="text-base font-bold text-zinc-950">
            Deterministic Tax Engine (Tax Year {calc?.taxYear ?? taxYear})
          </h3>
          <p className="mt-0.5 text-xs text-zinc-600">
            Calculated with the versioned rule package{' '}
            <span className="font-mono font-semibold text-zinc-900">
              {calc?.rulePackageVersion ?? 'LIR'}
            </span>{' '}
            — Art. 118–121, 120bis, 124, 126 LIR.
          </p>
          <p className="mt-1 text-[11px] text-zinc-400">
            Supported tax years: 2025 (returns due 31 December 2026) · 2026 · 2028 preview
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleRunCalculation}
            disabled={calculating}
            className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
          >
            {calculating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{calculating ? 'Running Tax Formulas...' : `Calculate ${calc?.taxYear ?? taxYear} Tax`}</span>
          </button>
          {calc && onNavigateToFiling && (
            <button
              type="button"
              onClick={onNavigateToFiling}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/90 bg-white px-4 py-2.5 text-xs font-bold text-zinc-900 shadow-2xs transition hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.98]"
            >
              <span>Proceed to Approvals &amp; Filing</span>
              <ArrowRight className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {loadError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800"
        >
          The stored calculation could not be loaded: {loadError}
        </div>
      )}

      {calc ? (
        <>
          {/* Hero Result Banner (Unified Light Editorial Surface) */}
          <div
            className={`rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(9,9,11,0.04)] sm:p-6 ${
              isRefund ? 'border-l-4 border-l-emerald-600' : 'border-l-4 border-l-zinc-950'
            }`}
          >
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={isRefund ? 'success' : 'warning'}>
                    {isRefund ? 'Estimated Tax Refund' : 'Estimated Tax Due to ACD'}
                  </StatusBadge>
                  {calc.calculatedAt && (
                    <span className="tabular-nums text-[11px] text-zinc-500">
                      Updated {new Date(calc.calculatedAt).toLocaleString()}
                    </span>
                  )}
                </div>
                <div
                  className={`tabular-nums mt-2.5 text-4xl font-extrabold tracking-tight ${
                    isRefund ? 'text-emerald-700' : 'text-zinc-950'
                  }`}
                >
                  {formatEuro(balanceAbs)}
                </div>
                <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-zinc-600 text-pretty">
                  {isRefund
                    ? calc.taxWithheldAtSource > 0 && (calc.credits.cimRefund ?? 0) > 0
                      ? 'Excess tax withheld and the refundable CIM will be paid out by the Administration des contributions directes.'
                      : calc.taxWithheldAtSource > 0
                        ? 'Excess tax deducted at source will be reimbursed by the Administration des contributions directes.'
                        : 'A refundable credit (CIM) exceeds your tax; the Administration des contributions directes pays the excess out.'
                    : 'Balance due upon official notice of tax assessment.'}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 rounded-xl border border-zinc-200/80 bg-zinc-50/80 p-4 text-xs sm:min-w-[240px]">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-zinc-500">Tax Class</span>
                  <strong className="font-bold text-zinc-950">{calc.taxClass}</strong>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-zinc-500">Taxable Income</span>
                  <strong className="tabular-nums font-bold text-zinc-950">
                    {formatEuro(calc.taxableIncome)}
                  </strong>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="inline-flex items-center gap-1 text-zinc-500">
                    <span>Solidarity Surcharge</span>
                    <HelpTip id="solidarity" />
                  </span>
                  <strong className="tabular-nums font-bold text-zinc-950">
                    {(calc.solidaritySurchargeRate * 100).toFixed(0)}% (
                    {formatEuro(calc.solidaritySurchargeAmount)})
                  </strong>
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-zinc-200/80 pt-2">
                  <span className="text-zinc-500">Final Liability</span>
                  <strong className="tabular-nums font-bold text-sky-700">
                    {formatEuro(calc.finalTaxLiability)}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Key Metric Breakdown Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Gross Salary Income <HelpTip id="employmentIncome" />
              </span>
              <div className="tabular-nums mt-1.5 text-xl font-extrabold text-slate-900">
                {formatEuro(calc.grossIncome)}
              </div>
              <span className="text-[11px] text-slate-500">Total household gross income</span>
            </div>

            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Total Deductions <HelpTip id="deductionsTotal" />
              </span>
              <div className="tabular-nums mt-1.5 text-xl font-extrabold text-emerald-700">
                −{formatEuro(calc.totalDeductions)}
              </div>
              <span className="text-[11px] text-slate-500">Expenses &amp; special deductions</span>
            </div>

            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Tax Credits (CIS/CIM) <HelpTip id="credits" />
              </span>
              <div className="tabular-nums mt-1.5 text-xl font-extrabold text-sky-700">
                −{formatEuro(appliedCredits)}
              </div>
              <span className="text-[11px] text-slate-500">
                Credited against base tax; excess CIM refunded separately
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Withheld at Source <HelpTip id="withheldAtSource" />
              </span>
              <div className="tabular-nums mt-1.5 text-xl font-extrabold text-amber-700">
                {formatEuro(calc.taxWithheldAtSource)}
              </div>
              <span className="text-[11px] text-slate-500">Code 105 on salary slips</span>
            </div>
          </div>

          {/* Calculation Waterfall Strip */}
          <div className="rounded-2xl border border-slate-200/90 bg-white px-5 py-4 shadow-xs">
            <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-5">
              <div>
                <span className="block text-[11px] font-medium text-slate-500">Gross Income</span>
                <span className="tabular-nums mt-0.5 block font-bold text-slate-900">
                  {formatEuro(calc.grossIncome)}
                </span>
              </div>
              <div>
                <span className="block text-[11px] font-medium text-slate-500">− Deductions</span>
                <span className="tabular-nums mt-0.5 block font-bold text-emerald-700">
                  −{formatEuro(calc.totalDeductions)}
                </span>
              </div>
              <div>
                <span className="block text-[11px] font-medium text-slate-500">= Taxable Base</span>
                <span className="tabular-nums mt-0.5 block font-bold text-slate-900">
                  {formatEuro(calc.taxableIncome)}
                </span>
              </div>
              <div>
                <span className="block text-[11px] font-medium text-slate-500">Base + Solidarity</span>
                <span className="tabular-nums mt-0.5 block font-bold text-slate-900">
                  {formatEuro(calc.totalTaxBeforeCredits)}
                </span>
              </div>
              <div>
                <span className="block text-[11px] font-medium text-slate-500">Final Liability</span>
                <span className="tabular-nums mt-0.5 block font-bold text-sky-700">
                  {formatEuro(calc.finalTaxLiability)}
                </span>
              </div>
            </div>
          </div>

          {/* Freelance & Business Income Breakdown (if any) */}
          {calc.freelanceIncomeBreakdown &&
            (calc.freelanceIncomeBreakdown.primaryGrossRevenue > 0 ||
              calc.freelanceIncomeBreakdown.spouseGrossRevenue > 0 ||
              calc.freelanceIncomeBreakdown.totalFreelanceNetProfit !== 0) && (
              <div className="rounded-2xl border border-zinc-200/85 bg-white p-5 shadow-[0_1px_2px_rgba(9,9,11,0.03)]">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <StatusBadge tone="neutral">Articles 14 &amp; 91 L.I.R.</StatusBadge>
                    <h4 className="mt-1.5 text-sm font-bold text-zinc-950">
                      Freelance &amp; Business Net Profit Breakdown
                    </h4>
                  </div>
                  <div className="text-right">
                    <span className="block text-xs font-semibold text-zinc-500">Total Net Profit</span>
                    <span className="tabular-nums text-lg font-extrabold text-zinc-950">
                      {formatEuro(calc.freelanceIncomeBreakdown.totalFreelanceNetProfit)}
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-4 shadow-2xs">
                    <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-900">
                      <span>Primary Filer (Case 21/23)</span>
                      <span className="tabular-nums font-extrabold text-emerald-700">
                        {formatEuro(calc.freelanceIncomeBreakdown.primaryNetProfit)}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs text-slate-500">
                      <div className="flex justify-between">
                        <span>Gross Invoiced</span>
                        <span className="tabular-nums font-semibold text-slate-700">
                          {formatEuro(calc.freelanceIncomeBreakdown.primaryGrossRevenue)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Operating Expenses</span>
                        <span className="tabular-nums font-semibold text-rose-600">
                          −{formatEuro(calc.freelanceIncomeBreakdown.primaryBusinessExpenses)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-indigo-100 bg-white p-4 shadow-2xs">
                    <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-900">
                      <span>Co-Filer Spouse (Case 22/24)</span>
                      <span className="tabular-nums font-extrabold text-emerald-700">
                        {formatEuro(calc.freelanceIncomeBreakdown.spouseNetProfit)}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs text-slate-500">
                      <div className="flex justify-between">
                        <span>Gross Invoiced</span>
                        <span className="tabular-nums font-semibold text-slate-700">
                          {formatEuro(calc.freelanceIncomeBreakdown.spouseGrossRevenue)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Operating Expenses</span>
                        <span className="tabular-nums font-semibold text-rose-600">
                          −{formatEuro(calc.freelanceIncomeBreakdown.spouseBusinessExpenses)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

          {/* Legal breakdown — organized into Deductions and Credits */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
            <div className="mb-5 flex flex-col justify-between gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Deduction and credit breakdown</h4>
                <p className="mt-0.5 text-xs text-slate-500">
                  Active non-zero amounts are highlighted; statutory €0.00 items remain visible for full audit transparency.
                </p>
              </div>
              <StatusBadge tone="neutral">
                {calc.assessmentMode.replace('_', ' ')}
                {calc.class2WithoutSpouse ? ' · Class 2 without spouse (Art. 119 n° 3)' : ''} ·{' '}
                {calc.rulePackageVersion}
              </StatusBadge>
            </div>

            <div className="grid gap-8 lg:grid-cols-2">
              {/* Column 1: Income & Deductions */}
              <div>
                <h5 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Taxable Base &amp; Statutory Deductions
                </h5>
                <div className="divide-y divide-slate-100 text-xs">
                  <div className="flex justify-between py-2">
                    <span className="text-slate-600">Net income (all categories)</span>
                    <span className={`tabular-nums ${rowTone(calc.netIncome)}`}>{formatEuro(calc.netIncome)}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-600">
                      Frais d&apos;obtention (Art. 105/107) <HelpTip id="fraisObtention" />
                    </span>
                    <span className={`tabular-nums ${rowTone(calc.deductions.fraisObtention)}`}>
                      −{formatEuro(calc.deductions.fraisObtention)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-600">Déplacement (Art. 105bis)</span>
                    <span className={`tabular-nums ${rowTone(calc.deductions.travel)}`}>
                      −{formatEuro(calc.deductions.travel)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-600">Owner-occupier interest (Art. 98 n°5 / 105)</span>
                    <span className={`tabular-nums ${rowTone(calc.deductions.mortgageInterest)}`}>
                      −{formatEuro(calc.deductions.mortgageInterest)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-600">Art. 111 insurance envelope (€672)</span>
                    <span className={`tabular-nums ${rowTone(calc.deductions.art111)}`}>
                      −{formatEuro(calc.deductions.art111)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-600">ASRD single premium (Art. 111 al. 3/4)</span>
                    <span className={`tabular-nums ${rowTone(calc.deductions.asrd)}`}>
                      −{formatEuro(calc.deductions.asrd)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-600">Art. 111bis third pillar</span>
                    <span className={`tabular-nums ${rowTone(calc.deductions.art111bis)}`}>
                      −{formatEuro(calc.deductions.art111bis)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-600">Épargne-logement</span>
                    <span className={`tabular-nums ${rowTone(calc.deductions.savingsHousing)}`}>
                      −{formatEuro(calc.deductions.savingsHousing)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-600">LRCP (Art. 110 n°3)</span>
                    <span className={`tabular-nums ${rowTone(calc.deductions.lrcp)}`}>
                      −{formatEuro(calc.deductions.lrcp)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-600">
                      Dépenses spéciales (forfait {calc.deductions.specialExpensesForfait}€)
                    </span>
                    <span className={`tabular-nums ${rowTone(calc.deductions.specialExpensesTotal)}`}>
                      −{formatEuro(calc.deductions.specialExpensesTotal)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-600">Charges extraordinaires (Art. 127)</span>
                    <span className={`tabular-nums ${rowTone(calc.deductions.extraordinaryCharges)}`}>
                      −{formatEuro(calc.deductions.extraordinaryCharges)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-600">AEP (Art. 129b)</span>
                    <span className={`tabular-nums ${rowTone(calc.deductions.aep)}`}>
                      −{formatEuro(calc.deductions.aep)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-600">Prior losses (Art. 114)</span>
                    <span className={`tabular-nums ${rowTone(calc.deductions.priorLosses)}`}>
                      −{formatEuro(calc.deductions.priorLosses)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Column 2: Credits, Special Income & Rates */}
              <div>
                <h5 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Tax Credits, Exemptions &amp; Rates
                </h5>
                <div className="divide-y divide-slate-100 text-xs">
                  <div className="flex justify-between py-2">
                    <span className="text-slate-600">CIS</span>
                    <span className={`tabular-nums ${rowTone(calc.credits.cis)}`}>
                      −{formatEuro(calc.credits.cis)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-600">CI-CO2 salarié</span>
                    <span className={`tabular-nums ${rowTone(calc.credits.ciCo2Salary)}`}>
                      −{formatEuro(calc.credits.ciCo2Salary)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-600">CII (independent)</span>
                    <span className={`tabular-nums ${rowTone(calc.credits.cii)}`}>
                      −{formatEuro(calc.credits.cii)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-600">CIC (crédit d&apos;impôt conjoncture)</span>
                    <span className={`tabular-nums ${rowTone(calc.credits.cic)}`}>
                      −{formatEuro(calc.credits.cic)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-600">Prime jeune salarié (exempt, Art. 115 n°13d)</span>
                    <span className={`tabular-nums ${rowTone(calc.youngEmployeePrimeExemption ?? 0)}`}>
                      {formatEuro(calc.youngEmployeePrimeExemption ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-600">CISSM (salaire social minimum)</span>
                    <span className={`tabular-nums ${rowTone(calc.credits.cissm)}`}>
                      −{formatEuro(calc.credits.cissm)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-600">
                      Foreign tax credit <HelpTip id="foreignIncome" />
                    </span>
                    <span className={`tabular-nums ${rowTone(calc.credits.foreignTaxCredit)}`}>
                      −{formatEuro(calc.credits.foreignTaxCredit)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-600">
                      CIM applied (single parent) <HelpTip id="cim" />
                    </span>
                    <span className={`tabular-nums ${rowTone(calc.credits.cimApplied ?? 0)}`}>
                      −{formatEuro(calc.credits.cimApplied ?? 0)}
                    </span>
                  </div>
                  {calc.credits.cimRefund > 0 && (
                    <div className="flex justify-between py-2">
                      <span className="text-slate-600">
                        CIM refunded (Art. 154ter)
                        <span className="mt-0.5 block text-[11px] text-slate-400">
                          Refundable excess paid out — increases your refund
                        </span>
                      </span>
                      <span className="tabular-nums font-bold text-emerald-700">
                        +{formatEuro(calc.credits.cimRefund)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between py-2">
                    <span className="text-slate-600">Start-up credit (2026)</span>
                    <span className={`tabular-nums ${rowTone(calc.credits.startup)}`}>
                      −{formatEuro(calc.credits.startup)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-600">Rental net (Art. 98)</span>
                    <span className={`tabular-nums ${rowTone(calc.rental?.net ?? 0)}`}>
                      {formatEuro(calc.rental?.net ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-600">Plus-values taxed at the demi-taux</span>
                    <span className={`tabular-nums ${rowTone(calc.plusValues?.taxableExtraordinary ?? 0)}`}>
                      {formatEuro(calc.plusValues?.taxableExtraordinary ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between bg-slate-50 px-2.5 py-2.5 font-bold text-slate-900 rounded-lg mt-1">
                    <span>
                      Taxable income <HelpTip id="taxableIncome" />
                    </span>
                    <span className="tabular-nums">{formatEuro(calc.taxableIncome)}</span>
                  </div>
                  <div className="flex justify-between px-2.5 py-2 font-bold text-slate-900">
                    <span>
                      Marginal / effective rate <HelpTip id="marginalRate" />
                    </span>
                    <span className="tabular-nums">
                      {(calc.marginalRate * 100).toFixed(0)}% / {calc.effectiveTaxRate.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {calc.childRelief && calc.childRelief.total > 0 && (
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs">
                <div className="mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Child relief
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-200/60 py-1.5">
                  <span className="text-slate-600">Dégrèvement (Art. 122)</span>
                  <span className="tabular-nums font-semibold">−{formatEuro(calc.childRelief.degrevement)}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200/60 py-1.5">
                  <span className="text-slate-600">Bonification (Art. 123bis)</span>
                  <span className="tabular-nums font-semibold">−{formatEuro(calc.childRelief.bonification)}</span>
                </div>
                <div className="flex justify-between pt-2 font-bold text-slate-900">
                  <span>
                    Total child relief <HelpTip id="childrenModeration" />
                  </span>
                  <span className="tabular-nums">−{formatEuro(calc.childRelief.total)}</span>
                </div>
                {calc.childRelief.bonificationPhaseOut && (
                  <p className="mt-1.5 text-[11px] font-medium text-amber-800">
                    Bonification phased out at your RIA
                  </p>
                )}
              </div>
            )}

            {calc.warnings.length > 0 && (
              <ul className="mt-5 space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                {calc.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden="true" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Provenance Trace Accordion */}
          <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
            <button
              type="button"
              onClick={() => setShowProvenance(!showProvenance)}
              aria-expanded={showProvenance}
              className="flex w-full items-center justify-between px-6 py-4 text-left text-sm font-bold text-slate-900 transition hover:bg-slate-50"
            >
              <div className="flex items-center gap-2.5">
                <span className="h-2 w-2 rounded-full bg-sky-600" aria-hidden="true" />
                <span>Explainable Line-Item Provenance ({calc.provenance.length} Rules Applied)</span>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700">
                <span>{showProvenance ? 'Hide Details' : 'View Full Trace'}</span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-150 ${showProvenance ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </span>
            </button>

            {showProvenance && (
              <div className="space-y-3 border-t border-slate-100 bg-slate-50/70 p-6">
                {calc.provenance.map((item, idx) => (
                  <div
                    key={idx}
                    className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-2xs"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="rounded-md bg-sky-50 px-2.5 py-0.5 font-mono font-bold text-sky-800 border border-sky-200/70">
                        {item.ruleCode}
                      </span>
                      <strong className="tabular-nums text-sm font-bold text-slate-900">
                        {formatEuro(item.outputAmount)}
                      </strong>
                    </div>
                    <p className="font-medium text-slate-700">{item.description}</p>
                    <div className="rounded-lg bg-slate-100/80 px-3 py-2 font-mono text-[11px] text-slate-600">
                      Formula: {item.formula}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
          <div className="mx-auto mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200/80 bg-zinc-50 text-zinc-800">
            <Calculator className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="text-sm font-bold text-zinc-950">No Calculation Generated Yet</p>
          <p className="mx-auto mt-1.5 mb-5 max-w-sm text-xs leading-relaxed text-zinc-500">
            Run the deterministic Luxembourg tax engine to calculate your estimated income tax under the latest ACD progressive scale.
          </p>
          <button
            type="button"
            onClick={handleRunCalculation}
            disabled={calculating}
            className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
          >
            {calculating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{calculating ? 'Running Calculations...' : 'Run First Tax Calculation'}</span>
          </button>
        </div>
      )}

      {/* Class 2 vs 2× Class 1 / Art. 3ter comparison — never persisted */}
      <div className="rounded-2xl border border-zinc-200/85 bg-white p-6 shadow-[0_1px_2px_rgba(9,9,11,0.03)]">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h4 className="flex items-center gap-1.5 text-sm font-bold text-zinc-950">
              <Scale className="h-4 w-4 text-zinc-500" aria-hidden="true" />
              <span>Scenario comparison</span>
              <HelpTip id="scenarioComparison" />
            </h4>
            <p className="mt-1 text-xs text-zinc-500">
              Compare collective Class 2, 2× Class 1 and the Art. 3ter reallocation on the same facts.
              The comparison is not saved and does not change the active election.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCompareScenarios}
            disabled={comparing}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-zinc-950 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
          >
            {comparing && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            <span>{comparing ? 'Comparing scenarios...' : 'Compare Class 2 vs 2× Class 1'}</span>
          </button>
        </div>

        {comparison &&
          (comparison.comparable ? (
            <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="py-2 pr-2 font-semibold">Scenario</th>
                    <th className="py-2 font-semibold text-right">Final tax liability</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    {
                      label: 'Collective Class 2 (Art. 3)',
                      value: comparison.collective.finalTaxLiability,
                    },
                    {
                      label: '2× Class 1 (Art. 3ter pure)',
                      value: comparison.individualPure.finalTaxLiability,
                    },
                    {
                      label: 'Art. 3ter reallocation',
                      value: comparison.individualReallocation.finalTaxLiability,
                    },
                  ].map((row) => {
                    const isLowest =
                      lowestScenarioLiability !== null &&
                      Math.abs(row.value - lowestScenarioLiability) < 0.01;
                    return (
                      <tr key={row.label}>
                        <td className="py-2.5 pr-2 font-medium text-slate-800">
                          <span>{row.label}</span>
                          {isLowest && (
                            <StatusBadge tone="success" className="ml-2">
                              Lowest tax
                            </StatusBadge>
                          )}
                        </td>
                        <td className="tabular-nums py-2.5 text-right font-bold text-slate-900">
                          {eur(row.value)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="grid gap-3 text-xs sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="text-slate-500">Collective − 2× Class 1</span>
                  <div className="tabular-nums mt-0.5 text-sm font-bold text-slate-900">
                    {signedEur(comparison.deltaCollectiveVsIndividual)}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="text-slate-500">Collective − Art. 3ter reallocation</span>
                  <div className="tabular-nums mt-0.5 text-sm font-bold text-slate-900">
                    {signedEur(comparison.deltaCollectiveVsReallocation)}
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-500">
                A positive delta means the collective assessment costs more. Rule package{' '}
                {comparison.rulePackageVersion} · tax year {comparison.taxYear}.
              </p>

              {comparison.warnings.length > 0 && (
                <ul className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
                  {comparison.warnings.map((warning, index) => (
                    <li key={index}>• {warning}</li>
                  ))}
                </ul>
              )}

              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
                This is an estimate, not a filing election; Art. 3ter must be elected within the deadline.
              </p>
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600">
              Only a Class 2 couple can compare these scenarios.
            </p>
          ))}
      </div>
    </div>
  );
}
