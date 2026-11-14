'use client';

import React, { useState, useEffect } from 'react';
import { HelpTip } from './HelpTip';
import { apiClient } from '../lib/api';
import { formatEuro } from '../lib/money';
import { TaxCalculationResultDto, ScenarioComparisonDto } from '@luxtax/contracts';

interface TaxCalculatorViewProps {
  workspaceId: string;
  /** Tax year of the active workspace. 2025 stays fully supported (filing until 31 Dec 2026). */
  taxYear?: number;
  onCalculated?: () => void;
  onNavigateToFiling?: () => void;
}

export function TaxCalculatorView({ workspaceId, taxYear = 2025, onCalculated, onNavigateToFiling }: TaxCalculatorViewProps) {
  const [calc, setCalc] = useState<TaxCalculationResultDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [showProvenance, setShowProvenance] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [comparison, setComparison] = useState<ScenarioComparisonDto | null>(null);
  const [comparing, setComparing] = useState(false);
  const [loadError, setLoadError] = useState('');

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
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
    return <div className="p-8 text-center text-sm text-slate-500">Loading tax estimate...</div>;
  }

  // A result stored before the deduction/credit breakdown existed cannot be
  // rendered, and must not be shown as if it were current: every line below
  // dereferences `credits` and `deductions`. Ask for a recalculation instead.
  const staleStoredResult =
    calc !== null && (!calc.credits || !calc.deductions || !calc.assessmentMode);

  if (staleStoredResult) {
    return (
      <div className="p-8">
        <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h3 className="text-sm font-bold text-amber-900">
            This stored estimate predates the current model
          </h3>
          <p className="mt-2 text-xs text-amber-800">
            It carries no deduction or credit breakdown, so its lines cannot be shown safely. Recalculate to rebuild
            it from the saved facts and questionnaire. Nothing is filed until you approve the new result.
          </p>
          <button
            onClick={handleRunCalculation}
            disabled={calculating}
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {calculating ? 'Recalculating…' : 'Recalculate now'}
          </button>
        </div>
      </div>
    );
  }

  const isRefund = calc ? calc.balancePayableOrRefund < 0 : false;
  const balanceAbs = calc ? Math.abs(calc.balancePayableOrRefund) : 0;
  const eur = (value: number) => formatEuro(value);
  const signedEur = (value: number) => `${value >= 0 ? '+' : '−'}${formatEuro(Math.abs(value))}`;

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

      {/* Unsupported-scenario banner */}
      {/* `unsupported` can be absent on a stored result that predates the field: the API
          casts saved JSON straight to the DTO, so guard the array instead of trusting it. */}
      {calc && Array.isArray(calc.unsupported) && calc.unsupported.length > 0 && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-xs text-rose-900">
          <p className="font-bold mb-1">This scenario is not fully supported</p>
          <ul className="list-disc pl-4 space-y-1">
            {calc.unsupported.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
          <p className="mt-2 opacity-80">
            The figures below use resident rules only. Do not file from this estimate.
          </p>
        </div>
      )}

      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            Deterministic Tax Engine (Tax Year {calc?.taxYear ?? taxYear})
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Calculated with the versioned rule package {calc?.rulePackageVersion ?? ''} — Art. 118–121, 120bis, 124, 126 LIR.
            <span className="block mt-1 text-[11px] text-slate-400">
              Supported tax years: 2025 (returns due 31 December 2026) · 2026 · 2028 preview
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRunCalculation}
            disabled={calculating}
            className="rounded-lg bg-sky-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-sky-500 disabled:opacity-50 transition-colors"
          >
            {calculating ? 'Running Tax Formulas...' : `⚡ Calculate ${calc?.taxYear ?? taxYear} Tax`}
          </button>
          {calc && onNavigateToFiling && (
            <button
              onClick={onNavigateToFiling}
              className="rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition-colors"
            >
              Proceed to Approvals & Filing &rarr;
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
          {/* Hero Result Banner */}
          <div
            className={`rounded-2xl border p-6 text-white shadow-md ${
              isRefund
                ? 'border-emerald-600 bg-gradient-to-r from-emerald-600 to-teal-700'
                : 'border-slate-800 bg-gradient-to-r from-slate-900 to-slate-800'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-200">
                  {isRefund ? 'Estimated Tax Refund' : 'Estimated Tax Due to ACD'}
                </span>
                <div className="mt-1 text-4xl font-black">{formatEuro(balanceAbs)}</div>
                <p className="mt-1 text-xs text-white/80">
                  {isRefund
                    ? calc.taxWithheldAtSource > 0 && (calc.credits.cimRefund ?? 0) > 0
                      ? 'Excess tax withheld and the refundable CIM will be paid out by the Administration des contributions directes.'
                      : calc.taxWithheldAtSource > 0
                        ? 'Excess tax deducted at source will be reimbursed by the Administration des contributions directes.'
                        : 'A refundable credit (CIM) exceeds your tax; the Administration des contributions directes pays the excess out.'
                    : 'Balance due upon official notice of tax assessment.'}
                </p>
              </div>

              <div className="rounded-xl bg-white/10 backdrop-blur-sm p-4 text-xs space-y-1 sm:text-right border border-white/10">
                <div>
                  <span className="text-white/70">Tax Class:</span>{' '}
                  <strong className="text-white font-bold">{calc.taxClass}</strong>
                </div>
                <div>
                  <span className="text-white/70">Taxable Income:</span>{' '}
                  <strong className="text-white font-bold">{formatEuro(calc.taxableIncome)}</strong>
                </div>
                <div>
                  <span className="text-white/70">Solidarity Surcharge:
                    {" "}<HelpTip id="solidarity" /></span>{' '}
                  <strong className="text-white font-bold">
                    {(calc.solidaritySurchargeRate * 100).toFixed(0)}% (
                    {formatEuro(calc.solidaritySurchargeAmount)})
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Breakdown Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Gross Salary Income
                    {" "}<HelpTip id="employmentIncome" />
              </span>
              <div className="mt-1 text-xl font-bold text-slate-900">
                {formatEuro(calc.grossIncome)}
              </div>
              <span className="text-[11px] text-slate-400">Total household salary</span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Deductions
                    {" "}<HelpTip id="deductionsTotal" />
              </span>
              <div className="mt-1 text-xl font-bold text-emerald-600">
                -{formatEuro(calc.totalDeductions)}
              </div>
              <span className="text-[11px] text-slate-400">Expenses & special deductions</span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Tax Credits (CIS/CIM)
                    {" "}<HelpTip id="credits" />
              </span>
              <div className="mt-1 text-xl font-bold text-sky-600">
                -
                {formatEuro(
                  Math.min(
                    calc.totalTaxCredits - (calc.credits.cimRefund ?? 0),
                    Math.max(0, calc.totalTaxBeforeCredits),
                  ),
                )}
              </div>
              <span className="text-[11px] text-slate-400">
                Credited against base tax, capped at the tax due; the refundable CIM excess is paid out separately
              </span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Withheld at Source
                    {" "}<HelpTip id="withheldAtSource" />
              </span>
              <div className="mt-1 text-xl font-bold text-amber-600">
                {formatEuro(calc.taxWithheldAtSource)}
              </div>
              <span className="text-[11px] text-slate-400">Code 105 on salary slips</span>
            </div>
          </div>

          {/* Freelance & Business Income Breakdown (if any) */}
          {calc.freelanceIncomeBreakdown &&
            (calc.freelanceIncomeBreakdown.primaryGrossRevenue > 0 ||
              calc.freelanceIncomeBreakdown.spouseGrossRevenue > 0 ||
              calc.freelanceIncomeBreakdown.totalFreelanceNetProfit !== 0) && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-5 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
                      Articles 14 & 91 L.I.R.
                    </span>
                    <h4 className="text-sm font-bold text-indigo-950 mt-1">
                      Freelance & Business Net Profit Breakdown
                    </h4>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-indigo-600 font-semibold block">Total Net Profit</span>
                    <span className="text-lg font-black text-indigo-900">
                      {formatEuro(calc.freelanceIncomeBreakdown.totalFreelanceNetProfit)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                  {/* Primary Spouse Freelance */}
                  <div className="rounded-lg bg-white p-3.5 border border-indigo-100 shadow-xs">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-1.5">
                      <span>Primary Filer (Case 21/23)</span>
                      <span className="text-emerald-600 font-extrabold">
                        {formatEuro(calc.freelanceIncomeBreakdown.primaryNetProfit)}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 space-y-0.5">
                      <div className="flex justify-between">
                        <span>Gross Invoiced:</span>
                        <span className="font-semibold text-slate-700">
                          {formatEuro(calc.freelanceIncomeBreakdown.primaryGrossRevenue)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Operating Expenses:</span>
                        <span className="font-semibold text-rose-600">
                          -{formatEuro(calc.freelanceIncomeBreakdown.primaryBusinessExpenses)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Co-Filer Spouse Freelance */}
                  <div className="rounded-lg bg-white p-3.5 border border-indigo-100 shadow-xs">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-1.5">
                      <span>Co-Filer Spouse (Case 22/24)</span>
                      <span className="text-emerald-600 font-extrabold">
                        {formatEuro(calc.freelanceIncomeBreakdown.spouseNetProfit)}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 space-y-0.5">
                      <div className="flex justify-between">
                        <span>Gross Invoiced:</span>
                        <span className="font-semibold text-slate-700">
                          {formatEuro(calc.freelanceIncomeBreakdown.spouseGrossRevenue)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Operating Expenses:</span>
                        <span className="font-semibold text-rose-600">
                          -{formatEuro(calc.freelanceIncomeBreakdown.spouseBusinessExpenses)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

          {/* Legal breakdown — every deduction and credit box */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-slate-900">Deduction and credit breakdown</h4>
              <span className="text-[11px] font-semibold text-slate-500">
                {calc.assessmentMode.replace('_', ' ')}
                {calc.class2WithoutSpouse ? ' · Class 2 without spouse (Art. 119 n° 3)' : ''} ·{' '}
                {calc.rulePackageVersion}
              </span>
            </div>

            <div className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Net income (all categories)</span>
                <span className="font-semibold">{formatEuro(calc.netIncome)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Frais d'obtention (Art. 105/107)
                    {" "}<HelpTip id="fraisObtention" /></span>
                <span className="font-semibold">-{formatEuro(calc.deductions.fraisObtention)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Déplacement (Art. 105bis)</span>
                <span className="font-semibold">-{formatEuro(calc.deductions.travel)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Owner-occupier interest (Art. 98 n°5 / 105)</span>
                <span className="font-semibold">-{formatEuro(calc.deductions.mortgageInterest)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Art. 111 insurance envelope (€672)</span>
                <span className="font-semibold">-{formatEuro(calc.deductions.art111)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">ASRD single premium (Art. 111 al. 3/4)</span>
                <span className="font-semibold">-{formatEuro(calc.deductions.asrd)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Art. 111bis third pillar</span>
                <span className="font-semibold">-{formatEuro(calc.deductions.art111bis)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Épargne-logement</span>
                <span className="font-semibold">-{formatEuro(calc.deductions.savingsHousing)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">LRCP (Art. 110 n°3)</span>
                <span className="font-semibold">-{formatEuro(calc.deductions.lrcp)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Dépenses spéciales (forfait {calc.deductions.specialExpensesForfait}€)</span>
                <span className="font-semibold">-{formatEuro(calc.deductions.specialExpensesTotal)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Charges extraordinaires (Art. 127)</span>
                <span className="font-semibold">-{formatEuro(calc.deductions.extraordinaryCharges)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">AEP (Art. 129b)</span>
                <span className="font-semibold">-{formatEuro(calc.deductions.aep)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Prior losses (Art. 114)</span>
                <span className="font-semibold">-{formatEuro(calc.deductions.priorLosses)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">CIS</span>
                <span className="font-semibold">-{formatEuro(calc.credits.cis)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">CI-CO2 salarié</span>
                <span className="font-semibold">-{formatEuro(calc.credits.ciCo2Salary)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">CII (independent)</span>
                <span className="font-semibold">-{formatEuro(calc.credits.cii)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">CIC (crédit d'impôt conjoncture)</span>
                <span className="font-semibold">-{formatEuro(calc.credits.cic)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Prime jeune salarié (exempt, Art. 115 n°13d)</span>
                <span className="font-semibold">{formatEuro(calc.youngEmployeePrimeExemption ?? 0)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">CISSM (salaire social minimum)</span>
                <span className="font-semibold">-{formatEuro(calc.credits.cissm)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Foreign tax credit
                    {" "}<HelpTip id="foreignIncome" /></span>
                <span className="font-semibold">-{formatEuro(calc.credits.foreignTaxCredit)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">CIM applied (single parent)
                    {" "}<HelpTip id="cim" /></span>
                <span className="font-semibold">-{formatEuro(calc.credits.cimApplied ?? 0)}</span>
              </div>
              {calc.credits.cimRefund > 0 && (
                <div className="flex justify-between border-b border-slate-100 py-1">
                  <span className="text-slate-600">
                    CIM refunded (Art. 154ter)
                    <span className="mt-0.5 block text-[11px] text-slate-400">
                      Refundable excess paid out — increases your refund
                    </span>
                  </span>
                  <span className="font-semibold text-emerald-600">+{formatEuro(calc.credits.cimRefund)}</span>
                </div>
              )}
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Start-up credit (2026)</span>
                <span className="font-semibold">-{formatEuro(calc.credits.startup)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Rental net (Art. 98)</span>
                <span className="font-semibold">{formatEuro(calc.rental?.net ?? 0)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1">
                <span className="text-slate-600">Plus-values taxed at the demi-taux</span>
                <span className="font-semibold">{formatEuro(calc.plusValues?.taxableExtraordinary ?? 0)}</span>
              </div>
              <div className="flex justify-between py-1 font-bold text-slate-900">
                <span>Taxable income
                    {" "}<HelpTip id="taxableIncome" /></span>
                <span>{formatEuro(calc.taxableIncome)}</span>
              </div>
              <div className="flex justify-between py-1 font-bold text-slate-900">
                <span>Marginal / effective rate
                    {" "}<HelpTip id="marginalRate" /></span>
                <span>{(calc.marginalRate * 100).toFixed(0)}% / {calc.effectiveTaxRate.toFixed(1)}%</span>
              </div>
            </div>

            {calc.childRelief && calc.childRelief.total > 0 && (
              <div className="mt-4 border-t border-slate-200 pt-3 text-xs">
                <div className="mb-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Child relief
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1">
                  <span className="text-slate-600">Dégrèvement (Art. 122)</span>
                  <span className="font-semibold">-{formatEuro(calc.childRelief.degrevement)}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1">
                  <span className="text-slate-600">Bonification (Art. 123bis)</span>
                  <span className="font-semibold">-{formatEuro(calc.childRelief.bonification)}</span>
                </div>
                <div className="flex justify-between py-1 font-bold text-slate-900">
                  <span>Total child relief
                    {" "}<HelpTip id="childrenModeration" /></span>
                  <span>-{formatEuro(calc.childRelief.total)}</span>
                </div>
                {calc.childRelief.bonificationPhaseOut && (
                  <p className="mt-1 text-[11px] text-amber-700">Bonification phased out at your RIA</p>
                )}
              </div>
            )}

            {calc.warnings.length > 0 && (
              <ul className="mt-4 space-y-1 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                {calc.warnings.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Provenance Trace Accordion */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <button
              onClick={() => setShowProvenance(!showProvenance)}
              className="w-full flex items-center justify-between px-6 py-4 text-left font-bold text-sm text-slate-900 hover:bg-slate-50 border-b border-slate-100"
            >
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-sky-500" />
                <span>Explainable Line-Item Provenance ({calc.provenance.length} Rules Applied)</span>
              </div>
              <span className="text-xs text-sky-600 font-semibold">
                {showProvenance ? 'Hide Details' : 'View Full Trace'}
              </span>
            </button>

            {showProvenance && (
              <div className="p-6 space-y-4 bg-slate-50/50">
                {calc.provenance.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-slate-200 bg-white p-4 text-xs shadow-sm space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded">
                        {item.ruleCode}
                      </span>
                      <strong className="text-slate-900 font-bold text-sm">
                        {formatEuro(item.outputAmount)}
                      </strong>
                    </div>
                    <p className="text-slate-700 font-medium">{item.description}</p>
                    <div className="font-mono text-[11px] text-slate-500 bg-slate-100 p-2 rounded">
                      Formula: {item.formula}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
          <p className="text-sm font-semibold text-slate-800">No Calculation Generated Yet</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto mb-4">
            Click below to calculate your estimated 2025 Luxembourg income tax according to the latest ACD progressive tax scale.
          </p>
          <button
            onClick={handleRunCalculation}
            disabled={calculating}
            className="rounded-lg bg-sky-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-sky-500 shadow-sm"
          >
            {calculating ? 'Running Calculations...' : '⚡ Run First Tax Calculation'}
          </button>
        </div>
      )}

      {/* Class 2 vs 2× Class 1 / Art. 3ter comparison — never persisted */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-bold text-slate-900">Scenario comparison
                    {" "}<HelpTip id="scenarioComparison" /></h4>
            <p className="mt-0.5 text-xs text-slate-500">
              Compare collective Class 2, 2× Class 1 and the Art. 3ter reallocation on the same facts.
              The comparison is not saved and does not change the active election.
            </p>
          </div>
          <button
            onClick={handleCompareScenarios}
            disabled={comparing}
            className="rounded-lg bg-slate-800 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {comparing ? 'Comparing scenarios...' : 'Compare Class 2 vs 2× Class 1'}
          </button>
        </div>

        {comparison &&
          (comparison.comparable ? (
            <div className="mt-4 space-y-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="py-2 pr-2 font-semibold">Scenario</th>
                    <th className="py-2 font-semibold text-right">Final tax liability</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-2 text-slate-700">Collective Class 2 (Art. 3)</td>
                    <td className="py-2 text-right font-semibold text-slate-900">
                      {eur(comparison.collective.finalTaxLiability)}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-2 text-slate-700">2× Class 1 (Art. 3ter pure)</td>
                    <td className="py-2 text-right font-semibold text-slate-900">
                      {eur(comparison.individualPure.finalTaxLiability)}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-2 text-slate-700">Art. 3ter reallocation</td>
                    <td className="py-2 text-right font-semibold text-slate-900">
                      {eur(comparison.individualReallocation.finalTaxLiability)}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="grid gap-2 text-xs sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">Collective − 2× Class 1</span>
                  <div className="mt-0.5 text-sm font-bold text-slate-900">
                    {signedEur(comparison.deltaCollectiveVsIndividual)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">Collective − Art. 3ter reallocation</span>
                  <div className="mt-0.5 text-sm font-bold text-slate-900">
                    {signedEur(comparison.deltaCollectiveVsReallocation)}
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-400">
                A positive delta means the collective assessment costs more. Rule package{' '}
                {comparison.rulePackageVersion} · tax year {comparison.taxYear}.
              </p>

              {comparison.warnings.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
                  {comparison.warnings.map((warning, index) => (
                    <li key={index}>• {warning}</li>
                  ))}
                </ul>
              )}

              <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
                This is an estimate, not a filing election; Art. 3ter must be elected within the deadline.
              </p>
            </div>
          ) : (
            <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              Only a Class 2 couple can compare these scenarios.
            </p>
          ))}
      </div>
    </div>
  );
}
