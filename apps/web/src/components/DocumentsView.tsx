'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Camera,
  Check,
  CheckCheck,
  FileText,
  Loader2,
  RefreshCw,
  RotateCw,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
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
} from '@luxtax/contracts';
import { CameraScanModal } from './CameraScanModal';
import { factInclusionWarning } from '../lib/fact-inclusion';
import { nextDocumentVisibility, removesFromReturn } from '../lib/document-visibility';
import { formatEuro } from '../lib/money';
import { ToastBanner, type ToastMessage } from './ui/ToastBanner';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { TableSkeleton } from './ui/Skeleton';
import { EmptyState } from './ui/EmptyState';
import { StatusBadge } from './ui/StatusBadge';

interface DocumentsViewProps {
  workspaceId: string;
  members?: readonly HouseholdMemberDto[];
  onFactsChanged: () => void;
}

export function DocumentsView({ workspaceId, members = [], onFactsChanged }: DocumentsViewProps) {
  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const [extractedFacts, setExtractedFacts] = useState<ExtractedFactDto[]>([]);
  const [selectedOwnerFilter, setSelectedOwnerFilter] = useState<string>('ALL');
  const [visibilityFilter, setVisibilityFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadOwnerId, setUploadOwnerId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [reextractingId, setReextractingId] = useState<string | null>(null);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState<DocumentDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<ToastMessage | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback((curr) => (curr?.message === message ? null : curr)), 4500);
  };

  // Documents are always uploaded as private drafts. The state the user asked
  // for is applied through a second, audited call so a failed promotion is
  // reported instead of the document silently staying private (or, worse, being
  // uploaded straight into the return).
  const UPLOAD_VISIBILITY = DocumentVisibility.SHARED_FOR_DISCUSSION;

  const applyVisibilityAfterUpload = async (
    documentId: string,
    visibility: DocumentVisibility,
  ): Promise<string | null> => {
    if (visibility === DocumentVisibility.PRIVATE_DRAFT) return null;
    const patch = await apiClient.updateDocumentVisibility(workspaceId, documentId, visibility);
    return patch.error ?? null;
  };

  // The owner selector lists household members only; anything else is ignored
  // (the API also rejects a non-member owner).
  const resolvedUploadOwnerId = members.some((m) => m.userId === uploadOwnerId)
    ? uploadOwnerId
    : undefined;

  const refresh = async () => {
    setLoading(true);
    const [docsRes, factsRes] = await Promise.all([
      apiClient.getDocuments(workspaceId),
      apiClient.getFacts(workspaceId),
    ]);

    if (docsRes.data) setDocuments(docsRes.data);
    if (factsRes.data) setExtractedFacts(factsRes.data.extractedFacts);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, [workspaceId]);

  const processSelectedFile = (file: File) => {
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      const res = await apiClient.uploadDocument(workspaceId, {
        fileName: file.name,
        fileContentBase64: base64,
        mimeType: file.type || 'text/plain',
        ownerId: resolvedUploadOwnerId,
      });

      if (res.error) {
        showFeedback('error', res.error);
      } else if (!res.data) {
        showFeedback(
          'error',
          `Document "${file.name}" was saved as a private draft, but the upload response had no document id; share it from the vault.`,
        );
      } else {
        const patchError = await applyVisibilityAfterUpload(res.data.id, UPLOAD_VISIBILITY);
        if (patchError) {
          showFeedback(
            'error',
            `Document "${file.name}" is saved as a private draft, but sharing it failed: ${patchError}`,
          );
        } else {
          showFeedback('success', `Document "${file.name}" uploaded & parsed successfully!`);
        }
        await refresh();
        onFactsChanged();
      }
      setUploading(false);
    };

    reader.onerror = () => {
      showFeedback('error', 'Failed to read file from disk');
      setUploading(false);
    };

    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    processSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) processSelectedFile(file);
  };

  const handleUploadSampleSalarySlip = async () => {
    setUploading(true);
    const sampleSlip = `ADMINISTRATION DES CONTRIBUTIONS DIRECTES (ACD)
CERTIFICAT DE REMUNERATION - ANNEE D'IMPOSITION 2025
Employeur: Luxembourg Financial Services S.A.
Matricule ACD: 20198877661
Salarie: Resident Taxpayer (Matricule: 1985010199999)

101. Remuneration brute (traitements, salaires): 76800.00 EUR
103. Cotisations de securite sociale deductibles: 9600.00 EUR
105. Retenue d'impot sur traitements et salaires: 13950.00 EUR
141. Interets debiteurs habitation: 2800.00 EUR
`;

    const base64 = Buffer.from(sampleSlip, 'utf-8').toString('base64');
    const res = await apiClient.uploadDocument(workspaceId, {
      fileName: 'Certificat_Remuneration_2025_Sample.txt',
      fileContentBase64: base64,
      mimeType: 'text/plain',
      ownerId: resolvedUploadOwnerId,
    });

    setUploading(false);
    if (res.error) {
      showFeedback('error', res.error);
    } else if (!res.data) {
      showFeedback(
        'error',
        'The sample salary certificate was saved as a private draft, but the upload response had no document id; share it from the vault.',
      );
    } else {
      const patchError = await applyVisibilityAfterUpload(res.data.id, UPLOAD_VISIBILITY);
      if (patchError) {
        showFeedback(
          'error',
          `The sample salary certificate is saved as a private draft, but sharing it failed: ${patchError}`,
        );
      } else {
        showFeedback('success', 'Uploaded & extracted sample 2025 Salary Certificate!');
      }
      await refresh();
      onFactsChanged();
    }
  };

  const handleToggleVisibility = async (doc: DocumentDto) => {
    const nextVis = nextDocumentVisibility(doc.visibility);

    // Taking a document out of the return changes what gets filed, so it is a
    // confirmed action rather than one click of a cycle. Declining leaves the
    // document exactly as it was.
    if (
      removesFromReturn(doc.visibility, nextVis) &&
      !confirm(
        `"${doc.originalName}" is included in the return. Changing it to ${nextVis.replace(/_/g, ' ')} keeps the file in the vault but removes its figures from the return. Continue?`,
      )
    ) {
      return;
    }

    const res = await apiClient.updateDocumentVisibility(workspaceId, doc.id, nextVis);
    if (res.error) {
      showFeedback('error', res.error);
    } else {
      showFeedback('success', `Document visibility changed to ${nextVis.replace(/_/g, ' ')}`);
      await refresh();
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteDoc) return;
    setDeleting(true);
    const res = await apiClient.deleteDocument(workspaceId, pendingDeleteDoc.id);
    setDeleting(false);
    setPendingDeleteDoc(null);

    if (res.error) {
      showFeedback('error', res.error);
    } else {
      showFeedback('success', 'Document deleted successfully');
      await refresh();
      onFactsChanged();
    }
  };

  const handleConfirmExtractedFact = async (fact: ExtractedFactDto) => {
    setConfirmingId(fact.id);
    let category = FactCategory.OTHER_DEDUCTION;
    const nameLower = fact.fieldName.toLowerCase();
    const doc = documents.find((d) => d.id === fact.documentId);

    if (
      doc?.documentType === DocumentType.FREELANCE_INVOICE ||
      nameLower.includes('freelance') ||
      nameLower.includes('client_revenue')
    ) {
      category = FactCategory.FREELANCE_INCOME;
    } else if (
      doc?.documentType === DocumentType.BUSINESS_EXPENSE ||
      nameLower.includes('business_expense') ||
      nameLower.includes('operating_expense')
    ) {
      category = FactCategory.BUSINESS_EXPENSE;
    } else if (nameLower.includes('childcare') || nameLower.includes('creche')) {
      category = FactCategory.CHILDCARE_EXPENSE;
    } else if (nameLower.includes('donation')) {
      category = FactCategory.DONATION_DEDUCTION;
    } else if (nameLower.includes('gross') || nameLower.includes('salary') || nameLower.includes('remuneration')) {
      category = FactCategory.EMPLOYMENT_INCOME;
    } else if (nameLower.includes('mortgage') || nameLower === 'code_141') {
      category = FactCategory.MORTGAGE_DEDUCTION;
    } else if (nameLower.includes('insurance') || nameLower.includes('pension')) {
      category = FactCategory.INSURANCE_DEDUCTION;
    } else if (
      nameLower.includes('work') ||
      nameLower.includes('training') ||
      nameLower.includes('course') ||
      nameLower.includes('medical') ||
      nameLower.includes('domestic') ||
      nameLower.includes('invoice')
    ) {
      category = FactCategory.OTHER_DEDUCTION;
    }

    const res = await apiClient.confirmFact(workspaceId, {
      extractedFactId: fact.id,
      category,
      fieldKey: fact.fieldName,
      amount: fact.fieldValue,
      currency: fact.currency,
      isIncludedInReturn: true,
      isSharedWithHousehold: true,
    });

    setConfirmingId(null);
    if (res.error) {
      showFeedback('error', res.error);
      return;
    }

    // A shared-for-discussion document is saved but excluded from the return.
    // Never report that as included.
    const inclusionWarning = factInclusionWarning(true, res.data?.isIncludedInReturn);
    if (inclusionWarning) {
      showFeedback('error', `Confirmed ${formatEuro(fact.fieldValue)} (${fact.fieldName}). ${inclusionWarning}`);
    } else {
      showFeedback('success', `Confirmed ${formatEuro(fact.fieldValue)} (${fact.fieldName}) into return facts!`);
    }

    await refresh();
    onFactsChanged();
  };

  /**
   * Confirms every pending figure of the workspace in one call.
   *
   * The figures are ordered by confidence so the panel reads the same way the
   * batch is applied, and the result reports what was skipped instead of
   * claiming an all-or-nothing success.
   */
  const handleConfirmAll = async () => {
    const pending = [...unconfirmedFacts].sort((a, b) => b.confidence - a.confidence);
    if (pending.length === 0) return;

    setBulkConfirming(true);
    const res = await apiClient.confirmFactsBulk(workspaceId, {
      extractedFactIds: pending.map((fact) => fact.id),
    });
    setBulkConfirming(false);

    if (res.error) {
      showFeedback('error', res.error);
      return;
    }

    const confirmed = res.data?.confirmed.length ?? 0;
    const skipped = res.data?.skipped ?? [];
    if (skipped.length > 0) {
      showFeedback(
        'error',
        `Confirmed ${confirmed} figure(s); ${skipped.length} could not be confirmed (${skipped[0].reason})`,
      );
    } else {
      showFeedback('success', `Confirmed ${confirmed} figure(s) into the return.`);
    }

    await refresh();
    onFactsChanged();
  };

  /**
   * Reads a stored document again. Used when an OCR model was activated after
   * the upload, or when the first read found nothing.
   */
  const handleReextract = async (docId: string) => {
    setReextractingId(docId);
    const res = await apiClient.reextractDocument(workspaceId, docId);
    setReextractingId(null);

    if (res.error) {
      showFeedback('error', res.error);
      return;
    }

    if (res.data?.ocrRequired) {
      showFeedback('error', 'This file still has no readable text. Configure an OCR model or enter the figures by hand.');
    } else if ((res.data?.extractedFactsCount ?? 0) === 0) {
      // Confirmed figures are kept on purpose, so "nothing new" is a success.
      showFeedback('success', 'Re-read the document. No new figures — the ones you already confirmed are kept.');
    } else {
      showFeedback('success', `Re-read the document: ${res.data?.extractedFactsCount} figure(s) found.`);
    }

    await refresh();
    onFactsChanged();
  };

  const unconfirmedFacts = extractedFacts
    .filter((f) => !f.isConfirmed)
    .sort((a, b) => b.confidence - a.confidence);

  const filteredDocuments = useMemo(() => {
    return documents.filter((d) => {
      if (selectedOwnerFilter !== 'ALL' && d.ownerId !== selectedOwnerFilter) return false;
      if (visibilityFilter !== 'ALL' && d.visibility !== visibilityFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = d.originalName.toLowerCase().includes(q);
        const matchesType = d.documentType.toLowerCase().includes(q);
        const matchesOwner = (d.ownerEmail || '').toLowerCase().includes(q);
        if (!matchesName && !matchesType && !matchesOwner) return false;
      }
      return true;
    });
  }, [documents, selectedOwnerFilter, visibilityFilter, searchQuery]);

  return (
    <div className="space-y-6">
      <ToastBanner feedback={feedback} onDismiss={() => setFeedback(null)} />

      {/* Upload Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!uploading) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`rounded-2xl border-2 border-dashed p-7 text-center transition-colors ${
          isDragging
            ? 'border-sky-500 bg-sky-50/70'
            : 'border-slate-300 bg-white hover:border-sky-400'
        }`}
      >
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 ring-1 ring-sky-200/70">
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <UploadCloud className="h-5 w-5" aria-hidden="true" />
          )}
        </div>
        <h3 className="text-sm font-bold text-slate-900">Upload or Scan Tax Evidence</h3>
        <p className="mx-auto mt-1 mb-4 max-w-lg text-xs text-slate-500 text-pretty">
          Drag and drop a file here, scan receipts (crèche, domestic help, donations), or upload official certificates (PDF, JPG, PNG, TXT).
        </p>

        {members.length > 0 && (
          <div className="mb-4 inline-flex items-center gap-2 rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-3 py-1.5 text-xs">
            <label htmlFor="doc-upload-owner" className="font-semibold text-zinc-600">
              Attribute to Spouse:
            </label>
            <select
              id="doc-upload-owner"
              value={uploadOwnerId}
              onChange={(e) => setUploadOwnerId(e.target.value)}
              className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-950 focus:border-zinc-950 focus:outline-none"
            >
              <option value="">Household / Primary</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.user?.email || m.userId.substring(0, 8)} ({m.role.replace(/_/g, ' ')})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsCameraModalOpen(true)}
            disabled={uploading}
            className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-zinc-200/90 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-800 shadow-2xs transition hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.98] disabled:opacity-50"
          >
            <Camera className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
            <span>Scan with Camera</span>
          </button>

          <label className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800 active:scale-[0.98]">
            <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{uploading ? 'Processing & Extracting...' : 'Select Local File'}</span>
            <input
              type="file"
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading}
              accept=".pdf,.png,.jpg,.jpeg,.txt"
            />
          </label>

          <button
            type="button"
            onClick={handleUploadSampleSalarySlip}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/90 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-800 shadow-2xs transition hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.98] disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5 text-sky-600" aria-hidden="true" />
            <span>Upload Sample 2025 Salary Slip</span>
          </button>
        </div>
      </div>

      {/* Extracted Facts Awaiting Confirmation */}
      {unconfirmedFacts.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 shadow-2xs">
          <div className="mb-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="flex items-center gap-1.5 text-sm font-bold text-amber-950">
                <span>Extracted Figures Awaiting Your Confirmation</span>
                <HelpTip id="factConfidence" />
                <span className="tabular-nums rounded-full bg-amber-200/70 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                  {unconfirmedFacts.length}
                </span>
              </h4>
              <p className="mt-0.5 text-xs text-amber-800">
                These numbers were read from your documents. Confirm them to include them in your tax calculation.
              </p>
            </div>
            <button
              type="button"
              onClick={handleConfirmAll}
              disabled={bulkConfirming}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
            >
              <CheckCheck className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              <span>{bulkConfirming ? 'Confirming…' : `Confirm all ${unconfirmedFacts.length}`}</span>
            </button>
          </div>

          <div className="divide-y divide-amber-200/70 overflow-hidden rounded-xl border border-amber-200 bg-white">
            {unconfirmedFacts.map((fact) => (
              <div
                key={fact.id}
                className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs font-bold text-zinc-950">
                      {fact.fieldName}
                    </span>
                    <span className="tabular-nums text-sm font-extrabold text-zinc-950">
                      {formatEuro(fact.fieldValue)}
                    </span>
                    <StatusBadge tone="info">
                      <span className="tabular-nums">Confidence: {(fact.confidence * 100).toFixed(0)}%</span>
                    </StatusBadge>
                  </div>
                  {fact.sourceSnippet && (
                    <span className="mt-1.5 block truncate font-mono text-[11px] text-zinc-500">
                      Source: &quot;{fact.sourceSnippet}&quot;
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleConfirmExtractedFact(fact)}
                  disabled={confirmingId === fact.id}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-zinc-950 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                  <span>{confirmingId === fact.id ? 'Confirming...' : 'Confirm Figure into Return'}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Uploaded Documents Table */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200/85 bg-white shadow-[0_1px_2px_rgba(9,9,11,0.03)]">
        <div className="flex flex-col justify-between gap-4 border-b border-zinc-200 px-6 py-4 lg:flex-row lg:items-center">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-zinc-950">
              <span>Document Vault</span>
              <HelpTip id="documentVault" />
              <span className="tabular-nums rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">
                {documents.length}
              </span>
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Click a visibility badge to cycle between Private Draft, Shared for Discussion, and Included in Return.
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
                aria-label="Search documents"
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-44 rounded-xl border border-zinc-200 bg-white py-1.5 pr-3 pl-8 text-xs text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950/10"
              />
            </div>

            <select
              aria-label="Filter by visibility"
              value={visibilityFilter}
              onChange={(e) => setVisibilityFilter(e.target.value)}
              className="rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 focus:border-zinc-950 focus:outline-none"
            >
              <option value="ALL">All Visibilities</option>
              <option value={DocumentVisibility.INCLUDED_IN_RETURN}>Included in Return</option>
              <option value={DocumentVisibility.SHARED_FOR_DISCUSSION}>Shared for Discussion</option>
              <option value={DocumentVisibility.PRIVATE_DRAFT}>Private Draft</option>
            </select>

            {members.length > 1 && (
              <select
                aria-label="Filter by spouse"
                value={selectedOwnerFilter}
                onChange={(e) => setSelectedOwnerFilter(e.target.value)}
                className="rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 focus:border-zinc-950 focus:outline-none"
              >
                <option value="ALL">All Spouses</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.user?.email || m.userId.substring(0, 8)}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={refresh}
              aria-label="Refresh documents"
              className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 hover:text-zinc-950"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={4} />
        ) : documents.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-5 w-5" aria-hidden="true" />}
            title="Your document vault is empty"
            description="Upload salary certificates, mortgage interest statements, or receipts above, or try the sample 2025 salary certificate."
            actions={
              <button
                type="button"
                onClick={handleUploadSampleSalarySlip}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800"
              >
                <Sparkles className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                <span>Upload Sample 2025 Salary Slip</span>
              </button>
            }
          />
        ) : filteredDocuments.length === 0 ? (
          <EmptyState
            icon={<Search className="h-5 w-5" aria-hidden="true" />}
            title="No documents match your filters"
            description="Adjust your search query or clear the visibility/spouse filter to see all uploaded files."
            actions={
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setVisibilityFilter('ALL');
                  setSelectedOwnerFilter('ALL');
                }}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Clear filters
              </button>
            }
          />
        ) : (
          <>
            {/* Mobile Card List (< 768px) */}
            <div className="divide-y divide-zinc-100 md:hidden">
              {filteredDocuments.map((doc) => {
                const owner = members.find((m) => m.userId === doc.ownerId);
                return (
                  <div key={doc.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-zinc-950">
                            {doc.originalName}
                          </p>
                          <p className="mt-0.5 text-[11px] text-zinc-500">
                            {doc.ownerEmail || owner?.user?.email || 'Household'} ·{' '}
                            <span className="tabular-nums">
                              {new Date(doc.createdAt).toLocaleDateString()}
                            </span>
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700">
                        {doc.documentType.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleToggleVisibility(doc)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition active:scale-[0.98] ${
                          doc.visibility === DocumentVisibility.INCLUDED_IN_RETURN
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                            : doc.visibility === DocumentVisibility.SHARED_FOR_DISCUSSION
                            ? 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100'
                            : 'border-zinc-200 bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                        }`}
                      >
                        <span>{doc.visibility.replace(/_/g, ' ')}</span>
                        <RotateCw className="h-3 w-3 opacity-70" aria-hidden="true" />
                      </button>

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleReextract(doc.id)}
                          disabled={reextractingId === doc.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                        >
                          <RefreshCw
                            className={`h-3 w-3 ${reextractingId === doc.id ? 'animate-spin' : ''}`}
                            aria-hidden="true"
                          />
                          <span>{reextractingId === doc.id ? 'Reading…' : 'Re-scan'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteDoc(doc)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop / Tablet Table (>= 768px) */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50/90 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-6 py-3">File Name</th>
                    <th className="px-6 py-3">Spouse</th>
                    <th className="px-6 py-3">Document Type</th>
                    <th className="px-6 py-3">
                      Visibility <HelpTip id="documentVisibility" />
                    </th>
                    <th className="px-6 py-3">Uploaded</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredDocuments.map((doc) => {
                    const owner = members.find((m) => m.userId === doc.ownerId);
                    return (
                      <tr key={doc.id} className="transition-colors hover:bg-zinc-50/70">
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <FileText className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
                            <span className="font-semibold text-zinc-950">{doc.originalName}</span>
                          </div>
                        </td>
                        <td className="px-6 py-3.5">
                          <StatusBadge tone="neutral">
                            {doc.ownerEmail || (owner?.user?.email || 'Household')}
                          </StatusBadge>
                        </td>
                        <td className="px-6 py-3.5">
                          <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                            {doc.documentType.replace(/_/g, ' ')}
                          </span>
                          {doc.ocrRequired && (
                            <span className="ml-2 inline-flex items-center gap-1 align-middle">
                              <StatusBadge tone="warning">Needs OCR</StatusBadge>
                              <HelpTip id="needsOcr" />
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3.5">
                          <button
                            type="button"
                            onClick={() => handleToggleVisibility(doc)}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition active:scale-[0.98] ${
                              doc.visibility === DocumentVisibility.INCLUDED_IN_RETURN
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                : doc.visibility === DocumentVisibility.SHARED_FOR_DISCUSSION
                                ? 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100'
                                : 'border-zinc-200 bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                            }`}
                            title="Click to cycle visibility"
                          >
                            <span>{doc.visibility.replace(/_/g, ' ')}</span>
                            <RotateCw className="h-3 w-3 opacity-70" aria-hidden="true" />
                          </button>
                        </td>
                        <td className="tabular-nums px-6 py-3.5 text-xs text-zinc-500">
                          {new Date(doc.createdAt).toLocaleDateString()}
                        </td>
                        <td className="whitespace-nowrap px-6 py-3.5 text-right">
                          <div className="inline-flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => handleReextract(doc.id)}
                              disabled={reextractingId === doc.id}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 transition hover:text-sky-800 disabled:opacity-50"
                            >
                              <RefreshCw
                                className={`h-3 w-3 ${reextractingId === doc.id ? 'animate-spin' : ''}`}
                                aria-hidden="true"
                              />
                              <span>{reextractingId === doc.id ? 'Reading…' : 'Re-scan'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDeleteDoc(doc)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 transition hover:text-rose-700"
                            >
                              <Trash2 className="h-3 w-3" aria-hidden="true" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Camera Scanning Modal */}
      <CameraScanModal
        isOpen={isCameraModalOpen}
        workspaceId={workspaceId}
        onClose={() => setIsCameraModalOpen(false)}
        onSuccess={(msg) => {
          showFeedback('success', msg);
          refresh();
          onFactsChanged();
        }}
        onError={(err) => showFeedback('error', err)}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={pendingDeleteDoc !== null}
        title="Delete document from vault?"
        description={
          pendingDeleteDoc
            ? `Are you sure you want to delete "${pendingDeleteDoc.originalName}"? Extracted figures from this document will be unlinked.`
            : ''
        }
        confirmLabel="Delete Document"
        busy={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeleteDoc(null)}
      />
    </div>
  );
}
