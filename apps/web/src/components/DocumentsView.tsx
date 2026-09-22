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
  const [uploadError, setUploadError] = useState<string | null>(null);

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
    setUploadError(null);

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
        setUploadError(res.error);
      } else {
        await refresh();
        onFactsChanged();
      }
      setUploading(false);
    };

    reader.onerror = () => {
      setUploadError('Failed to read file');
      setUploading(false);
    };

    reader.readAsDataURL(file);
  };

  const handleToggleVisibility = async (doc: DocumentDto) => {
    const nextVis =
      doc.visibility === DocumentVisibility.PRIVATE_DRAFT
        ? DocumentVisibility.SHARED_FOR_DISCUSSION
        : DocumentVisibility.INCLUDED_IN_RETURN;

    await apiClient.updateDocumentVisibility(workspaceId, doc.id, nextVis);
    await refresh();
  };

  const handleDelete = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;
    await apiClient.deleteDocument(workspaceId, docId);
    await refresh();
    onFactsChanged();
  };

  const handleConfirmExtractedFact = async (fact: ExtractedFactDto) => {
    let category = FactCategory.EMPLOYMENT_INCOME;
    if (fact.fieldName.toLowerCase().includes('mortgage')) {
      category = FactCategory.MORTGAGE_DEDUCTION;
    } else if (fact.fieldName.toLowerCase().includes('insurance')) {
      category = FactCategory.INSURANCE_DEDUCTION;
    } else if (fact.fieldName.toLowerCase().includes('donation')) {
      category = FactCategory.DONATION_DEDUCTION;
    }

    await apiClient.confirmFact(workspaceId, {
      extractedFactId: fact.id,
      category,
      fieldKey: fact.fieldName,
      amount: fact.fieldValue,
      currency: fact.currency,
      isIncludedInReturn: true,
      isSharedWithHousehold: true,
    });

    await refresh();
    onFactsChanged();
  };

  return (
    <div className="space-y-6">
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

        <label className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-500">
          <span>{uploading ? 'Processing & Extracting...' : 'Select File'}</span>
          <input
            type="file"
            className="hidden"
            onChange={handleFileUpload}
            disabled={uploading}
            accept=".pdf,.png,.jpg,.jpeg,.txt"
          />
        </label>

        {uploadError && (
          <p className="mt-3 text-xs font-medium text-rose-600 bg-rose-50 p-2 rounded-lg inline-block">
            {uploadError}
          </p>
        )}
      </div>

      {/* Extracted Facts Awaiting Confirmation */}
      {extractedFacts.filter((f) => !f.isConfirmed).length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-800 text-xs font-bold">
              !
            </span>
            <h4 className="text-sm font-bold text-amber-900">
              Extracted Figures Awaiting Verification ({extractedFacts.filter((f) => !f.isConfirmed).length})
            </h4>
          </div>
          <p className="text-xs text-amber-800 mb-4">
            Our extraction engine detected these numbers in your uploaded certificates. Confirm each figure to include it in your official 2025 calculation.
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {extractedFacts
              .filter((f) => !f.isConfirmed)
              .map((fact) => (
                <div key={fact.id} className="rounded-lg border border-amber-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      {fact.fieldName}
                    </span>
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                      {Math.round(fact.confidence * 100)}% Match
                    </span>
                  </div>
                  <div className="mt-2 text-xl font-black text-slate-900">
                    €{Number(fact.fieldValue).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  {fact.sourceSnippet && (
                    <p className="mt-1 text-[11px] text-slate-500 italic truncate" title={fact.sourceSnippet}>
                      "{fact.sourceSnippet}"
                    </p>
                  )}
                  <button
                    onClick={() => handleConfirmExtractedFact(fact)}
                    className="mt-3 w-full rounded-md bg-emerald-600 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 shadow-sm transition-colors"
                  >
                    Confirm Fact
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Documents List */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Document Vault ({documents.length})</h3>
          <button onClick={refresh} className="text-xs text-sky-600 hover:text-sky-700 font-semibold">
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading documents...</div>
        ) : documents.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No documents uploaded yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {documents.map((doc) => (
              <div key={doc.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4 hover:bg-slate-50/50">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">{doc.originalName}</h4>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        {doc.documentType}
                      </span>
                      <span className="rounded bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                        {doc.visibility.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {(doc.fileSize / 1024).toFixed(1)} KB
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    onClick={() => handleToggleVisibility(doc)}
                    className="rounded border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Change Visibility
                  </button>
                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="rounded border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
