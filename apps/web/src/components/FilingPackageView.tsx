'use client';

import React, { useState, useEffect } from 'react';
import { apiClient } from '../lib/api';
import {
  ReturnVersionDto,
  FilingPackageDto,
  TaxYearWorkspaceDto,
  HouseholdDto,
} from '@luxtax/contracts';

interface FilingPackageViewProps {
  workspace: TaxYearWorkspaceDto;
  household: HouseholdDto;
  onRefresh: () => void;
  onNavigateToCalculator?: () => void;
}

export function FilingPackageView({
  workspace,
  household,
  onRefresh,
  onNavigateToCalculator,
}: FilingPackageViewProps) {
  const [returnVersion, setReturnVersion] = useState<ReturnVersionDto | null>(null);
  const [filingPackage, setFilingPackage] = useState<FilingPackageDto | null>(null);
  const [approving, setApproving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copiedBox, setCopiedBox] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5000);
  };

  const loadFilingData = async () => {
    const [verRes, pkgRes] = await Promise.all([
      apiClient.getReturnVersion(workspace.id),
      apiClient.getFilingPackage(workspace.id),
    ]);
    if (verRes.data) setReturnVersion(verRes.data);
    if (pkgRes.data) setFilingPackage(pkgRes.data);
  };

  useEffect(() => {
    loadFilingData();
  }, [workspace.id]);

  const handleApprove = async () => {
    setApproving(true);
    const res = await apiClient.approveReturn(workspace.id);
    setApproving(false);

    if (res.error) {
      showFeedback('error', res.error);
    } else if (res.data) {
      setReturnVersion(res.data);
      showFeedback('success', 'Return version approved successfully! Both spouses can now review.');
      onRefresh();
    }
  };

  const handleGeneratePackage = async () => {
    setGenerating(true);
    const res = await apiClient.generateFilingPackage(workspace.id);
    setGenerating(false);

    if (res.error) {
      showFeedback('error', res.error);
    } else if (res.data) {
      setFilingPackage(res.data);
      showFeedback('success', 'Official Form 100 package and MyGuichet transfer guide generated!');
      onRefresh();
    }
  };

  const handleCopy = (box: string, val: string | number) => {
    navigator.clipboard.writeText(String(val));
    setCopiedBox(box);
    setTimeout(() => setCopiedBox(null), 2000);
  };

  const toggleStep = (index: number) => {
    setCompletedSteps((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const members = household.members || [];
  const approvals = returnVersion?.approvals || [];

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
          <div>
            <span>{feedback.message}</span>
            {feedback.message.includes('calculated before approving') && onNavigateToCalculator && (
              <button
                onClick={onNavigateToCalculator}
                className="ml-3 text-xs underline font-bold hover:text-rose-950"
              >
                Go to Tax Calculator now &rarr;
              </button>
            )}
          </div>
          <button onClick={() => setFeedback(null)} className="text-xs opacity-60 hover:opacity-100 ml-4">
            ✕
          </button>
        </div>
      )}

      {/* Dual Spouse Approval Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">
                Joint Household Return Approval
              </h3>
              {returnVersion?.bothSpousesApproved && (
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                  ✓ Ready to File
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              In accordance with Luxembourg tax law, filers must review and approve the exact return version before filing to ACD.
            </p>
          </div>

          <button
            onClick={handleApprove}
            disabled={approving}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            {approving ? 'Registering Approval...' : '✓ Approve Return Version'}
          </button>
        </div>

        {/* Member Approval Status Cards */}
        <div className="grid gap-4 sm:grid-cols-2 mt-5">
          {members.map((member) => {
            const hasApproved = approvals.some((a) => a.userId === member.userId && !a.isSuperseded);
            const approvalRecord = approvals.find((a) => a.userId === member.userId);

            return (
              <div
                key={member.id}
                className={`rounded-xl border p-4 transition-all ${
                  hasApproved
                    ? 'border-emerald-200 bg-emerald-50/50'
                    : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                        hasApproved
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {hasApproved ? '✓' : '•'}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{member.user?.email || member.userId.substring(0, 8)}</h4>
                      <span className="text-[10px] text-slate-500">{member.role}</span>
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                      hasApproved
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {hasApproved ? 'Approved' : 'Pending Approval'}
                  </span>
                </div>

                {hasApproved && approvalRecord && (
                  <p className="mt-2 text-[10px] text-emerald-700">
                    Approved on: {new Date(approvalRecord.approvedAt).toLocaleString()}
                  </p>
                )}

                {approvalRecord?.isSuperseded && (
                  <p className="mt-2 text-[11px] font-medium text-amber-700 bg-amber-50 p-1.5 rounded border border-amber-200">
                    ⚠ Approval superseded: {approvalRecord.supersedingReason || 'Fact modified'}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Package Generation Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Form 100 Box Mappings & MyGuichet Transfer Guide
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Generates the official Luxembourg Form 100 boxes and step-by-step transfer guide for filing online.
            </p>
          </div>

          <button
            onClick={handleGeneratePackage}
            disabled={generating}
            className="rounded-lg bg-sky-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-sky-500 disabled:opacity-50 transition-colors"
          >
            {generating ? 'Generating Package...' : '📦 Generate Filing Package'}
          </button>
        </div>

        {filingPackage ? (
          <div className="mt-6 space-y-6">
            {/* Hash & Verification Banner */}
            <div className="flex items-center justify-between rounded-lg bg-slate-900 text-white p-4 text-xs font-mono">
              <span className="text-slate-400">Package SHA-256 Checksum:</span>
              <span className="text-emerald-400 font-bold truncate max-w-xs sm:max-w-md">
                {filingPackage.packageSha256}
              </span>
            </div>

            {/* Form 100 Boxes Table */}
            <div>
              <h4 className="text-sm font-bold text-slate-900 mb-3">
                Official Form 100 Box Values ({filingPackage.form100Boxes.length} fields mapped)
              </h4>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 uppercase text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">Box</th>
                      <th className="px-4 py-2.5">Page</th>
                      <th className="px-4 py-2.5">French Description</th>
                      <th className="px-4 py-2.5">German Description</th>
                      <th className="px-4 py-2.5 text-right">Value (EUR)</th>
                      <th className="px-4 py-2.5 text-center">Copy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filingPackage.form100Boxes.map((box, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2 font-mono font-bold text-sky-700">
                          Case {box.boxNumber}
                        </td>
                        <td className="px-4 py-2 text-slate-500">Page {box.pageNumber}</td>
                        <td className="px-4 py-2 font-medium text-slate-800">{box.labelFr}</td>
                        <td className="px-4 py-2 text-slate-500">{box.labelDe}</td>
                        <td className="px-4 py-2 text-right font-bold text-slate-900">
                          €{Number(box.amount).toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button
                            onClick={() => handleCopy(box.boxNumber, box.amount)}
                            className="rounded bg-slate-100 hover:bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700"
                          >
                            {copiedBox === box.boxNumber ? 'Copied!' : 'Copy'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* MyGuichet Guide */}
            <div>
              <h4 className="text-sm font-bold text-slate-900 mb-3">
                MyGuichet.lu Step-by-Step Filing Walkthrough
              </h4>
              <div className="space-y-3">
                {filingPackage.myGuichetGuide.map((step) => (
                  <div key={step.sectionIndex} className="rounded-lg border border-slate-200 bg-white p-4 text-xs">
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="font-bold text-slate-900 text-sm">{step.sectionTitle}</h5>
                      <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!completedSteps[step.sectionIndex]}
                          onChange={() => toggleStep(step.sectionIndex)}
                          className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        />
                        <span>Completed on MyGuichet</span>
                      </label>
                    </div>

                    <ul className="list-disc list-inside space-y-1 text-slate-600 mb-3">
                      {step.instructions.map((inst, idx) => (
                        <li key={idx}>{inst}</li>
                      ))}
                    </ul>

                    {step.fieldsToEnter.length > 0 && (
                      <div className="grid gap-2 sm:grid-cols-2 mt-2 bg-slate-50 p-3 rounded-lg">
                        {step.fieldsToEnter.map((f, idx) => (
                          <div key={idx} className="flex justify-between items-center p-2 rounded bg-white border border-slate-200">
                            <div>
                              <span className="font-mono text-sky-700 font-bold">{f.form100Box}</span>
                              <p className="text-[11px] text-slate-600">{f.fieldLabel}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">€{Number(f.value).toFixed(2)}</span>
                              <button
                                onClick={() => handleCopy(f.form100Box, f.value)}
                                className="rounded bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600"
                              >
                                {copiedBox === f.form100Box ? '✓' : 'Copy'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 p-8 text-center text-slate-500 rounded-lg border border-dashed border-slate-200">
            <p className="text-xs">
              Once you approve the return version above, click &quot;Generate Filing Package&quot; to inspect your Form 100 boxes.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
