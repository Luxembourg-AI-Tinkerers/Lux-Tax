'use client';

import React, { useState } from 'react';
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
}

export function FilingPackageView({ workspace, household, onRefresh }: FilingPackageViewProps) {
  const [returnVersion, setReturnVersion] = useState<ReturnVersionDto | null>(null);
  const [filingPackage, setFilingPackage] = useState<FilingPackageDto | null>(null);
  const [approving, setApproving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copiedBox, setCopiedBox] = useState<string | null>(null);

  const handleApprove = async () => {
    setApproving(true);
    const res = await apiClient.approveReturn(workspace.id);
    if (res.data) {
      setReturnVersion(res.data);
      onRefresh();
    }
    setApproving(false);
  };

  const handleGeneratePackage = async () => {
    setGenerating(true);
    const res = await apiClient.generateFilingPackage(workspace.id);
    if (res.data) {
      setFilingPackage(res.data);
      onRefresh();
    }
    setGenerating(false);
  };

  const handleCopy = (box: string, val: string | number) => {
    navigator.clipboard.writeText(String(val));
    setCopiedBox(box);
    setTimeout(() => setCopiedBox(null), 2000);
  };

  const members = household.members || [];
  const approvals = returnVersion?.approvals || [];

  return (
    <div className="space-y-6">
      {/* Dual Spouse Approval Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Joint Household Return Approval
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              In accordance with Luxembourg tax law, both spouses must independently review and approve the exact same return version.
            </p>
          </div>

          <button
            onClick={handleApprove}
            disabled={approving}
            className="rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50 transition-colors"
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
                  <div className="flex items-center gap-2">
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
                      <h4 className="text-xs font-bold text-slate-900">{member.user?.email}</h4>
                      <span className="text-[10px] text-slate-500">{member.role}</span>
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      hasApproved
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {hasApproved ? 'Approved' : 'Pending Approval'}
                  </span>
                </div>

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
            className="rounded-lg bg-sky-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-sky-500 disabled:opacity-50 transition-colors"
          >
            {generating ? 'Generating Package...' : '📦 Generate Filing Package'}
          </button>
        </div>

        {filingPackage && (
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
                Official Form 100 Box Values ({filingPackage.form100Boxes.length} fields)
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
                    <h5 className="font-bold text-slate-900 text-sm mb-2">{step.sectionTitle}</h5>
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
                            <span className="font-bold text-slate-900">€{Number(f.value).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
