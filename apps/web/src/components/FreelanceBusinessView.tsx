'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Briefcase,
  Check,
  Info,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  Sparkles,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { HelpTip } from './HelpTip';
import { apiClient } from '../lib/api';
import {
  DocumentDto,
  DocumentVisibility,
  DocumentType,
  ExtractedFactDto,
  FactCategory,
  HouseholdMemberDto,
  FreelanceBusinessProfileDto,
  FreelanceMetricsDto,
  UpdateFreelanceProfileDto,
  HouseholdRole,
} from '@luxtax/contracts';
import { factInclusionWarning } from '../lib/fact-inclusion';
import { removesFromReturn } from '../lib/document-visibility';
import { formatEuro } from '../lib/money';
import { ToastBanner, type ToastMessage } from './ui/ToastBanner';
import { Modal } from './ui/Modal';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { CardGridSkeleton, TableSkeleton } from './ui/Skeleton';
import { EmptyState } from './ui/EmptyState';
import { StatusBadge } from './ui/StatusBadge';

interface FreelanceBusinessViewProps {
  workspaceId: string;
  members: readonly HouseholdMemberDto[];
  currentUserId: string;
  onDataChanged: () => void;
}

const FREELANCE_DOC_TYPES = [
  DocumentType.FREELANCE_INVOICE,
  DocumentType.BUSINESS_EXPENSE,
  DocumentType.PROFIT_AND_LOSS_STATEMENT,
  DocumentType.VAT_RETURN,
  DocumentType.BUSINESS_TAX_ADVANCE,
  DocumentType.FREELANCE_CONTRACT,
];

export function FreelanceBusinessView({
  workspaceId,
  members,
  currentUserId,
  onDataChanged,
}: FreelanceBusinessViewProps) {
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>('ALL');
  const [docTypeFilter, setDocTypeFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [profiles, setProfiles] = useState<FreelanceBusinessProfileDto[]>([]);
  const [metrics, setMetrics] = useState<FreelanceMetricsDto | null>(null);
  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const [extractedFacts, setExtractedFacts] = useState<ExtractedFactDto[]>([]);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [editingOwnerId, setEditingOwnerId] = useState<string>('');
  const [confirmingFactId, setConfirmingFactId] = useState<string | null>(null);
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState<DocumentDto | null>(null);
  const [pendingVisibilityDoc, setPendingVisibilityDoc] = useState<{
    doc: DocumentDto;
    nextVis: DocumentVisibility;
  } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [feedback, setFeedback] = useState<ToastMessage | null>(null);

  const [profileForm, setProfileForm] = useState<UpdateFreelanceProfileDto>({
    businessName: '',
    activityType: '',
    taxIdOrVat: '',
    accountingType: 'CASH_BASIS',
  });

  const [uploadTargetOwnerId, setUploadTargetOwnerId] = useState<string>(currentUserId);
  const [uploadDocType, setUploadDocType] = useState<DocumentType>(DocumentType.FREELANCE_INVOICE);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback((curr) => (curr?.message === message ? null : curr)), 4500);
  };

  const getMemberLabel = (userId?: string | null) => {
    if (!userId) return 'Household';
    const member = members.find((m) => m.userId === userId);
    if (!member) return userId.substring(0, 8);
    const roleLabel = member.role === HouseholdRole.PRIMARY_FILER ? 'Primary' : 'Co-Filer';
    return `${member.user?.email || member.userId.substring(0, 8)} (${roleLabel})`;
  };

  const refreshData = async () => {
    setLoading(true);
    const ownerQuery = selectedOwnerId !== 'ALL' ? selectedOwnerId : undefined;

    const [profilesRes, metricsRes, docsRes, factsRes] = await Promise.all([
      apiClient.getFreelanceProfiles(workspaceId),
      apiClient.getFreelanceMetrics(workspaceId, ownerQuery),
      apiClient.getDocuments(workspaceId),
      apiClient.getFacts(workspaceId),
    ]);

    if (profilesRes.data) setProfiles(profilesRes.data);
    if (metricsRes.data) setMetrics(metricsRes.data);
    if (docsRes.data) setDocuments(docsRes.data);
    if (factsRes.data) setExtractedFacts(factsRes.data.extractedFacts);

    setLoading(false);
  };

  useEffect(() => {
    refreshData();
  }, [workspaceId, selectedOwnerId]);

  const freelanceDocuments = useMemo(() => {
    return documents.filter((doc) => {
      const isFreelance = FREELANCE_DOC_TYPES.includes(doc.documentType);
      if (!isFreelance) return false;

      if (selectedOwnerId !== 'ALL' && doc.ownerId !== selectedOwnerId) {
        return false;
      }

      if (docTypeFilter !== 'ALL' && doc.documentType !== docTypeFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = doc.originalName.toLowerCase().includes(q);
        const matchesOwner = (doc.ownerEmail || '').toLowerCase().includes(q);
        const matchesType = doc.documentType.toLowerCase().includes(q);
        if (!matchesName && !matchesOwner && !matchesType) return false;
      }

      return true;
    });
  }, [documents, selectedOwnerId, docTypeFilter, searchQuery]);

  const unconfirmedFreelanceFacts = useMemo(() => {
    const freelanceDocIds = new Set(
      documents
        .filter((d) => FREELANCE_DOC_TYPES.includes(d.documentType))
        .map((d) => d.id),
    );

    return extractedFacts.filter(
      (f) =>
        !f.isConfirmed &&
        f.documentId &&
        freelanceDocIds.has(f.documentId) &&
        (selectedOwnerId === 'ALL' ||
          documents.find((d) => d.id === f.documentId)?.ownerId === selectedOwnerId),
    );
  }, [extractedFacts, documents, selectedOwnerId]);

  const handleLoadDemo = async () => {
    setLoading(true);
    const res = await apiClient.loadFreelanceDemo(workspaceId);
    if (res.error) {
      showFeedback('error', res.error);
    } else {
      showFeedback('success', `Generated ${res.data?.count || 4} sample freelance documents & profiles!`);
      await refreshData();
      onDataChanged();
    }
    setLoading(false);
  };

  const handleOpenEditProfile = (ownerId: string) => {
    const existing = profiles.find((p) => p.ownerId === ownerId);
    setEditingOwnerId(ownerId);
    setProfileForm({
      businessName: existing?.businessName || '',
      activityType: existing?.activityType || 'Consulting & Services',
      taxIdOrVat: existing?.taxIdOrVat || '',
      accountingType: existing?.accountingType || 'CASH_BASIS',
    });
    setIsEditProfileOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOwnerId) return;

    const res = await apiClient.updateFreelanceProfile(workspaceId, editingOwnerId, profileForm);
    if (res.error) {
      showFeedback('error', res.error);
    } else {
      showFeedback('success', 'Business profile updated successfully!');
      setIsEditProfileOpen(false);
      await refreshData();
      onDataChanged();
    }
  };

  const handleUploadFreelanceDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      showFeedback('error', 'Please select a file to upload');
      return;
    }

    setUploading(true);
    const targetMember = members.find((m) => m.userId === uploadTargetOwnerId);
    const reader = new FileReader();

    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      const res = await apiClient.uploadDocument(workspaceId, {
        fileName: selectedFile.name,
        fileContentBase64: base64,
        mimeType: selectedFile.type || 'text/plain',
        documentType: uploadDocType,
        ownerId: uploadTargetOwnerId,
      });

      setUploading(false);
      if (res.error) {
        showFeedback('error', res.error);
        return;
      }

      if (!res.data) {
        showFeedback(
          'error',
          `"${selectedFile.name}" was saved as a private draft, but the upload response had no document id; include it from the document vault.`,
        );
        setIsUploadModalOpen(false);
        setSelectedFile(null);
        await refreshData();
        onDataChanged();
        return;
      }

      const patch = await apiClient.updateDocumentVisibility(
        workspaceId,
        res.data.id,
        DocumentVisibility.INCLUDED_IN_RETURN,
      );

      if (patch.error) {
        showFeedback(
          'error',
          `"${selectedFile.name}" is saved as a private draft, but including it in the return failed: ${patch.error}`,
        );
      } else {
        showFeedback(
          'success',
          `"${selectedFile.name}" uploaded and attributed to ${targetMember?.user?.email || 'spouse'}!`,
        );
      }
      setIsUploadModalOpen(false);
      setSelectedFile(null);
      await refreshData();
      onDataChanged();
    };

    reader.onerror = () => {
      setUploading(false);
      showFeedback('error', 'Failed to read file from disk');
    };

    reader.readAsDataURL(selectedFile);
  };

  const handleConfirmFact = async (fact: ExtractedFactDto) => {
    setConfirmingFactId(fact.id);

    const doc = documents.find((d) => d.id === fact.documentId);
    const isExpense =
      doc?.documentType === DocumentType.BUSINESS_EXPENSE ||
      fact.fieldName.toLowerCase().includes('expense') ||
      fact.fieldName.toLowerCase().includes('charge');

    const category = isExpense ? FactCategory.BUSINESS_EXPENSE : FactCategory.FREELANCE_INCOME;

    const res = await apiClient.confirmFact(workspaceId, {
      extractedFactId: fact.id,
      category,
      fieldKey: fact.fieldName,
      amount: fact.fieldValue,
      currency: fact.currency || 'EUR',
      isIncludedInReturn: true,
      isSharedWithHousehold: true,
      description: `${isExpense ? 'Business Operating Expense' : 'Freelance Revenue'} (${fact.fieldName})`,
    });

    setConfirmingFactId(null);
    if (res.error) {
      showFeedback('error', res.error);
      return;
    }

    const inclusionWarning = factInclusionWarning(true, res.data?.isIncludedInReturn);
    if (inclusionWarning) {
      showFeedback(
        'error',
        `Confirmed ${formatEuro(fact.fieldValue)} as ${isExpense ? 'a business expense' : 'freelance revenue'}. ${inclusionWarning}`,
      );
    } else {
      showFeedback('success', `Confirmed ${formatEuro(fact.fieldValue)} into ${isExpense ? 'Business Expenses' : 'Freelance Revenue'}!`);
    }

    await refreshData();
    onDataChanged();
  };

  const applyVisibilityChange = async (doc: DocumentDto, nextVis: DocumentVisibility) => {
    setActionBusy(true);
    const res = await apiClient.updateDocumentVisibility(workspaceId, doc.id, nextVis);
    setActionBusy(false);
    setPendingVisibilityDoc(null);

    if (res.error) {
      showFeedback('error', res.error);
    } else {
      showFeedback('success', `Visibility updated to ${nextVis.replace(/_/g, ' ')}`);
      await refreshData();
    }
  };

  const handleToggleVisibility = (doc: DocumentDto) => {
    const nextVis =
      doc.visibility === DocumentVisibility.INCLUDED_IN_RETURN
        ? DocumentVisibility.SHARED_FOR_DISCUSSION
        : DocumentVisibility.INCLUDED_IN_RETURN;

    if (removesFromReturn(doc.visibility, nextVis)) {
      setPendingVisibilityDoc({ doc, nextVis });
      return;
    }

    void applyVisibilityChange(doc, nextVis);
  };

  const handleConfirmDeleteDocument = async () => {
    if (!pendingDeleteDoc) return;
    setActionBusy(true);
    const res = await apiClient.deleteDocument(workspaceId, pendingDeleteDoc.id);
    setActionBusy(false);
    setPendingDeleteDoc(null);

    if (res.error) {
      showFeedback('error', res.error);
    } else {
      showFeedback('success', 'Document deleted successfully');
      await refreshData();
      onDataChanged();
    }
  };

  return (
    <div className="space-y-6">
      <ToastBanner feedback={feedback} onDismiss={() => setFeedback(null)} />

      {/* Header Banner (Unified Light Bento Card) */}
      <div className="rounded-2xl border border-zinc-200/85 bg-white p-5 shadow-[0_1px_2px_rgba(9,9,11,0.03)] sm:p-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <StatusBadge tone="neutral">Luxembourg Articles 14 &amp; 91 LIR</StatusBadge>
              <StatusBadge tone="info">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                <span>Extraction &amp; Form 100 Routing</span>
              </StatusBadge>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-zinc-950">
              Freelance &amp; Business Hub
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-500">
              Track independent freelance income, client invoices, deductible operating expenses, and VAT returns per spouse with direct Form 100 mapping.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleLoadDemo}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/90 bg-white px-3.5 py-2.5 text-xs font-semibold text-zinc-800 shadow-2xs transition hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.98] disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5 text-sky-600" aria-hidden="true" />
              <span>Load Freelance Demo Data</span>
            </button>
            <button
              type="button"
              onClick={() => setIsUploadModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800 active:scale-[0.98]"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Add Freelance Doc</span>
            </button>
          </div>
        </div>

        {/* Spouse Filter Pills */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
          <span className="mr-1 text-xs font-semibold text-zinc-500">Filter by Spouse:</span>
          <button
            type="button"
            onClick={() => setSelectedOwnerId('ALL')}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              selectedOwnerId === 'ALL'
                ? 'bg-zinc-950 text-white shadow-xs'
                : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
            }`}
          >
            All Household Business
          </button>

          {members.map((member) => {
            const isSelected = selectedOwnerId === member.userId;
            const role = member.role === HouseholdRole.PRIMARY_FILER ? 'Primary Filer' : 'Co-Filer';
            const profile = profiles.find((p) => p.ownerId === member.userId);

            return (
              <button
                type="button"
                key={member.id}
                onClick={() => setSelectedOwnerId(member.userId)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                  isSelected
                    ? 'bg-zinc-950 text-white shadow-xs'
                    : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                <span>{member.user?.email || member.userId.substring(0, 8)}</span>
                <span className="text-[10px] font-normal opacity-75">
                  ({profile?.businessName || role})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Business Profiles Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {members.map((member) => {
          const profile = profiles.find((p) => p.ownerId === member.userId);
          const isSelected = selectedOwnerId === 'ALL' || selectedOwnerId === member.userId;
          if (!isSelected && selectedOwnerId !== 'ALL') return null;

          const roleName = member.role === HouseholdRole.PRIMARY_FILER ? 'Primary Filer' : 'Co-Filer';

          return (
            <div
              key={member.id}
              className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs"
            >
              <div>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusBadge tone="info">{roleName}</StatusBadge>
                    <span className="truncate text-xs font-semibold text-slate-500">
                      {member.user?.email || member.userId.substring(0, 8)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenEditProfile(member.userId)}
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-sky-700 transition hover:text-sky-800"
                  >
                    {profile ? (
                      <>
                        <Pencil className="h-3 w-3" aria-hidden="true" />
                        <span>Edit Profile</span>
                      </>
                    ) : (
                      <>
                        <Plus className="h-3 w-3" aria-hidden="true" />
                        <span>Setup Business Profile</span>
                      </>
                    )}
                  </button>
                </div>

                <h3 className="text-base font-bold text-slate-900">
                  {profile?.businessName || 'Independent Freelance Activity'}
                </h3>
                <p className="mt-0.5 text-xs text-slate-600">
                  Activity: <strong className="text-slate-800">{profile?.activityType || 'Not specified'}</strong>
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2.5 text-xs">
                  <div className="rounded-xl border border-slate-200/70 bg-slate-50 p-2.5">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Matricule / VAT
                    </span>
                    <span className="mt-0.5 block font-mono font-semibold text-slate-800">
                      {profile?.taxIdOrVat || 'None (VAT Exempt)'}
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-200/70 bg-slate-50 p-2.5">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Accounting Method
                    </span>
                    <span className="mt-0.5 block font-semibold text-slate-800">
                      {profile?.accountingType === 'ACCRUAL'
                        ? 'Accrual (Bilan)'
                        : 'Cash-Basis (Recettes-Dépenses)'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                <span>Form 100 Mapping</span>
                <span className="font-mono font-bold text-slate-700">
                  {member.role === HouseholdRole.PRIMARY_FILER
                    ? 'Case 21 / Case 23'
                    : 'Case 22 / Case 24'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* KPI Metrics Cards */}
      {loading && !metrics ? (
        <CardGridSkeleton count={3} />
      ) : (
        metrics && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Gross Revenue
              </span>
              <div className="tabular-nums mt-1.5 text-2xl font-extrabold text-slate-900">
                {formatEuro(metrics.totalGrossRevenue)}
              </div>
              <span className="tabular-nums mt-1 block text-[11px] text-slate-500">
                {metrics.invoicesCount} freelance invoice(s)
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Deductible Expenses
              </span>
              <div className="tabular-nums mt-1.5 text-2xl font-extrabold text-rose-600">
                −{formatEuro(metrics.totalBusinessExpenses)}
              </div>
              <span className="tabular-nums mt-1 block text-[11px] text-slate-500">
                {metrics.expensesCount} operating expense(s)
              </span>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                Net Taxable Profit <HelpTip id="netProfit" />
              </span>
              <div className="tabular-nums mt-1.5 text-2xl font-extrabold text-emerald-700">
                {formatEuro(metrics.netBusinessProfit)}
              </div>
              <span className="mt-1 block text-[11px] font-medium text-emerald-800">
                Taxable under Art. 14 / Art. 91 <HelpTip id="freelanceNature" />
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Net VAT (TVA) Balance <HelpTip id="vatCollected" />
              </span>
              <div className="tabular-nums mt-1.5 text-2xl font-extrabold text-indigo-700">
                {formatEuro(metrics.netVatPayable)}
              </div>
              <span className="tabular-nums mt-1 block text-[11px] text-slate-500">
                Collected: €{metrics.vatCollected.toFixed(2)} | Deductible: €{metrics.vatDeductible.toFixed(2)}
              </span>
            </div>
          </div>
        )
      )}

      {/* Unconfirmed Extracted Freelance Figures */}
      {unconfirmedFreelanceFacts.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 shadow-xs">
          <div className="mb-3">
            <h4 className="text-sm font-bold text-amber-950">
              Extracted Freelance Figures Awaiting Confirmation ({unconfirmedFreelanceFacts.length})
            </h4>
            <p className="mt-0.5 text-xs text-amber-800">
              Confirm extracted figures to flow them into your Form 100 tax calculation.
            </p>
          </div>

          <div className="divide-y divide-amber-200/70 overflow-hidden rounded-xl border border-amber-200 bg-white">
            {unconfirmedFreelanceFacts.map((fact) => {
              const doc = documents.find((d) => d.id === fact.documentId);
              const ownerText = getMemberLabel(doc?.ownerId);

              return (
                <div
                  key={fact.id}
                  className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-900">
                        {fact.fieldName}
                      </span>
                      <span className="tabular-nums text-base font-extrabold text-slate-900">
                        {formatEuro(fact.fieldValue)}
                      </span>
                      <StatusBadge tone="indigo">
                        <span className="tabular-nums">
                          Confidence: {(fact.confidence * 100).toFixed(0)}%
                        </span>
                      </StatusBadge>
                      <StatusBadge tone="info">Attributed: {ownerText}</StatusBadge>
                    </div>
                    {fact.sourceSnippet && (
                      <span className="mt-1.5 block font-mono text-[11px] text-slate-500">
                        Snippet: &quot;{fact.sourceSnippet}&quot;
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleConfirmFact(fact)}
                    disabled={confirmingFactId === fact.id}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-zinc-950 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                    <span>{confirmingFactId === fact.id ? 'Confirming...' : 'Confirm into Return'}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Docs Base Repository Table */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200/85 bg-white shadow-[0_1px_2px_rgba(9,9,11,0.03)]">
        <div className="flex flex-col justify-between gap-4 border-b border-zinc-200 px-6 py-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-sm font-bold text-zinc-950">
              Freelance &amp; Business Docs Base ({freelanceDocuments.length})
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Searchable repository of business invoices, receipts, and VAT filings.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
                aria-hidden="true"
              />
              <input
                type="text"
                aria-label="Search freelance documents"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-xl border border-zinc-200 bg-white py-1.5 pr-3 pl-8 text-xs text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950/10"
              />
            </div>

            <select
              aria-label="Filter by document type"
              value={docTypeFilter}
              onChange={(e) => setDocTypeFilter(e.target.value)}
              className="rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 focus:border-zinc-950 focus:outline-none"
            >
              <option value="ALL">All Document Types</option>
              <option value={DocumentType.FREELANCE_INVOICE}>Freelance Invoices</option>
              <option value={DocumentType.BUSINESS_EXPENSE}>Business Expenses</option>
              <option value={DocumentType.PROFIT_AND_LOSS_STATEMENT}>P&amp;L Statements</option>
              <option value={DocumentType.VAT_RETURN}>VAT Returns</option>
              <option value={DocumentType.FREELANCE_CONTRACT}>Contracts &amp; SOWs</option>
            </select>

            <button
              type="button"
              onClick={refreshData}
              className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={4} />
        ) : freelanceDocuments.length === 0 ? (
          <EmptyState
            icon={<Briefcase className="h-5 w-5" aria-hidden="true" />}
            title="No Freelance Documents Found"
            description="Upload invoices from your clients or deductible expenses (hardware, software, travel), or load the freelance demo data."
            actions={
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Upload First Freelance Document</span>
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-3">Document</th>
                  <th className="px-6 py-3">Spouse Attribution</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Extraction Status</th>
                  <th className="px-6 py-3">Return Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {freelanceDocuments.map((doc) => {
                  const owner = members.find((m) => m.userId === doc.ownerId);
                  const isPrimary = owner?.role === HouseholdRole.PRIMARY_FILER;

                  return (
                    <tr key={doc.id} className="transition-colors hover:bg-slate-50/70">
                      <td className="px-6 py-3.5">
                        <div className="font-semibold text-slate-900">{doc.originalName}</div>
                        <div className="tabular-nums text-[11px] text-slate-400">
                          {new Date(doc.createdAt).toLocaleDateString()}
                        </div>
                      </td>

                      <td className="px-6 py-3.5">
                        <StatusBadge tone={isPrimary ? 'info' : 'indigo'}>
                          {isPrimary ? (
                            <User className="h-3 w-3" aria-hidden="true" />
                          ) : (
                            <Users className="h-3 w-3" aria-hidden="true" />
                          )}
                          <span>{doc.ownerEmail || (owner?.user?.email || 'Household')}</span>
                        </StatusBadge>
                      </td>

                      <td className="px-6 py-3.5">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                          {doc.documentType.replace(/_/g, ' ')}
                        </span>
                      </td>

                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                          <span className="text-xs font-medium text-slate-700">Extracted</span>
                          <span className="font-mono text-[10px] text-slate-400">
                            ({(doc as any).metadata?.modelUsed || 'vision-ai'})
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-3.5">
                        <button
                          type="button"
                          onClick={() => handleToggleVisibility(doc)}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition active:scale-[0.97] ${
                            doc.visibility === DocumentVisibility.INCLUDED_IN_RETURN
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                              : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                          title="Click to toggle visibility"
                        >
                          <span>{doc.visibility.replace(/_/g, ' ')}</span>
                          <RotateCw className="h-3 w-3 opacity-70" aria-hidden="true" />
                        </button>
                      </td>

                      <td className="px-6 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => setPendingDeleteDoc(doc)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 transition hover:text-rose-700"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                          <span>Delete</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Luxembourg Tax Guidance Box */}
      <div className="space-y-1.5 rounded-2xl border border-sky-200/80 bg-sky-50/60 p-5 text-xs text-sky-950">
        <h4 className="flex items-center gap-2 font-bold text-sky-900">
          <Info className="h-4 w-4 text-sky-700" aria-hidden="true" />
          <span>Luxembourg Direct Tax Administration (ACD) Freelance Guidance</span>
        </h4>
        <p className="leading-relaxed text-sky-900/90 text-pretty">
          In Luxembourg, net business income from liberal professions (Art. 91 LIR) and commercial operations (Art. 14 LIR) is calculated as gross revenue received minus actual business operating expenses.
          Each spouse is evaluated on their respective activity. If filing jointly under Tax Class 2, the net profits are aggregated into the joint taxable base while preserving spouse-specific deductions and Form 100 line attributions.
        </p>
      </div>

      {/* Upload Modal */}
      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        titleId="freelance-upload-title"
        title="Add Freelance / Business Document"
        subtitle="Attribute invoices or business expenses to a spouse for Form 100 mapping."
        icon={<Plus className="h-4.5 w-4.5" aria-hidden="true" />}
        closeLabel="Close upload dialog"
      >
        <form onSubmit={handleUploadFreelanceDocument} className="space-y-4">
          <div>
            <label
              htmlFor="freelance-upload-owner"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600"
            >
              Attributed Spouse / Business Owner
            </label>
            <select
              id="freelance-upload-owner"
              value={uploadTargetOwnerId}
              onChange={(e) => setUploadTargetOwnerId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-900 focus:border-sky-600 focus:outline-none"
            >
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.user?.email || m.userId.substring(0, 8)} (
                  {m.role === HouseholdRole.PRIMARY_FILER ? 'Primary Filer' : 'Co-Filer'})
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-500">
              Revenues and expenses will be allocated to this spouse&apos;s Form 100 cases.
            </p>
          </div>

          <div>
            <label
              htmlFor="freelance-upload-doctype"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600"
            >
              Document Type
            </label>
            <select
              id="freelance-upload-doctype"
              value={uploadDocType}
              onChange={(e) => setUploadDocType(e.target.value as DocumentType)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-900 focus:border-sky-600 focus:outline-none"
            >
              <option value={DocumentType.FREELANCE_INVOICE}>
                Freelance Client Invoice (Facture émise)
              </option>
              <option value={DocumentType.BUSINESS_EXPENSE}>
                Business Operating Expense (Frais d&apos;exploitation)
              </option>
              <option value={DocumentType.PROFIT_AND_LOSS_STATEMENT}>
                Profit &amp; Loss Statement (Compte de résultat / Bilan)
              </option>
              <option value={DocumentType.VAT_RETURN}>
                VAT Return (Déclaration TVA ACD/AED)
              </option>
              <option value={DocumentType.BUSINESS_TAX_ADVANCE}>
                Business Tax Advance (Avances d&apos;impôt)
              </option>
              <option value={DocumentType.FREELANCE_CONTRACT}>
                Client Contract / SOW
              </option>
            </select>
          </div>

          <div>
            <label
              htmlFor="freelance-upload-file"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600"
            >
              Select File (PDF, PNG, JPG, TXT)
            </label>
            <input
              id="freelance-upload-file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.txt"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="w-full text-xs text-zinc-600 file:mr-3 file:rounded-xl file:border file:border-zinc-200 file:bg-zinc-50 file:px-4 file:py-2 file:text-xs file:font-bold file:text-zinc-800 hover:file:bg-zinc-100"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t border-zinc-100 pt-4">
            <button
              type="button"
              onClick={() => setIsUploadModalOpen(false)}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || !selectedFile}
              className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800 disabled:opacity-50"
            >
              {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              <span>{uploading ? 'Processing & Extracting...' : 'Upload & Extract'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal
        isOpen={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
        titleId="freelance-profile-title"
        title="Configure Business Profile"
        subtitle="Set trading name, activity description, VAT status, and accounting method."
        icon={<Briefcase className="h-4.5 w-4.5" aria-hidden="true" />}
        closeLabel="Close profile dialog"
      >
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label
              htmlFor="profile-business-name"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-600"
            >
              Business / Trading Name
            </label>
            <input
              id="profile-business-name"
              type="text"
              required
              placeholder="e.g. Jean Dupont Consulting"
              value={profileForm.businessName}
              onChange={(e) => setProfileForm({ ...profileForm, businessName: e.target.value })}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-base font-medium text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950/10 sm:py-2 sm:text-xs"
            />
          </div>

          <div>
            <label
              htmlFor="profile-activity-type"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-600"
            >
              Activity Type
            </label>
            <input
              id="profile-activity-type"
              type="text"
              required
              placeholder="e.g. IT Architecture & Cloud Engineering"
              value={profileForm.activityType}
              onChange={(e) => setProfileForm({ ...profileForm, activityType: e.target.value })}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-base font-medium text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950/10 sm:py-2 sm:text-xs"
            />
          </div>

          <div>
            <label
              htmlFor="profile-vat"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-600"
            >
              Luxembourg Tax ID or VAT Number (TVA)
            </label>
            <input
              id="profile-vat"
              type="text"
              placeholder="e.g. LU12345678"
              value={profileForm.taxIdOrVat || ''}
              onChange={(e) => setProfileForm({ ...profileForm, taxIdOrVat: e.target.value })}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 font-mono text-base font-medium text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950/10 sm:py-2 sm:text-xs"
            />
          </div>

          <div>
            <label
              htmlFor="profile-accounting"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-600"
            >
              Accounting Method
            </label>
            <select
              id="profile-accounting"
              value={profileForm.accountingType}
              onChange={(e) =>
                setProfileForm({
                  ...profileForm,
                  accountingType: e.target.value as 'CASH_BASIS' | 'ACCRUAL',
                })
              }
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-base font-medium text-zinc-950 focus:border-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950/10 sm:py-2 sm:text-xs"
            >
              <option value="CASH_BASIS">
                Cash-Basis / Recettes-Dépenses (Art. 14 / Art. 91 LIR)
              </option>
              <option value="ACCRUAL">Accrual Accounting / Bilan Commercial</option>
            </select>
            <p className="mt-1 text-[11px] text-zinc-500">
              Most liberal professionals and independent consultants use cash-basis accounting.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t border-zinc-100 pt-4">
            <button
              type="button"
              onClick={() => setIsEditProfileOpen(false)}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-zinc-950 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800"
            >
              Save Business Profile
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Delete Document */}
      <ConfirmDialog
        isOpen={pendingDeleteDoc !== null}
        title="Delete business document?"
        description={
          pendingDeleteDoc
            ? `Are you sure you want to delete "${pendingDeleteDoc.originalName}"? Associated extracted figures will be unlinked.`
            : ''
        }
        confirmLabel="Delete Document"
        busy={actionBusy}
        onConfirm={handleConfirmDeleteDocument}
        onCancel={() => setPendingDeleteDoc(null)}
      />

      {/* Confirm Removing Document from Return */}
      <ConfirmDialog
        isOpen={pendingVisibilityDoc !== null}
        title="Remove document from return?"
        description={
          pendingVisibilityDoc
            ? `"${pendingVisibilityDoc.doc.originalName}" is included in the return. Sharing it for discussion only keeps the file in the vault but removes its figures from the return. Continue?`
            : ''
        }
        confirmLabel="Remove from Return"
        variant="primary"
        busy={actionBusy}
        onConfirm={() => {
          if (pendingVisibilityDoc) {
            void applyVisibilityChange(pendingVisibilityDoc.doc, pendingVisibilityDoc.nextVis);
          }
        }}
        onCancel={() => setPendingVisibilityDoc(null)}
      />
    </div>
  );
}
