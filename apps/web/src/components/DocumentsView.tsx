'use client';

import React, { useState, useEffect } from 'react';
import { apiClient } from '../lib/api';
import {
  DocumentDto,
  DocumentVisibility,
  DocumentType,
  ExtractedFactDto,
  FactCategory,
} from '@luxtax/contracts';

interface DocumentsViewProps {
  workspaceId: string;
  onFactsChanged: () => void;
}

export function DocumentsView({ workspaceId, onFactsChanged }: DocumentsViewProps) {
  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const [extractedFacts, setExtractedFacts] = useState<ExtractedFactDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

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
        visibility: DocumentVisibility.SHARED_FOR_DISCUSSION,
      });

      if (res.error) {
        showFeedback('error', res.error);
      } else {
        showFeedback('success', `Document "${file.name}" uploaded & parsed successfully!`);
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
      visibility: DocumentVisibility.SHARED_FOR_DISCUSSION,
    });

    setUploading(false);
    if (res.error) {
      showFeedback('error', res.error);
    } else {
      showFeedback('success', 'Uploaded & extracted sample 2025 Salary Certificate!');
      await refresh();
      onFactsChanged();
    }
  };

  const handleToggleVisibility = async (doc: DocumentDto) => {
    const nextVis =
      doc.visibility === DocumentVisibility.PRIVATE_DRAFT
        ? DocumentVisibility.SHARED_FOR_DISCUSSION
        : DocumentVisibility.INCLUDED_IN_RETURN;

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
    let category = FactCategory.EMPLOYMENT_INCOME;
    if (fact.fieldName.toLowerCase().includes('mortgage') || fact.fieldName === 'code_141') {
      category = FactCategory.MORTGAGE_DEDUCTION;
    } else if (fact.fieldName.toLowerCase().includes('insurance') || fact.fieldName.toLowerCase().includes('pension')) {
      category = FactCategory.INSURANCE_DEDUCTION;
    } else if (fact.fieldName.toLowerCase().includes('donation')) {
      category = FactCategory.DONATION_DEDUCTION;
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
    } else {
      showFeedback('success', `Confirmed €${fact.fieldValue} (${fact.fieldName}) into return facts!`);
      await refresh();
      onFactsChanged();
    }
  };

  const unconfirmedFacts = extractedFacts.filter((f) => !f.isConfirmed);

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

      {/* Upload Box */}
      <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 text-center hover:border-sky-500 transition-colors">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 text-sky-600 mb-3">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-slate-900">Upload Tax Document</h3>
        <p className="text-xs text-slate-500 mt-1 mb-4">
          Upload your Certificat de rémunération, bank interest slips, or donation receipts (PDF, PNG, JPG, TXT).
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
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
                Extracted Figures Awaiting Your Confirmation ({unconfirmedFacts.length})
              </h4>
              <p className="text-xs text-amber-700 mt-0.5">
                Our local parser extracted these numbers from your documents. Confirm them to include in your 2025 calculation.
              </p>
            </div>
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
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">
            Document Vault ({documents.length})
          </h3>
          <button onClick={refresh} className="text-xs text-sky-600 hover:text-sky-700 font-semibold">
            Refresh
          </button>
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
                  <th className="px-6 py-3">Document Type</th>
                  <th className="px-6 py-3">Visibility</th>
                  <th className="px-6 py-3">Uploaded</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4 font-medium text-slate-900">
                      {doc.originalName}
                    </td>
                    <td className="px-6 py-4">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {doc.documentType.replace(/_/g, ' ')}
                      </span>
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
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="text-xs text-rose-600 hover:text-rose-700 font-semibold"
                      >
                        Delete
                      </button>
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
