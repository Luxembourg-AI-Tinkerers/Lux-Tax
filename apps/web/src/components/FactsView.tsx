'use client';

import React, { useState, useEffect } from 'react';
import { HelpTip } from './HelpTip';
import { apiClient } from '../lib/api';
import { ConfirmedFactDto, FactCategory } from '@luxtax/contracts';
import { FACT_INCLUSION_DOWNGRADE_MESSAGE, factInclusionWarning } from '../lib/fact-inclusion';
import { splitNewFacts } from '../lib/fact-dedup';
import { formatEuro } from '../lib/money';

interface FactsViewProps {
  workspaceId: string;
  onFactsChanged: () => void;
}

interface NewFactForm {
  category: FactCategory;
  fieldKey: string;
  amount: string;
  description: string;
  isIncludedInReturn: boolean;
}

const PRESET_FIELDS = [
  { category: FactCategory.EMPLOYMENT_INCOME, fieldKey: 'grossSalary', label: 'Gross salary — Art. 95 (certificat 160 code 101)' },
  { category: FactCategory.EMPLOYMENT_INCOME, fieldKey: 'socialSecurity', label: 'Social contributions — code 103' },
  { category: FactCategory.EMPLOYMENT_INCOME, fieldKey: 'withholdingTax', label: 'Tax withheld at source — code 105' },
  { category: FactCategory.EMPLOYMENT_INCOME, fieldKey: 'fraisObtention', label: 'Actual professional expenses — Art. 105 (if above €540)' },
  { category: FactCategory.PENSION_INCOME, fieldKey: 'grossPension', label: 'Pension / rente — Art. 96' },
  { category: FactCategory.PENSION_INCOME, fieldKey: 'withholdingTax', label: 'Withholding on pension' },
  { category: FactCategory.FREELANCE_INCOME, fieldKey: 'freelanceRevenue', label: 'Independent revenue — Art. 14 / 91' },
  { category: FactCategory.BUSINESS_EXPENSE, fieldKey: 'businessExpense', label: 'Deductible business expense — Art. 14 / 91' },
  { category: FactCategory.FREELANCE_INCOME, fieldKey: 'professionalRevenue', label: 'Liberal profession revenue — Art. 91 (Form 100 page 6, sheet I)' },
  { category: FactCategory.BUSINESS_EXPENSE, fieldKey: 'professionalExpense', label: 'Liberal profession expense — Art. 91 (Form 100 page 6, sheet I)' },
  { category: FactCategory.CAPITAL_INCOME, fieldKey: 'capitalIncome', label: 'Capital income — interest, non-qualifying dividends (Art. 97)' },
  { category: FactCategory.CAPITAL_INCOME, fieldKey: 'qualifyingDividend', label: 'Qualifying dividend — 50 % exempt (Art. 115 n° 15a)' },
  { category: FactCategory.CAPITAL_INCOME, fieldKey: 'withholdingTax', label: 'Withholding on capital income (15 % / RELIBI)' },
  { category: FactCategory.RENTAL_INCOME, fieldKey: 'grossRent', label: 'Gross rent received — Art. 98' },
  { category: FactCategory.RENTAL_INCOME, fieldKey: 'rentalCharges', label: 'Rental charges paid — Art. 98' },
  { category: FactCategory.FOREIGN_INCOME, fieldKey: 'foreignIncome', label: 'Foreign income — Art. 2 / treaties' },
  { category: FactCategory.MORTGAGE_INTEREST, fieldKey: 'mortgageInterest', label: 'Owner-occupier interest — Art. 98 n° 5 / 105' },
  { category: FactCategory.INSURANCE_DEDUCTION, fieldKey: 'insurance111', label: 'Insurance / consumer interest — Art. 111 (€672 envelope)' },
  { category: FactCategory.PENSION_SAVINGS_111BIS, fieldKey: 'art111bis', label: 'Prévoyance-vieillesse — Art. 111bis (€3,200 / €4,500)' },
  { category: FactCategory.SAVINGS_HOUSING, fieldKey: 'savingsHousing', label: 'Épargne-logement — Art. 111 al. 5' },
  { category: FactCategory.LRCP_CONTRIBUTION, fieldKey: 'lrcp', label: 'LRCP personal contribution — Art. 110 n° 3 (€1,200)' },
  { category: FactCategory.DONATION_DEDUCTION, fieldKey: 'donations', label: 'Donations — Art. 112 (additive to the forfait)' },
  { category: FactCategory.CHILDCARE_EXPENSE, fieldKey: 'childcare', label: 'Childcare — Art. 127 (forfait €5,400)' },
  { category: FactCategory.HOUSEHOLD_HELP_EXPENSE, fieldKey: 'householdHelp', label: 'Household help — Art. 127' },
];

/** The demo set, at module scope so the button can tell whether it is fully loaded. */
const DEMO_FACTS = [
  { category: FactCategory.EMPLOYMENT_INCOME, fieldKey: 'grossSalary', amount: '75000.00', description: '2025 Annual Employment Gross Salary' },
  { category: FactCategory.EMPLOYMENT_INCOME, fieldKey: 'socialSecurity', amount: '9375.00', description: 'CCSS Statutory Health & Pension Contributions (12.5%)' },
  { category: FactCategory.EMPLOYMENT_INCOME, fieldKey: 'withholdingTax', amount: '12800.00', description: "Employer Tax Withheld at Source (Retenue d'impôt)" },
  { category: FactCategory.MORTGAGE_INTEREST, fieldKey: 'mortgageInterest', amount: '3500.00', description: 'BCEE Mortgage Debit Interest (Habitation personnelle)' },
  { category: FactCategory.PENSION_SAVINGS_111BIS, fieldKey: 'art111bis', amount: '3200.00', description: 'Foyer Prévoyance-Vieillesse Private Pension Contract' },
  { category: FactCategory.DONATION_DEDUCTION, fieldKey: 'donations', amount: '500.00', description: 'Donation to Croix-Rouge Luxembourgeoise' },
];

export function FactsView({ workspaceId, onFactsChanged }: FactsViewProps) {
  const [confirmedFacts, setConfirmedFacts] = useState<ConfirmedFactDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addingFact, setAddingFact] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [newFact, setNewFact] = useState<NewFactForm>({
    category: FactCategory.EMPLOYMENT_INCOME,
    fieldKey: 'grossSalary',
    amount: '',
    description: '',
    isIncludedInReturn: true,
  });

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const refresh = async () => {
    setLoading(true);
    const res = await apiClient.getFacts(workspaceId);
    if (res.data) {
      setConfirmedFacts(res.data.confirmedFacts);
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, [workspaceId]);

  const handleStartEdit = (fact: ConfirmedFactDto) => {
    setEditingId(fact.id);
    setEditAmount(fact.amount);
  };

  const handleSaveEdit = async (factId: string) => {
    const num = parseFloat(editAmount);
    if (isNaN(num) || num < 0) {
      showFeedback('error', 'Please enter a valid positive number');
      return;
    }

    const res = await apiClient.updateFact(workspaceId, factId, {
      amount: num.toFixed(2),
    });

    if (res.error) {
      showFeedback('error', res.error);
    } else {
      showFeedback('success', 'Fact amount updated successfully');
      setEditingId(null);
      await refresh();
      onFactsChanged();
    }
  };

  const handleDelete = async (factId: string) => {
    if (!confirm('Are you sure you want to remove this fact from your return?')) return;
    const res = await apiClient.deleteFact(workspaceId, factId);
    if (res.error) {
      showFeedback('error', res.error);
    } else {
      showFeedback('success', 'Fact deleted successfully');
      await refresh();
      onFactsChanged();
    }
  };

  const handleCreateFact = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(newFact.amount);
    if (isNaN(num) || num <= 0) {
      showFeedback('error', 'Please enter an amount greater than 0');
      return;
    }

    setAddingFact(true);
    const res = await apiClient.confirmFact(workspaceId, {
      category: newFact.category,
      fieldKey: newFact.fieldKey,
      amount: num.toFixed(2),
      currency: 'EUR',
      isIncludedInReturn: newFact.isIncludedInReturn,
      isSharedWithHousehold: true,
      description: newFact.description.trim() || undefined,
    });

    setAddingFact(false);
    if (res.error) {
      showFeedback('error', res.error);
      return;
    }

    const inclusionWarning = factInclusionWarning(
      newFact.isIncludedInReturn,
      res.data?.isIncludedInReturn,
    );
    if (inclusionWarning) {
      showFeedback('error', inclusionWarning);
    } else {
      showFeedback('success', `Added ${newFact.fieldKey} of €${num.toFixed(2)} to return`);
    }

    setIsAddModalOpen(false);
    setNewFact({
      category: FactCategory.EMPLOYMENT_INCOME,
      fieldKey: 'grossSalary',
      amount: '',
      description: '',
      isIncludedInReturn: true,
    });
    await refresh();
    onFactsChanged();
  };

  const handleQuickLoadDemo = async () => {
    setLoadingDemo(true);

    // The engine sums every confirmed fact, so a second click must not insert
    // the same figures again: facts already recorded on the same category +
    // box are skipped and reported, not duplicated.
    const factsRes = await apiClient.getFacts(workspaceId);
    if (factsRes.error) {
      setLoadingDemo(false);
      showFeedback('error', `Could not check the facts already recorded: ${factsRes.error}`);
      return;
    }
    const existingFacts = factsRes.data?.confirmedFacts ?? [];
    const { missing, present } = splitNewFacts(DEMO_FACTS, existingFacts);

    let inclusionDowngraded = false;
    let demoError: string | null = null;
    for (const item of missing) {
      const demoRes = await apiClient.confirmFact(workspaceId, {
        category: item.category,
        fieldKey: item.fieldKey,
        amount: item.amount,
        currency: 'EUR',
        isIncludedInReturn: true,
        isSharedWithHousehold: true,
        description: item.description,
      });
      if (demoRes.error) {
        demoError = demoRes.error;
        break;
      }
      if (factInclusionWarning(true, demoRes.data?.isIncludedInReturn)) {
        inclusionDowngraded = true;
      }
    }

    setLoadingDemo(false);
    if (demoError) {
      showFeedback('error', `Loading the demo facts failed: ${demoError}`);
    } else if (inclusionDowngraded) {
      showFeedback('error', FACT_INCLUSION_DOWNGRADE_MESSAGE);
    } else if (missing.length === 0) {
      showFeedback('success', `All ${DEMO_FACTS.length} demo facts are already recorded — nothing was added.`);
    } else {
      showFeedback(
        'success',
        present.length === 0
          ? `Loaded ${missing.length} realistic 2025 Luxembourg tax facts into workspace!`
          : `Loaded ${missing.length} demo facts; ${present.length} were already recorded and left untouched.`,
      );
    }
    await refresh();
    onFactsChanged();
  };

  // A demo set that is fully recorded disables the button: it would only report
  // that there is nothing left to add.
  const demoAlreadyLoaded = splitNewFacts(DEMO_FACTS, confirmedFacts).missing.length === 0;

  const totalDeductions = confirmedFacts
    .filter((f) => f.category !== FactCategory.EMPLOYMENT_INCOME && f.isIncludedInReturn)
    .reduce((sum, f) => sum + parseFloat(f.amount || '0'), 0);

  const totalGrossSalary = confirmedFacts
    .filter((f) => (f.fieldKey === 'grossSalary' || f.fieldKey === 'code_101') && f.isIncludedInReturn)
    .reduce((sum, f) => sum + parseFloat(f.amount || '0'), 0);

  const totalWithholdingTax = confirmedFacts
    .filter((f) => (f.fieldKey === 'withholdingTax' || f.fieldKey === 'code_105') && f.isIncludedInReturn)
    .reduce((sum, f) => sum + parseFloat(f.amount || '0'), 0);

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
          <button
            onClick={() => setFeedback(null)}
            aria-label="Dismiss notification"
            className="text-xs opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Confirmed Gross Salary
          </span>
          <div className="mt-2 text-2xl font-black text-slate-900">{formatEuro(totalGrossSalary)}</div>
          <p className="mt-1 text-xs text-slate-500">Case 101 - Base for Luxembourg PIT</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Tax Withheld at Source
          </span>
          <div className="mt-2 text-2xl font-black text-amber-600">{formatEuro(totalWithholdingTax)}</div>
          <p className="mt-1 text-xs text-slate-500">Case 105 - Prepaid tax deducted on salary slips</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Confirmed Deductible Expenses
          </span>
          <div className="mt-2 text-2xl font-black text-emerald-600">{formatEuro(totalDeductions)}</div>
          <p className="mt-1 text-xs text-slate-500">Mortgage interest, insurance, and donations</p>
        </div>
      </div>

      {/* Action Header & Facts Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Confirmed Tax Facts
                    {" "}<HelpTip id="confirmedFacts" /> ({confirmedFacts.length})
            </h3>
            <p className="text-xs text-slate-500">
              All financial values confirmed here are injected into the versioned calculation engine and the Form 100 package for the workspace tax year.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleQuickLoadDemo}
              disabled={loadingDemo || demoAlreadyLoaded}
              title={
                demoAlreadyLoaded
                  ? 'Every demo fact is already recorded in this workspace'
                  : 'Insert the demo facts that are not recorded yet'
              }
              className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-100 transition disabled:opacity-50"
            >
              {loadingDemo
                ? 'Populating...'
                : demoAlreadyLoaded
                  ? '✓ Demo Facts Loaded'
                  : '⚡ Quick Load 2025 Demo Facts'}
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-500 shadow-sm transition"
            >
              + Add Fact
            </button>
            <button
              onClick={refresh}
              aria-label="Refresh confirmed facts"
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 font-semibold"
            >
              ↻
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading facts...</div>
        ) : confirmedFacts.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <div className="h-12 w-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3 text-xl font-bold">
              💶
            </div>
            <h4 className="text-sm font-bold text-slate-800">No Tax Facts Recorded Yet</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto mb-5">
              Add your salary, mortgage interest, or insurance contributions manually, or click Quick Load to test with realistic 2025 numbers.
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-500 shadow-sm"
              >
                + Add Fact Manually
              </button>
              <button
                onClick={handleQuickLoadDemo}
                disabled={loadingDemo}
                className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-2 text-xs font-bold text-sky-700 hover:bg-sky-100"
              >
                {loadingDemo ? 'Populating...' : '⚡ Load 2025 Demo Facts'}
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">Category{" "}<HelpTip id="factCategory" /></th>
                  <th className="px-6 py-3">Field / Box</th>
                  <th className="px-6 py-3">Description</th>
                  <th className="px-6 py-3">Amount (EUR)</th>
                  <th className="px-6 py-3">Included{" "}<HelpTip id="factInclusion" /></th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {confirmedFacts.map((fact) => (
                  <tr key={fact.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {fact.category.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs font-bold text-slate-900">
                      {fact.fieldKey}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-600">
                      {fact.description || '—'}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-900">
                      {editingId === fact.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.01"
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            className="w-28 rounded border border-slate-300 px-2 py-1 text-xs"
                          />
                          <button
                            onClick={() => handleSaveEdit(fact.id)}
                            className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-500"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="rounded bg-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        formatEuro(fact.amount)
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        {fact.isIncludedInReturn ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {editingId !== fact.id && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleStartEdit(fact)}
                            className="text-xs text-sky-600 hover:text-sky-700 font-semibold"
                          >
                            Edit
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            onClick={() => handleDelete(fact.id)}
                            className="text-xs text-rose-600 hover:text-rose-700 font-semibold"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Fact Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-base">Add Confirmed Tax Fact</h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                aria-label="Close add-fact dialog"
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateFact} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Tax Item Type
                </label>
                <select
                  value={`${newFact.category}:::${newFact.fieldKey}`}
                  onChange={(e) => {
                    const [cat, key] = e.target.value.split(':::');
                    setNewFact({
                      ...newFact,
                      category: cat as FactCategory,
                      fieldKey: key,
                    });
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                >
                  {PRESET_FIELDS.map((preset) => (
                    <option key={`${preset.category}:::${preset.fieldKey}`} value={`${preset.category}:::${preset.fieldKey}`}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Amount in EUR (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="e.g. 75000.00"
                  value={newFact.amount}
                  onChange={(e) => setNewFact({ ...newFact, amount: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Description / Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Annual certificate from Employer S.A."
                  value={newFact.description}
                  onChange={(e) => setNewFact({ ...newFact, description: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="includeCheck"
                  checked={newFact.isIncludedInReturn}
                  onChange={(e) => setNewFact({ ...newFact, isIncludedInReturn: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <label htmlFor="includeCheck" className="text-xs font-medium text-slate-700 cursor-pointer">
                  Include in 2025 Luxembourg Tax Return calculation
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingFact}
                  className="rounded-xl bg-sky-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-sky-500 shadow-sm disabled:opacity-50"
                >
                  {addingFact ? 'Saving Fact...' : 'Save Confirmed Fact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
