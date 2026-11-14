'use client';

import React, { useState, useEffect } from 'react';
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

interface DocumentsViewProps {
  workspaceId: string;
  members?: readonly HouseholdMemberDto[];
  onFactsChanged: () => void;
}

export function DocumentsView({ workspaceId, members = [], onFactsChanged }: DocumentsViewProps) {
  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const [extractedFacts, setExtractedFacts] = useState<ExtractedFactDto[]>([]);
  const [selectedOwnerFilter, setSelectedOwnerFilter] = useState<string>('ALL');
  const [uploadOwnerId, setUploadOwnerId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [reextractingId, setReextractingId] = useState<string | null>(null);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
      showFeedback('success', `Document visibility changed to ${nextVis}`);
      await refresh();
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this document? Extracted figures will be unlinked.')) return;
    const res = await apiClient.deleteDocument(workspaceId, docId);
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
      showFeedback('error', `Confirmed €${fact.fieldValue} (${fact.fieldName}). ${inclusionWarning}`);
    } else {
      showFeedback('success', `Confirmed €${fact.fieldValue} (${fact.fieldName}) into return facts!`);
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

      {/* Upload Box */}
      <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 text-center hover:border-sky-500 transition-colors">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 text-sky-600 mb-3">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-slate-900">Upload or Scan Tax Evidence</h3>
        <p className="text-xs text-slate-500 mt-1 mb-4">
          Scan receipts (crèche, domestic help, donations) or upload official certificates (PDF, JPG, PNG).
        </p>

        {members.length > 0 && (
          <div className="mb-4 inline-flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-xs">
            <span className="font-semibold text-slate-600">Attribute to Spouse:</span>
            <select
              value={uploadOwnerId}
              onChange={(e) => setUploadOwnerId(e.target.value)}
              className="bg-white border border-slate-300 rounded px-2 py-0.5 font-medium text-slate-800"
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

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setIsCameraModalOpen(true)}
            disabled={uploading}
            className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition space-x-1.5"
          >
            <span>📷</span>
            <span>Scan with Camera</span>
          </button>

          <label className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-sky-500 transition">
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
            className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-2 text-xs font-bold text-sky-700 hover:bg-sky-100 transition disabled:opacity-50"
          >
            ⚡ Upload Sample 2025 Salary Slip
          </button>
        </div>
      </div>


      {/* Extracted Facts Awaiting Confirmation */}
      {unconfirmedFacts.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-sm font-bold text-amber-900">
                Extracted Figures Awaiting Your Confirmation
                    {" "}<HelpTip id="factConfidence" /> ({unconfirmedFacts.length})
              </h4>
              <p className="text-xs text-amber-700 mt-0.5">
                These numbers were read from your documents. Confirm them to include them in your 2025 calculation.
              </p>
            </div>
            <button
              onClick={handleConfirmAll}
              disabled={bulkConfirming}
              className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 transition disabled:opacity-50 shrink-0"
            >
              {bulkConfirming ? 'Confirming…' : `Confirm all ${unconfirmedFacts.length}`}
            </button>
          </div>

          <div className="divide-y divide-amber-200/60 rounded-lg border border-amber-200 bg-white">
            {unconfirmedFacts.map((fact) => (
              <div
                key={fact.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                      {fact.fieldName}
                    </span>
                    <span className="text-sm font-black text-slate-900">
                      €{parseFloat(fact.fieldValue).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="rounded bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                      Confidence: {(fact.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  {fact.sourceSnippet && (
                    <span className="text-[11px] text-slate-400 mt-1 block font-mono">
                      Source: &quot;{fact.sourceSnippet}&quot;
                    </span>
                  )}
                </div>

                <button
                  onClick={() => handleConfirmExtractedFact(fact)}
                  disabled={confirmingId === fact.id}
                  className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 transition disabled:opacity-50"
                >
                  {confirmingId === fact.id ? 'Confirming...' : '✓ Confirm Figure into Return'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Uploaded Documents Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-900">
            Document Vault
                    {" "}<HelpTip id="documentVault" /> ({documents.length})
          </h3>
          <div className="flex items-center gap-3">
            {members.length > 1 && (
              <select
                value={selectedOwnerFilter}
                onChange={(e) => setSelectedOwnerFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-medium"
              >
                <option value="ALL">All Spouses</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.user?.email || m.userId.substring(0, 8)}
                  </option>
                ))}
              </select>
            )}
            <button onClick={refresh} className="text-xs text-sky-600 hover:text-sky-700 font-semibold">
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading documents...</div>
        ) : documents.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No documents uploaded yet. Upload a tax certificate above or click Upload Sample.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">File Name</th>
                  <th className="px-6 py-3">Spouse</th>
                  <th className="px-6 py-3">Document Type</th>
                  <th className="px-6 py-3">Visibility{" "}<HelpTip id="documentVisibility" /></th>
                  <th className="px-6 py-3">Uploaded</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documents
                  .filter((d) => selectedOwnerFilter === 'ALL' || d.ownerId === selectedOwnerFilter)
                  .map((doc) => {
                    const owner = members.find((m) => m.userId === doc.ownerId);
                    return (
                      <tr key={doc.id} className="hover:bg-slate-50/50">
                        <td className="px-6 py-4 font-medium text-slate-900">
                          {doc.originalName}
                        </td>
                        <td className="px-6 py-4">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 font-medium">
                            {doc.ownerEmail || (owner?.user?.email || 'Household')}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                            {doc.documentType.replace(/_/g, ' ')}
                          </span>
                          {doc.ocrRequired && (
                            <span className="ml-2 inline-flex items-center gap-1 align-middle">
                              <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                                Needs OCR
                              </span>
                              <HelpTip id="needsOcr" />
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleToggleVisibility(doc)}
                            className={`rounded px-2 py-0.5 text-xs font-semibold transition ${
                              doc.visibility === DocumentVisibility.INCLUDED_IN_RETURN
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : doc.visibility === DocumentVisibility.SHARED_FOR_DISCUSSION
                                ? 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                            title="Click to toggle visibility"
                          >
                            {doc.visibility.replace(/_/g, ' ')} ↻
                          </button>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-500">
                          {new Date(doc.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-right space-x-3 whitespace-nowrap">
                          <button
                            onClick={() => handleReextract(doc.id)}
                            disabled={reextractingId === doc.id}
                            className="text-xs text-sky-600 hover:text-sky-700 font-semibold disabled:opacity-50"
                          >
                            {reextractingId === doc.id ? 'Reading…' : 'Re-scan'}
                          </button>
                          <button
                            onClick={() => handleDelete(doc.id)}
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
    </div>
  );
}

