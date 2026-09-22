'use client';

import React, { useState, useEffect } from 'react';
import { apiClient } from '../lib/api';
import { ConfirmedFactDto, FactCategory } from '@luxtax/contracts';

interface FactsViewProps {
  workspaceId: string;
  onFactsChanged: () => void;
}

export function FactsView({ workspaceId, onFactsChanged }: FactsViewProps) {
  const [confirmedFacts, setConfirmedFacts] = useState<ConfirmedFactDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');

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
    await apiClient.updateFact(workspaceId, factId, {
      amount: editAmount,
    });
    setEditingId(null);
    await refresh();
    onFactsChanged();
  };

  const handleDelete = async (factId: string) => {
    if (!confirm('Deleting a fact will invalidate any approved returns. Proceed?')) return;
    await apiClient.deleteFact(workspaceId, factId);
    await refresh();
    onFactsChanged();
  };

  const totalDeductions = confirmedFacts
    .filter((f) => f.category !== FactCategory.EMPLOYMENT_INCOME && f.isIncludedInReturn)
    .reduce((sum, f) => sum + parseFloat(f.amount || '0'), 0);

  const totalGrossSalary = confirmedFacts
    .filter((f) => f.fieldKey === 'grossSalary' && f.isIncludedInReturn)
    .reduce((sum, f) => sum + parseFloat(f.amount || '0'), 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Confirmed Gross Salary
          </span>
          <div className="mt-2 text-2xl font-black text-slate-900">
            €{totalGrossSalary.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <p className="mt-1 text-xs text-slate-500">Subject to Luxembourg personal income tax</p>
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

      {/* Confirmed Facts Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">
            Confirmed Facts in Return ({confirmedFacts.length})
          </h3>
          <button onClick={refresh} className="text-xs text-sky-600 hover:text-sky-700 font-semibold">
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading facts...</div>
        ) : confirmedFacts.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No facts confirmed yet. Upload documents or answer the tax questionnaire to add figures.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">Category</th>
                  <th className="px-6 py-3">Field Key</th>
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
                    <td className="px-6 py-4 font-medium text-slate-900">
                      {fact.fieldKey}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-900">
                      {editingId === fact.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
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
    </div>
  );
}
