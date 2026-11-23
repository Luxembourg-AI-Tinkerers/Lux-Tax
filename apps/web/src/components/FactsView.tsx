'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Check,
  Euro,
  Landmark,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { HelpTip } from './HelpTip';
import { apiClient } from '../lib/api';
import { ConfirmedFactDto, FactCategory } from '@luxtax/contracts';
import { FACT_INCLUSION_DOWNGRADE_MESSAGE, factInclusionWarning } from '../lib/fact-inclusion';
import { splitNewFacts } from '../lib/fact-dedup';
import { formatEuro } from '../lib/money';
import { ToastBanner, type ToastMessage } from './ui/ToastBanner';
import { Modal } from './ui/Modal';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { TableSkeleton } from './ui/Skeleton';
import { EmptyState } from './ui/EmptyState';

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

const INCOME_CATEGORIES = new Set<FactCategory>([
  FactCategory.EMPLOYMENT_INCOME,
  FactCategory.FREELANCE_INCOME,
  FactCategory.PENSION_INCOME,
  FactCategory.CAPITAL_INCOME,
  FactCategory.RENTAL_INCOME,
  FactCategory.FOREIGN_INCOME,
]);

/** The demo set, at module scope so the button can tell whether it is fully loaded. */
const DEMO_FACTS = [
  { category: FactCategory.EMPLOYMENT_INCOME, fieldKey: 'grossSalary', amount: '75000.00', description: '2025 Annual Employment Gross Salary' },
  { category: FactCategory.EMPLOYMENT_INCOME, fieldKey: 'socialSecurity', amount: '9375.00', description: 'CCSS Statutory Health & Pension Contributions (12.5%)' },
  { category: FactCategory.EMPLOYMENT_INCOME, fieldKey: 'withholdingTax', amount: '12800.00', description: "Employer Tax Withheld at Source (Retenue d'impôt)" },
  { category: FactCategory.MORTGAGE_INTEREST, fieldKey: 'mortgageInterest', amount: '3500.00', description: 'BCEE Mortgage Debit Interest (Habitation personnelle)' },
  { category: FactCategory.PENSION_SAVINGS_111BIS, fieldKey: 'art111bis', amount: '3200.00', description: 'Foyer Prévoyance-Vieillesse Private Pension Contract' },
  { category: FactCategory.DONATION_DEDUCTION, fieldKey: 'donations', amount: '500.00', description: 'Donation to Croix-Rouge Luxembourgeoise' },
];

type FactFilter = 'ALL' | 'INCOME' | 'DEDUCTIONS' | 'EXCLUDED';

export function FactsView({ workspaceId, onFactsChanged }: FactsViewProps) {
  const [confirmedFacts, setConfirmedFacts] = useState<ConfirmedFactDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addingFact, setAddingFact] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [pendingDeleteFact, setPendingDeleteFact] = useState<ConfirmedFactDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FactFilter>('ALL');
  const [feedback, setFeedback] = useState<ToastMessage | null>(null);

  const [newFact, setNewFact] = useState<NewFactForm>({
    category: FactCategory.EMPLOYMENT_INCOME,
    fieldKey: 'grossSalary',
    amount: '',
    description: '',
    isIncludedInReturn: true,
  });

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback((curr) => (curr?.message === message ? null : curr)), 4500);
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

  const handleToggleInclusion = async (fact: ConfirmedFactDto) => {
    const nextIncluded = !fact.isIncludedInReturn;
    setTogglingId(fact.id);
    const res = await apiClient.updateFact(workspaceId, fact.id, {
      isIncludedInReturn: nextIncluded,
    });
    setTogglingId(null);

    if (res.error) {
      showFeedback('error', res.error);
      return;
    }

    const warning = factInclusionWarning(nextIncluded, res.data?.isIncludedInReturn);
    if (warning) {
      showFeedback('error', warning);
    } else {
      showFeedback(
        'success',
        nextIncluded
          ? `"${fact.fieldKey}" is now included in the return.`
          : `"${fact.fieldKey}" excluded from the return (kept for reference).`,
      );
    }
    await refresh();
    onFactsChanged();
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteFact) return;
    setDeleting(true);
    const res = await apiClient.deleteFact(workspaceId, pendingDeleteFact.id);
    setDeleting(false);
    setPendingDeleteFact(null);

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
      showFeedback('success', `Added ${newFact.fieldKey} of ${formatEuro(num)} to return`);
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

  const filteredFacts = useMemo(() => {
    return confirmedFacts.filter((fact) => {
      if (activeFilter === 'INCOME' && !INCOME_CATEGORIES.has(fact.category)) return false;
      if (activeFilter === 'DEDUCTIONS' && INCOME_CATEGORIES.has(fact.category)) return false;
      if (activeFilter === 'EXCLUDED' && fact.isIncludedInReturn) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hit =
          fact.fieldKey.toLowerCase().includes(q) ||
          fact.category.toLowerCase().includes(q) ||
          (fact.description || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [confirmedFacts, activeFilter, searchQuery]);

  return (
    <div className="space-y-6">
      <ToastBanner feedback={feedback} onDismiss={() => setFeedback(null)} />

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-[#161920] dark:shadow-none">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Total Confirmed Gross Salary
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">
              <Euro className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
          <div className="tabular-nums mt-2 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-zinc-50">
            {formatEuro(totalGrossSalary)}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">Case 101 — Base for Luxembourg PIT</p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-[#161920] dark:shadow-none">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Tax Withheld at Source
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/45 dark:text-amber-300">
              <Landmark className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
          <div className="tabular-nums mt-2 text-2xl font-extrabold tracking-tight text-amber-700 dark:text-amber-400">
            {formatEuro(totalWithholdingTax)}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">Case 105 — Prepaid tax deducted on salary slips</p>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-[#161920] dark:shadow-none">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Confirmed Deductible Expenses
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-300">
              <Receipt className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
          <div className="tabular-nums mt-2 text-2xl font-extrabold tracking-tight text-emerald-700 dark:text-emerald-400">
            {formatEuro(totalDeductions)}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">Mortgage interest, insurance, and donations</p>
        </div>
      </div>

      {/* Action Header & Facts Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs dark:border-zinc-800 dark:bg-[#161920] dark:shadow-none">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-200 px-6 py-4 lg:flex-row lg:items-center dark:border-zinc-800">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-zinc-50">
              <span>Confirmed Tax Facts</span>
              <HelpTip id="confirmedFacts" />
              <span className="tabular-nums rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">
                {confirmedFacts.length}
              </span>
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
              All financial values confirmed here feed the versioned calculation engine and the Form 100 package.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleQuickLoadDemo}
              disabled={loadingDemo || demoAlreadyLoaded}
              title={
                demoAlreadyLoaded
                  ? 'Every demo fact is already recorded in this workspace'
                  : 'Insert the demo facts that are not recorded yet'
              }
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-bold text-zinc-800 transition hover:bg-zinc-50 active:scale-[0.98] disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {demoAlreadyLoaded ? (
                <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              )}
              <span>
                {loadingDemo
                  ? 'Populating...'
                  : demoAlreadyLoaded
                    ? 'Demo Facts Loaded'
                    : 'Quick Load 2025 Demo Facts'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800 active:scale-[0.98] dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Add Fact</span>
            </button>
            <button
              type="button"
              onClick={refresh}
              aria-label="Refresh confirmed facts"
              className="inline-flex h-8.5 w-8.5 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        {confirmedFacts.length > 0 && (
          <div className="flex flex-col justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-6 py-3 sm:flex-row sm:items-center dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'ALL', label: 'All Facts' },
                  { id: 'INCOME', label: 'Income' },
                  { id: 'DEDUCTIONS', label: 'Deductions & Prepayments' },
                  { id: 'EXCLUDED', label: 'Excluded' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFilter(tab.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    activeFilter === tab.id
                      ? 'bg-zinc-950 text-white shadow-xs dark:bg-zinc-100 dark:text-zinc-950'
                      : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
                aria-hidden="true"
              />
              <input
                type="text"
                aria-label="Filter facts"
                placeholder="Search box, category, or note..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white py-1.5 pr-3 pl-8 text-xs text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950/10 sm:w-60 dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400 dark:focus:ring-zinc-400/20"
              />
            </div>
          </div>
        )}

        {loading ? (
          <TableSkeleton rows={5} />
        ) : confirmedFacts.length === 0 ? (
          <EmptyState
            icon={<Euro className="h-5 w-5" aria-hidden="true" />}
            title="No Tax Facts Recorded Yet"
            description="Add your salary, mortgage interest, or insurance contributions manually, or load realistic 2025 demo numbers to explore the calculation engine."
            actions={
              <>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Add Fact Manually</span>
                </button>
                <button
                  type="button"
                  onClick={handleQuickLoadDemo}
                  disabled={loadingDemo}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-800 shadow-2xs transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <Sparkles className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                  <span>{loadingDemo ? 'Populating...' : 'Load 2025 Demo Facts'}</span>
                </button>
              </>
            }
          />
        ) : filteredFacts.length === 0 ? (
          <EmptyState
            icon={<Search className="h-5 w-5" aria-hidden="true" />}
            title="No matching facts"
            description="No confirmed facts match your current search or category filter."
            actions={
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveFilter('ALL');
                }}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Reset filters
              </button>
            }
          />
        ) : (
          <>
            {/* Mobile Card List (< 768px) */}
            <div className="divide-y divide-zinc-100 md:hidden dark:divide-zinc-800">
              {filteredFacts.map((fact) => (
                <div
                  key={fact.id}
                  className={`space-y-3 p-4 ${!fact.isIncludedInReturn ? 'opacity-65' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-zinc-950 dark:text-zinc-100">
                          {fact.fieldKey}
                        </span>
                        <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          {fact.category.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{fact.description || '—'}</p>
                    </div>
                    <div className="tabular-nums shrink-0 text-sm font-extrabold text-zinc-950 dark:text-zinc-50">
                      {formatEuro(fact.amount)}
                    </div>
                  </div>

                  {editingId === fact.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        aria-label={`Edit amount for ${fact.fieldKey}`}
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        className="w-32 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-base font-semibold text-zinc-950 focus:border-zinc-950 focus:outline-none sm:text-xs dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-400"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(fact.id)}
                        className="rounded-xl bg-zinc-950 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => handleToggleInclusion(fact)}
                        disabled={togglingId === fact.id}
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition disabled:opacity-50 ${
                          fact.isIncludedInReturn
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/45 dark:text-emerald-300'
                            : 'border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'
                        }`}
                      >
                        {togglingId === fact.id
                          ? 'Saving…'
                          : fact.isIncludedInReturn
                            ? 'Included: Yes'
                            : 'Included: No'}
                      </button>

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(fact)}
                          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          <Pencil className="h-3 w-3" aria-hidden="true" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteFact(fact)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-800/70 dark:bg-rose-950/45 dark:text-rose-300 dark:hover:bg-rose-950/65"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop / Tablet Table (>= 768px) */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50/90 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                  <tr>
                    <th className="px-6 py-3">
                      Category <HelpTip id="factCategory" />
                    </th>
                    <th className="px-6 py-3">Field / Box</th>
                    <th className="px-6 py-3">Description</th>
                    <th className="px-6 py-3">Amount (EUR)</th>
                    <th className="px-6 py-3">
                      Included <HelpTip id="factInclusion" />
                    </th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filteredFacts.map((fact) => (
                    <tr
                      key={fact.id}
                      className={`transition-colors hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 ${
                        !fact.isIncludedInReturn ? 'opacity-65' : ''
                      }`}
                    >
                      <td className="px-6 py-3.5">
                        <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          {fact.category.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 font-mono text-xs font-bold text-zinc-950 dark:text-zinc-100">
                        {fact.fieldKey}
                      </td>
                      <td className="px-6 py-3.5 text-xs text-zinc-600 max-w-xs truncate dark:text-zinc-400">
                        {fact.description || '—'}
                      </td>
                      <td className="tabular-nums px-6 py-3.5 font-bold text-zinc-950 dark:text-zinc-50">
                        {editingId === fact.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              step="0.01"
                              aria-label={`Edit amount for ${fact.fieldKey}`}
                              value={editAmount}
                              onChange={(e) => setEditAmount(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  void handleSaveEdit(fact.id);
                                } else if (e.key === 'Escape') {
                                  setEditingId(null);
                                }
                              }}
                              className="w-28 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-950 focus:border-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950/15 dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-400 dark:focus:ring-zinc-400/20"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(fact.id)}
                              className="rounded-lg bg-zinc-950 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          formatEuro(fact.amount)
                        )}
                      </td>
                      <td className="px-6 py-3.5">
                        <button
                          type="button"
                          onClick={() => handleToggleInclusion(fact)}
                          disabled={togglingId === fact.id}
                          title={
                            fact.isIncludedInReturn
                              ? 'Click to exclude from return'
                              : 'Click to include in return'
                          }
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition active:scale-[0.97] disabled:opacity-50 ${
                            fact.isIncludedInReturn
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800/70 dark:bg-emerald-950/45 dark:text-emerald-300 dark:hover:bg-emerald-950/65'
                              : 'border-zinc-200 bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                          }`}
                        >
                          {togglingId === fact.id
                            ? 'Saving…'
                            : fact.isIncludedInReturn
                              ? 'Yes'
                              : 'No'}
                        </button>
                      </td>
                      <td className="px-6 py-3.5 text-right whitespace-nowrap">
                        {editingId !== fact.id && (
                          <div className="inline-flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(fact)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 transition hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300"
                            >
                              <Pencil className="h-3 w-3" aria-hidden="true" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDeleteFact(fact)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 transition hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
                            >
                              <Trash2 className="h-3 w-3" aria-hidden="true" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Add Fact Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        titleId="add-fact-modal-title"
        title="Add Confirmed Tax Fact"
        subtitle="Values added here feed the Luxembourg calculation engine and Form 100 mapping."
        icon={<Plus className="h-4.5 w-4.5" aria-hidden="true" />}
        closeLabel="Close add-fact dialog"
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleCreateFact} className="space-y-4">
          <div>
            <label
              htmlFor="fact-preset-select"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400"
            >
              Tax Item Type
            </label>
            <select
              id="fact-preset-select"
              value={`${newFact.category}:::${newFact.fieldKey}`}
              onChange={(e) => {
                const [cat, key] = e.target.value.split(':::');
                setNewFact({
                  ...newFact,
                  category: cat as FactCategory,
                  fieldKey: key,
                });
              }}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm font-medium text-zinc-950 focus:border-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950/10 dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-400 dark:focus:ring-zinc-400/20"
            >
              {PRESET_FIELDS.map((preset) => (
                <option
                  key={`${preset.category}:::${preset.fieldKey}`}
                  value={`${preset.category}:::${preset.fieldKey}`}
                >
                  {preset.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="fact-amount-input"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400"
            >
              Amount in EUR (€)
            </label>
            <input
              id="fact-amount-input"
              type="number"
              step="0.01"
              required
              placeholder="e.g. 75000.00"
              value={newFact.amount}
              onChange={(e) => setNewFact({ ...newFact, amount: e.target.value })}
              className="tabular-nums w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm font-bold text-zinc-950 focus:border-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950/10 dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400 dark:focus:ring-zinc-400/20"
            />
          </div>

          <div>
            <label
              htmlFor="fact-description-input"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400"
            >
              Description / Note <span className="font-normal normal-case text-zinc-400 dark:text-zinc-500">(optional)</span>
            </label>
            <input
              id="fact-description-input"
              type="text"
              placeholder="e.g. Annual certificate from Employer S.A."
              value={newFact.description}
              onChange={(e) => setNewFact({ ...newFact, description: e.target.value })}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-950 focus:border-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950/10 dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400 dark:focus:ring-zinc-400/20"
            />
          </div>

          <div className="flex items-center gap-2.5 rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
            <input
              type="checkbox"
              id="includeCheck"
              checked={newFact.isIncludedInReturn}
              onChange={(e) => setNewFact({ ...newFact, isIncludedInReturn: e.target.checked })}
              className="h-4 w-4 rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <label htmlFor="includeCheck" className="cursor-pointer text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Include in Luxembourg Tax Return calculation
            </label>
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addingFact}
              className="rounded-xl bg-zinc-950 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              {addingFact ? 'Saving Fact...' : 'Save Confirmed Fact'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={pendingDeleteFact !== null}
        title="Remove fact from return?"
        description={
          pendingDeleteFact
            ? `Are you sure you want to remove "${pendingDeleteFact.fieldKey}" (${formatEuro(pendingDeleteFact.amount)}) from your confirmed tax facts?`
            : ''
        }
        confirmLabel="Remove Fact"
        busy={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeleteFact(null)}
      />
    </div>
  );
}
