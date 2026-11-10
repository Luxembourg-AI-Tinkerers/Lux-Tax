'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  // Tabs & filters
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>('ALL');
  const [docTypeFilter, setDocTypeFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Data states
  const [profiles, setProfiles] = useState<FreelanceBusinessProfileDto[]>([]);
  const [metrics, setMetrics] = useState<FreelanceMetricsDto | null>(null);
  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const [extractedFacts, setExtractedFacts] = useState<ExtractedFactDto[]>([]);

  // UI / Modal states
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [editingOwnerId, setEditingOwnerId] = useState<string>('');
  const [confirmingFactId, setConfirmingFactId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Profile Edit form state
  const [profileForm, setProfileForm] = useState<UpdateFreelanceProfileDto>({
    businessName: '',
    activityType: '',
    taxIdOrVat: '',
    accountingType: 'CASH_BASIS',
  });

  // Upload modal form state
  const [uploadTargetOwnerId, setUploadTargetOwnerId] = useState<string>(currentUserId);
  const [uploadDocType, setUploadDocType] = useState<DocumentType>(DocumentType.FREELANCE_INVOICE);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  const primaryFiler = members.find((m) => m.role === HouseholdRole.PRIMARY_FILER);
  const coFiler = members.find((m) => m.role === HouseholdRole.CO_FILER);

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

  // Filter documents to freelance types and selected owner
  const freelanceDocuments = useMemo(() => {
    return documents.filter((doc) => {
      // Must be a freelance doc type or have freelance facts
      const isFreelance = FREELANCE_DOC_TYPES.includes(doc.documentType);
      if (!isFreelance) return false;

      // Filter by owner
      if (selectedOwnerId !== 'ALL' && doc.ownerId !== selectedOwnerId) {
        return false;
      }

      // Filter by doc type
      if (docTypeFilter !== 'ALL' && doc.documentType !== docTypeFilter) {
        return false;
      }

      // Filter by search query
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

  // Unconfirmed freelance facts
  const unconfirmedFreelanceFacts = useMemo(() => {
    const freelanceDocIds = new Set(
      documents
        .filter((d) => FREELANCE_DOC_TYPES.includes(d.documentType))
        .map((d) => d.id)
    );

    return extractedFacts.filter(
      (f) =>
        !f.isConfirmed &&
        f.documentId &&
        freelanceDocIds.has(f.documentId) &&
        (selectedOwnerId === 'ALL' ||
          documents.find((d) => d.id === f.documentId)?.ownerId === selectedOwnerId)
    );
  }, [extractedFacts, documents, selectedOwnerId]);

  // Handle Loading Demo Data
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

  // Handle Editing Profile
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

  // Handle Upload Document
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
          `"${selectedFile.name}" was saved as a private draft, but the upload response had no document id; include it from the document vault.`
        );
        setIsUploadModalOpen(false);
        setSelectedFile(null);
        await refreshData();
        onDataChanged();
        return;
      }

      // Freelance evidence is meant to feed the return, but the document always
      // starts private and is promoted explicitly. A failed promotion keeps it
      // private and says so rather than pretending it was included.
      const patch = await apiClient.updateDocumentVisibility(
        workspaceId,
        res.data.id,
        DocumentVisibility.INCLUDED_IN_RETURN,
      );

      if (patch.error) {
        showFeedback(
          'error',
          `"${selectedFile.name}" is saved as a private draft, but including it in the return failed: ${patch.error}`
        );
      } else {
        showFeedback(
          'success',
          `"${selectedFile.name}" uploaded and attributed to ${targetMember?.user?.email || 'spouse'}!`
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

  // Handle Confirm Extracted Freelance Fact
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

    // A discussion-only document is saved but excluded from the return; do not
    // report the fact as included when the API downgraded it.
    const inclusionWarning = factInclusionWarning(true, res.data?.isIncludedInReturn);
    if (inclusionWarning) {
      showFeedback(
        'error',
        `Confirmed €${fact.fieldValue} as ${isExpense ? 'a business expense' : 'freelance revenue'}. ${inclusionWarning}`,
      );
    } else {
      showFeedback('success', `Confirmed €${fact.fieldValue} into ${isExpense ? 'Business Expenses' : 'Freelance Revenue'}!`);
    }

    await refreshData();
    onDataChanged();
  };

  // Toggle Visibility
  const handleToggleVisibility = async (doc: DocumentDto) => {
    const nextVis =
      doc.visibility === DocumentVisibility.INCLUDED_IN_RETURN
        ? DocumentVisibility.SHARED_FOR_DISCUSSION
        : DocumentVisibility.INCLUDED_IN_RETURN;

    // One click must not silently drop evidence out of the return.
    if (
      removesFromReturn(doc.visibility, nextVis) &&
      !confirm(
        `"${doc.originalName}" is included in the return. Sharing it for discussion only keeps the file but removes its figures from the return. Continue?`,
      )
    ) {
      return;
    }

    const res = await apiClient.updateDocumentVisibility(workspaceId, doc.id, nextVis);
    if (res.error) {
      showFeedback('error', res.error);
    } else {
      showFeedback('success', `Visibility updated to ${nextVis}`);
      await refreshData();
    }
  };

  // Delete Document
  const handleDeleteDocument = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this business document? Associated figures will be unlinked.')) {
      return;
    }
    const res = await apiClient.deleteDocument(workspaceId, docId);
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

      {/* Header Banner */}
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-900 via-slate-900 to-slate-900 p-6 text-white shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-indigo-200 border border-indigo-500/30">
                Luxembourg Articles 14 & 91 LIR
              </span>
              <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[11px] font-bold text-emerald-300 border border-emerald-500/30">
                🤖 AI Vision & Route Routing
              </span>
            </div>
            <h2 className="text-xl font-extrabold tracking-tight">
              Freelance & Business Hub
            </h2>
            <p className="text-xs text-indigo-100/80 mt-1 max-w-2xl">
              Track independent freelance income, client invoices, deductible operating expenses, and VAT returns for each spouse with direct Form 100 tax integration.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleLoadDemo}
              disabled={loading}
              className="rounded-lg border border-indigo-300/40 bg-indigo-800/50 hover:bg-indigo-700/60 px-3.5 py-2 text-xs font-bold text-indigo-100 transition shadow-xs disabled:opacity-50"
            >
              ⚡ Load Freelance Demo Data
            </button>
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="rounded-lg bg-sky-500 hover:bg-sky-400 px-4 py-2 text-xs font-bold text-white shadow-sm transition"
            >
              + Add Freelance Doc
            </button>
          </div>
        </div>

        {/* Spouse Filter Pills */}
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-indigo-800/60 pt-4">
          <span className="text-xs text-indigo-200/70 font-semibold mr-1">Filter by Spouse:</span>
          <button
            onClick={() => setSelectedOwnerId('ALL')}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              selectedOwnerId === 'ALL'
                ? 'bg-white text-indigo-950 shadow-xs'
                : 'bg-indigo-950/60 text-indigo-200 hover:bg-indigo-900/60'
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
                key={member.id}
                onClick={() => setSelectedOwnerId(member.userId)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-sky-400 text-slate-950 shadow-xs'
                    : 'bg-indigo-950/60 text-indigo-200 hover:bg-indigo-900/60'
                }`}
              >
                <span>{member.user?.email || member.userId.substring(0, 8)}</span>
                <span className="text-[10px] opacity-75 font-normal">
                  ({profile?.businessName || role})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Business Profiles Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {members.map((member) => {
          const profile = profiles.find((p) => p.ownerId === member.userId);
          const isSelected = selectedOwnerId === 'ALL' || selectedOwnerId === member.userId;
          if (!isSelected && selectedOwnerId !== 'ALL') return null;

          const roleName = member.role === HouseholdRole.PRIMARY_FILER ? 'Primary Filer' : 'Co-Filer';

          return (
            <div
              key={member.id}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-sky-50 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-700">
                      {roleName}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      {member.user?.email || member.userId.substring(0, 8)}
                    </span>
                  </div>
                  <button
                    onClick={() => handleOpenEditProfile(member.userId)}
                    className="text-xs text-sky-600 hover:text-sky-700 font-bold"
                  >
                    {profile ? '✎ Edit Profile' : '+ Setup Business Profile'}
                  </button>
                </div>

                <h3 className="text-base font-bold text-slate-900">
                  {profile?.businessName || 'Independent Freelance Activity'}
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Activity: <strong className="text-slate-800">{profile?.activityType || 'Not specified'}</strong>
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded bg-slate-50 p-2 border border-slate-100">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Matricule / VAT</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {profile?.taxIdOrVat || 'None (VAT Exempt)'}
                    </span>
                  </div>
                  <div className="rounded bg-slate-50 p-2 border border-slate-100">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Accounting Method</span>
                    <span className="font-semibold text-slate-800">
                      {profile?.accountingType === 'ACCRUAL'
                        ? 'Accrual (Bilan)'
                        : 'Cash-Basis (Recettes-Dépenses)'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span>Form 100 Mapping:</span>
                <span className="font-bold text-slate-700">
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
      {metrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Gross Revenue */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Gross Revenue
            </span>
            <div className="mt-1 text-2xl font-black text-slate-900">
              €{metrics.totalGrossRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {metrics.invoicesCount} freelance invoice(s)
            </span>
          </div>

          {/* Operating Expenses */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Deductible Expenses
            </span>
            <div className="mt-1 text-2xl font-black text-rose-600">
              -€{metrics.totalBusinessExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {metrics.expensesCount} operating expense(s)
            </span>
          </div>

          {/* Net Business Profit */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
              Net Taxable Profit
            </span>
            <div className="mt-1 text-2xl font-black text-emerald-700">
              €{metrics.netBusinessProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-emerald-700/80 mt-1 block font-medium">
              Taxable under Art. 14 / Art. 91
            </span>
          </div>

          {/* VAT Tracking */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Net VAT (TVA) Balance
            </span>
            <div className="mt-1 text-2xl font-black text-indigo-700">
              €{metrics.netVatPayable.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Collected: €{metrics.vatCollected.toFixed(2)} | Deductible: €{metrics.vatDeductible.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Unconfirmed Extracted Freelance Figures Review Box */}
      {unconfirmedFreelanceFacts.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-sm font-bold text-amber-900">
                AI Extracted Freelance Figures Awaiting Confirmation ({unconfirmedFreelanceFacts.length})
              </h4>
              <p className="text-xs text-amber-700 mt-0.5">
                Our vision & extraction engine extracted these figures from your uploaded business documents. Confirm them to flow into your Form 100 tax calculation.
              </p>
            </div>
          </div>

          <div className="divide-y divide-amber-200/60 rounded-lg border border-amber-200 bg-white">
            {unconfirmedFreelanceFacts.map((fact) => {
              const doc = documents.find((d) => d.id === fact.documentId);
              const ownerText = getMemberLabel(doc?.ownerId);

              return (
                <div
                  key={fact.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                        {fact.fieldName}
                      </span>
                      <span className="text-base font-black text-slate-900">
                        €{parseFloat(fact.fieldValue).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                        AI Confidence: {(fact.confidence * 100).toFixed(0)}%
                      </span>
                      <span className="rounded bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                        Attributed: {ownerText}
                      </span>
                    </div>
                    {fact.sourceSnippet && (
                      <span className="text-[11px] text-slate-500 mt-1 block font-mono">
                        Snippet: &quot;{fact.sourceSnippet}&quot;
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => handleConfirmFact(fact)}
                    disabled={confirmingFactId === fact.id}
                    className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 transition disabled:opacity-50"
                  >
                    {confirmingFactId === fact.id ? 'Confirming...' : '✓ Confirm into Return'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Docs Base Repository Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Freelance & Business Docs Base ({freelanceDocuments.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Secure searchable repository of all business invoices, receipts, and VAT filings.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs rounded-lg border border-slate-200 px-3 py-1.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
            />

            {/* Doc Type Selector */}
            <select
              value={docTypeFilter}
              onChange={(e) => setDocTypeFilter(e.target.value)}
              className="text-xs rounded-lg border border-slate-200 px-2.5 py-1.5 bg-white font-medium text-slate-700"
            >
              <option value="ALL">All Document Types</option>
              <option value={DocumentType.FREELANCE_INVOICE}>Freelance Invoices</option>
              <option value={DocumentType.BUSINESS_EXPENSE}>Business Expenses</option>
              <option value={DocumentType.PROFIT_AND_LOSS_STATEMENT}>P&L Statements</option>
              <option value={DocumentType.VAT_RETURN}>VAT Returns</option>
              <option value={DocumentType.FREELANCE_CONTRACT}>Contracts & SOWs</option>
            </select>

            <button
              onClick={refreshData}
              className="text-xs text-sky-600 hover:text-sky-700 font-semibold"
            >
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading business documents...</div>
        ) : freelanceDocuments.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm font-semibold text-slate-700">No Freelance Documents Found</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Upload invoices from your clients or deductible expenses (hardware, software, travel), or click &quot;Load Freelance Demo Data&quot; to test.
            </p>
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-500 transition"
            >
              + Upload First Freelance Document
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">Document</th>
                  <th className="px-6 py-3">Spouse Attribution</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">AI Vision Status</th>
                  <th className="px-6 py-3">Return Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {freelanceDocuments.map((doc) => {
                  const owner = members.find((m) => m.userId === doc.ownerId);
                  const isPrimary = owner?.role === HouseholdRole.PRIMARY_FILER;

                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900">{doc.originalName}</div>
                        <div className="text-[11px] text-slate-400">
                          {new Date(doc.createdAt).toLocaleDateString()}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            isPrimary
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-purple-50 text-purple-700 border border-purple-200'
                          }`}
                        >
                          <span>{isPrimary ? '👤' : '👥'}</span>
                          <span>{doc.ownerEmail || (owner?.user?.email || 'Household')}</span>
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                          {doc.documentType.replace(/_/g, ' ')}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          <span className="text-xs font-medium text-slate-700">Extracted</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            ({(doc as any).metadata?.modelUsed || 'vision-ai'})
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleToggleVisibility(doc)}
                          className={`rounded px-2 py-0.5 text-xs font-semibold transition ${
                            doc.visibility === DocumentVisibility.INCLUDED_IN_RETURN
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                          title="Click to toggle visibility"
                        >
                          {doc.visibility.replace(/_/g, ' ')} ↻
                        </button>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDeleteDocument(doc.id)}
                          className="text-xs text-rose-600 hover:text-rose-700 font-semibold"
                        >
                          Delete
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
      <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-5 text-xs text-sky-950 space-y-2">
        <h4 className="font-bold text-sky-900 flex items-center gap-2">
          <span>ℹ️</span>
          <span>Luxembourg Direct Tax Administration (ACD) Freelance Guidance</span>
        </h4>
        <p className="text-sky-800 leading-relaxed">
          In Luxembourg, net business income from liberal professions (Art. 91 LIR) and commercial operations (Art. 14 LIR) is calculated as gross revenue received minus actual business operating expenses.
          Each spouse is evaluated on their respective activity. If filing jointly under Tax Class 2, the net profits are aggregated into the joint taxable base while preserving spouse-specific deductions and Form 100 line attributions.
        </p>
      </div>

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Add Freelance / Business Document</h3>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadFreelanceDocument} className="space-y-4">
              {/* Target Spouse Selection */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Attributed Spouse / Business Owner
                </label>
                <select
                  value={uploadTargetOwnerId}
                  onChange={(e) => setUploadTargetOwnerId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs font-semibold"
                >
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.user?.email || m.userId.substring(0, 8)} ({m.role === HouseholdRole.PRIMARY_FILER ? 'Primary Filer' : 'Co-Filer'})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Revenues and expenses will be allocated to this spouse&apos;s Form 100 cases.
                </p>
              </div>

              {/* Document Type Selection */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Document Type
                </label>
                <select
                  value={uploadDocType}
                  onChange={(e) => setUploadDocType(e.target.value as DocumentType)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs font-semibold"
                >
                  <option value={DocumentType.FREELANCE_INVOICE}>
                    Freelance Client Invoice (Facture émise)
                  </option>
                  <option value={DocumentType.BUSINESS_EXPENSE}>
                    Business Operating Expense (Frais d&apos;exploitation)
                  </option>
                  <option value={DocumentType.PROFIT_AND_LOSS_STATEMENT}>
                    Profit & Loss Statement (Compte de résultat / Bilan)
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

              {/* File input */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Select File (PDF, PNG, JPG, TXT)
                </label>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.txt"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || !selectedFile}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-500 transition disabled:opacity-50"
                >
                  {uploading ? 'Processing AI Vision...' : 'Upload & Extract'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {isEditProfileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Configure Business Profile</h3>
              <button
                onClick={() => setIsEditProfileOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Business / Trading Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jean Dupont Consulting"
                  value={profileForm.businessName}
                  onChange={(e) => setProfileForm({ ...profileForm, businessName: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Activity Type
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. IT Architecture & Cloud Engineering"
                  value={profileForm.activityType}
                  onChange={(e) => setProfileForm({ ...profileForm, activityType: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Luxembourg Tax ID or VAT Number (TVA)
                </label>
                <input
                  type="text"
                  placeholder="e.g. LU12345678"
                  value={profileForm.taxIdOrVat || ''}
                  onChange={(e) => setProfileForm({ ...profileForm, taxIdOrVat: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs font-semibold font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Accounting Method
                </label>
                <select
                  value={profileForm.accountingType}
                  onChange={(e) =>
                    setProfileForm({
                      ...profileForm,
                      accountingType: e.target.value as 'CASH_BASIS' | 'ACCRUAL',
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs font-semibold"
                >
                  <option value="CASH_BASIS">
                    Cash-Basis / Recettes-Dépenses (Art. 14 / Art. 91 LIR)
                  </option>
                  <option value="ACCRUAL">Accrual Accounting / Bilan Commercial</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Most liberal professionals and independent consultants use cash-basis accounting.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditProfileOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-500 transition"
                >
                  Save Business Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
