'use client';

import React, { useState, useEffect } from 'react';
import { apiClient } from '../lib/api';
import { TaxCalculationResultDto } from '@luxtax/contracts';

interface TaxCalculatorViewProps {
  workspaceId: string;
}

export function TaxCalculatorView({ workspaceId }: TaxCalculatorViewProps) {
  const [calc, setCalc] = useState<TaxCalculationResultDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [showProvenance, setShowProvenance] = useState(false);

  const loadCalculation = async () => {
    setLoading(true);
    const res = await apiClient.getCalculation(workspaceId);
    if (res.data) {
      setCalc(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadCalculation();
  }, [workspaceId]);

  const handleRunCalculation = async () => {
    setCalculating(true);
    const res = await apiClient.calculateTax(workspaceId);
    if (res.data) {
      setCalc(res.data);
    }
    setCalculating(false);
  };

  if (loading) {
    return <div className="p-8 text-center text-sm text-slate-500">Loading tax estimate...</div>;
  }

  const isRefund = calc ? calc.balancePayableOrRefund < 0 : false;
  const balanceAbs = calc ? Math.abs(calc.balancePayableOrRefund) : 0;

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            Deterministic Tax Engine (Tax Year 2025)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Calculated strictly according to Article 118-121 LIR and published ACD scales.
          </p>
        </div>

        <button
          onClick={handleRunCalculation}
          disabled={calculating}
          className="rounded-lg bg-sky-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-sky-500 disabled:opacity-50 transition-colors"
        >
          {calculating ? 'Running Tax Formulas...' : '⚡ Calculate 2025 Tax'}
        </button>
      </div>

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
                <div className="mt-1 text-4xl font-black">
                  €{balanceAbs.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <p className="mt-1 text-xs text-white/80">
                  {isRefund
                    ? 'Excess tax deducted at source will be reimbursed by the Administration des contributions directes.'
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
                  <strong className="text-white font-bold">
                    €{calc.taxableIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </strong>
                </div>
                <div>
                  <span className="text-white/70">Solidarity Surcharge:</span>{' '}
                  <strong className="text-white font-bold">
                    {(calc.solidaritySurchargeRate * 100).toFixed(0)}% (€
                    {calc.solidaritySurchargeAmount.toFixed(2)})
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
              </span>
              <div className="mt-1 text-xl font-bold text-slate-900">
                €{calc.grossIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] text-slate-400">Total household salary</span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Deductions
              </span>
              <div className="mt-1 text-xl font-bold text-emerald-600">
                -€{calc.totalDeductions.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] text-slate-400">Expenses & special deductions</span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Tax Credits (CIS/CIM)
              </span>
              <div className="mt-1 text-xl font-bold text-sky-600">
                -€{calc.totalTaxCredits.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] text-slate-400">Credited against base tax</span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Withheld at Source
              </span>
              <div className="mt-1 text-xl font-bold text-amber-600">
                €{calc.taxWithheldAtSource.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <span className="text-[11px] text-slate-400">Code 105 on salary slips</span>
            </div>
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
                        €{item.outputAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
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
          <p className="text-sm">No calculation has been generated for this workspace yet.</p>
          <button
            onClick={handleRunCalculation}
            className="mt-4 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500"
          >
            Run First Tax Calculation
          </button>
        </div>
      )}
    </div>
  );
}
