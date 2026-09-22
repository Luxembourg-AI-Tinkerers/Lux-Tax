'use client';

import React, { useState, useEffect } from 'react';
import { apiClient } from '../lib/api';
import { ConfirmedFactDto, FactCategory } from '@luxtax/contracts';

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
  { category: FactCategory.EMPLOYMENT_INCOME, fieldKey: 'grossSalary', label: 'Gross Salary (Case 101 - Rémunération brute)' },
  { category: FactCategory.EMPLOYMENT_INCOME, fieldKey: 'socialSecurity', label: 'Social Security (Case 103 - Cotisations sociales déductibles)' },
  { category: FactCategory.EMPLOYMENT_INCOME, fieldKey: 'withholdingTax', label: 'Tax Withheld at Source (Case 105 - Retenue d\'impôt)' },
  { category: FactCategory.MORTGAGE_DEDUCTION, fieldKey: 'mortgageInterest', label: 'Mortgage Debit Interest (Case 141 - Intérêts débiteurs habitation)' },
  { category: FactCategory.INSURANCE_DEDUCTION, fieldKey: 'pension111bis', label: 'Private Pension Plan (Art 111bis LIR - Prévoyance vieillesse)' },
  { category: FactCategory.INSURANCE_DEDUCTION, fieldKey: 'insurance111', label: 'Life & Disability Insurance (Art 111 LIR - Primes d\'assurance)' },
  { category: FactCategory.DONATION_DEDUCTION, fieldKey: 'donations', label: 'Charitable Donations (Art 112 LIR - Dons reconnus)' },
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
    } else {
      showFeedback('success', `Added ${newFact.fieldKey} of €${num.toFixed(2)} to return`);
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
    }
  };

  const handleQuickLoadDemo = async () => {
    setLoadingDemo(true);
    const demoItems = [
      { category: FactCategory.EMPLOYMENT_INCOME, fieldKey: 'grossSalary', amount: '75000.00', description: '2025 Annual Employment Gross Salary' },
      { category: FactCategory.EMPLOYMENT_INCOME, fieldKey: 'socialSecurity', amount: '9375.00', description: 'CCSS Statutory Health & Pension Contributions (12.5%)' },
      { category: FactCategory.EMPLOYMENT_INCOME, fieldKey: 'withholdingTax', amount: '12800.00', description: 'Employer Tax Withheld at Source (Retenue d\'impôt)' },
      { category: FactCategory.MORTGAGE_DEDUCTION, fieldKey: 'mortgageInterest', amount: '3500.00', description: 'BCEE Mortgage Debit Interest (Habitation personnelle)' },
      { category: FactCategory.INSURANCE_DEDUCTION, fieldKey: 'pension111bis', amount: '3200.00', description: 'Foyer Prévoyance-Vieillesse Private Pension Contract' },
      { category: FactCategory.DONATION_DEDUCTION, fieldKey: 'donations', amount: '500.00', description: 'Donation to Croix-Rouge Luxembourgeoise' },
    ];

    for (const item of demoItems) {
      await apiClient.confirmFact(workspaceId, {
        category: item.category,
        fieldKey: item.fieldKey,
        amount: item.amount,
        currency: 'EUR',
        isIncludedInReturn: true,
        isSharedWithHousehold: true,
        description: item.description,
      });
    }

    setLoadingDemo(false);
    showFeedback('success', 'Loaded 6 realistic 2025 Luxembourg tax facts into workspace!');
    await refresh();
    onFactsChanged();
  };

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
          <button onClick={() => setFeedback(null)} className="text-xs opacity-60 hover:opacity-100">
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
          <div className="mt-2 text-2xl font-black text-slate-900">
            €{totalGrossSalary.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <p className="mt-1 text-xs text-slate-500">Case 101 - Base for Luxembourg PIT</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Tax Withheld at Source
          </span>
          <div className="mt-2 text-2xl font-black text-amber-600">
            €{totalWithholdingTax.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <p className="mt-1 text-xs text-slate-500">Case 105 - Prepaid tax deducted on salary slips</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Confirmed Deductible Expenses
          </span>
          <div className="mt-2 text-2xl font-black text-emerald-600">
            €{totalDeductions.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <p className="mt-1 text-xs text-slate-500">Mortgage interest, insurance, and donations</p>
        </div>
      </div>

      {/* Action Header & Facts Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Confirmed Tax Facts ({confirmedFacts.length})
            </h3>
            <p className="text-xs text-slate-500">
              All financial values confirmed here are directly injected into the 2025 calculation engine and Form 100.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleQuickLoadDemo}
              disabled={loadingDemo}
              className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-100 transition disabled:opacity-50"
            >
              {loadingDemo ? 'Populating...' : '⚡ Quick Load 2025 Demo Facts'}
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-500 shadow-sm transition"
            >
              + Add Fact
            </button>
            <button onClick={refresh} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 font-semibold">
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
                ⚡ Load 2025 Demo Facts
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">Category</th>
                  <th className="px-6 py-3">Field / Box</th>
                  <th className="px-6 py-3">Description</th>
                  <th className="px-6 py-3">Amount (EUR)</th>
                  <th className="px-6 py-3">Included</th>
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
                        `€${parseFloat(fact.amount).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                        })}`
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
