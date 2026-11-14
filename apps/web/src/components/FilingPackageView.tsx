'use client';

import React, { useState, useEffect } from 'react';
import { HelpTip } from './HelpTip';
import { apiClient, downloadAnnexPdf } from '../lib/api';
import { formatEuro } from '../lib/money';
import {
  ReturnVersionDto,
  ReturnVersionHistoryDto,
  ReturnVersionHistoryItemDto,
  FilingPackageDto,
  TaxYearWorkspaceDto,
  HouseholdDto,
  WorkspaceStatus,
} from '@luxtax/contracts';

const VERSION_STATUS_STYLES: Record<
  ReturnVersionHistoryItemDto['status'],
  { label: string; badge: string }
> = {
  DRAFT: { label: 'Current draft', badge: 'bg-amber-100 text-amber-800' },
  APPROVED: { label: 'Approved', badge: 'bg-emerald-100 text-emerald-800' },
  SUPERSEDED: { label: 'Superseded', badge: 'bg-slate-100 text-slate-600' },
};

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
  const [history, setHistory] = useState<ReturnVersionHistoryDto | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
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
    const [verRes, pkgRes, historyRes] = await Promise.all([
      apiClient.getReturnVersion(workspace.id),
      apiClient.getFilingPackage(workspace.id),
      apiClient.getReturnVersionHistory(workspace.id),
    ]);
    // A successful `null` is authoritative: after an invalidation the workspace
    // legitimately has no current version row and no package, so the previous
    // tax year's rows must not stand in for them. Only a failed request keeps
    // the previous state (the history card shows its unavailable copy).
    if (!verRes.error) setReturnVersion(verRes.data ?? null);
    if (!pkgRes.error) setFilingPackage(pkgRes.data ?? null);
    if (!historyRes.error) setHistory(historyRes.data ?? null);
    setHistoryLoaded(true);
  };

  useEffect(() => {
    // Reset first: another workspace/tax year must never render the previous
    // year's version, package or history while the new requests are in flight.
    setReturnVersion(null);
    setFilingPackage(null);
    setHistory(null);
    setHistoryLoaded(false);
    void loadFilingData();
  }, [workspace.id]);

  const handleApprove = async () => {
    setApproving(true);
    const res = await apiClient.approveReturn(workspace.id);
    setApproving(false);

    if (res.error) {
      showFeedback('error', res.error);
    } else if (res.data) {
      setReturnVersion(res.data);
      // A single filer has no spouse to notify; the copy said otherwise.
      const activeMembers = household?.members?.filter((m) => m.status === 'ACTIVE').length ?? 1;
      showFeedback(
        'success',
        activeMembers > 1
          ? 'Return version approved successfully! Both spouses can now review.'
          : 'Return version approved successfully!',
      );
      onRefresh();
      await loadFilingData();
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
      await loadFilingData();
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
                    {" "}<HelpTip id="approval" />
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
            const approvalRecord = approvals.find(
              (a) => a.userId === member.userId && !a.isSuperseded,
            );

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
              </div>
            );
          })}
        </div>
      </div>

      {/* Version History Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="border-b border-slate-100 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-slate-900">Version history</h3>
            {workspace.status === WorkspaceStatus.FILED && (
              <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-800">
                🔒 Filed &amp; frozen
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            A change to a material fact, questionnaire answer, document or calculation supersedes existing
            approvals and opens a new draft version.
          </p>
          {workspace.status === WorkspaceStatus.FILED && (
            <p className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-1.5 text-[11px] font-medium text-indigo-900">
              The filed version snapshot is immutable. Material changes after filing require an
              amendment rather than an edit of the filed version.
            </p>
          )}
        </div>

        {history === null ? (
          <div className="mt-4 p-8 text-center text-slate-500 rounded-lg border border-dashed border-slate-200">
            <p className="text-xs">
              {historyLoaded ? 'Version history is not available right now.' : 'Loading version history…'}
            </p>
          </div>
        ) : history.versions.length === 0 ? (
          <div className="mt-4 p-8 text-center text-slate-500 rounded-lg border border-dashed border-slate-200">
            <p className="text-xs">No return versions recorded for this workspace yet.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {history.versions.map((item) => {
              const status = VERSION_STATUS_STYLES[item.status];

              return (
                <div
                  key={item.id ?? `version-${item.versionNumber}`}
                  className={`rounded-xl border p-4 ${
                    item.isCurrent
                      ? 'border-sky-300 bg-sky-50/30 ring-2 ring-sky-100'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-900">Version {item.versionNumber}</h4>
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${status.badge}`}>
                          {status.label}
                        </span>
                        {item.isCurrent && (
                          <span className="rounded-full bg-sky-600 px-2.5 py-0.5 text-[10px] font-bold text-white">
                            Current version
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {item.createdAt
                          ? `Created ${new Date(item.createdAt).toLocaleDateString()}`
                          : 'Draft not yet approved — no version snapshot exists.'}
                      </p>
                    </div>

                    <div className="text-[11px] text-slate-600 sm:text-right">
                      <p>
                        Final tax liability:{' '}
                        <span className="font-bold text-slate-900">
                          {typeof item.finalTaxLiability === 'number'
                            ? formatEuro(item.finalTaxLiability)
                            : 'Not available until approved'}
                        </span>
                      </p>
                      <p className="mt-0.5">
                        Filing package:{' '}
                        <span
                          className={`font-bold ${
                            item.packageGenerated ? 'text-emerald-700' : 'text-slate-500'
                          }`}
                        >
                          {item.packageGenerated ? 'Generated' : 'Not generated'}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1.5">
                    {item.approvals.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-2.5 text-[11px] text-slate-500">
                        {item.status === 'DRAFT'
                          ? 'No approvals yet — this draft still needs approval from all required approvers.'
                          : 'No approvals were recorded for this version.'}
                      </p>
                    ) : (
                      item.approvals.map((approval) => (
                        <div
                          key={approval.id}
                          className={`rounded-lg border p-2.5 text-[11px] ${
                            approval.isSuperseded
                              ? 'border-amber-200 bg-amber-50/60'
                              : 'border-emerald-200 bg-emerald-50/40'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className="font-semibold text-slate-800">
                              {approval.userEmail || approval.userId.substring(0, 8)}
                            </span>
                            <span className="text-slate-500">
                              Approved {new Date(approval.approvedAt).toLocaleString()}
                            </span>
                          </div>
                          {approval.isSuperseded && (
                            <p className="mt-1 font-medium text-amber-800">
                              Approval superseded
                              {approval.supersededAt
                                ? ` on ${new Date(approval.supersededAt).toLocaleDateString()}`
                                : ''}
                              :{' '}
                              {approval.supersedingReason || 'The return changed after this approval.'}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Package Generation Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Form 100 Box Mappings & MyGuichet Transfer Guide
                    {" "}<HelpTip id="filingRoute" />
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
              <span className="text-slate-400">Package SHA-256 Checksum:
                    {" "}<HelpTip id="packageChecksum" /></span>
              <span className="text-emerald-400 font-bold truncate max-w-xs sm:max-w-md">
                {filingPackage.packageSha256}
              </span>
            </div>

            {/* Form 100 Boxes Table */}
            <div>
              <h4 className="text-sm font-bold text-slate-900 mb-3">
                Official Form 100 Box Values
                    {" "}<HelpTip id="formBox" /> ({filingPackage.form100Boxes.length} fields mapped)
              </h4>
              {(filingPackage.unsupportedCertificateCodes ?? []).length > 0 && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <div className="font-bold">
                    {(filingPackage.unsupportedCertificateCodes ?? []).length} certificate 160 code(s) could not be mapped
                  </div>
                  <ul className="mt-1 space-y-1">
                    {(filingPackage.unsupportedCertificateCodes ?? []).map((item) => (
                      <li key={`${item.factId}-${item.code}`}>
                        <span className="font-mono font-bold">{item.code}</span> — {item.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 uppercase text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">Sheet / Case</th>
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
                          {box.sheet ?? (box as any).boxNumber ?? ''} · case {box.caseNumber ?? 'n/a'}
                          {box.kind && box.kind !== 'FORM_100' && (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 font-sans text-[10px] font-bold text-amber-700">
                              {box.kind}
                            </span>
                          )}
                          {box.personName && (
                            <span className="mt-0.5 block font-sans text-[10px] font-normal text-slate-400">
                              {box.personName}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-slate-500">Page {box.pageNumber}</td>
                        <td className="px-4 py-2 font-medium text-slate-800">{box.labelFr}</td>
                        <td className="px-4 py-2 text-slate-500">{box.labelDe}</td>
                        <td className="px-4 py-2 text-right font-bold text-slate-900">
                          {formatEuro(box.amount)}
                        </td>
                        <td className="px-4 py-2 text-center">
                          {box.kind === 'FORM_100' || !box.kind ? (
                            <button
                              onClick={() => handleCopy(String(i), box.amount)}
                              className="rounded bg-slate-100 hover:bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700"
                            >
                              {copiedBox === String(i) ? 'Copied!' : 'Copy'}
                            </button>
                          ) : (
                            <span className="text-[10px] font-semibold uppercase text-slate-400">
                              {box.kind === 'COMPUTED' ? 'auto' : 'instructions'}
                            </span>
                          )}
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
                {filingPackage.annexes.length > 0 && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-bold text-indigo-950 mb-1">
                        Required ACD annexes ({filingPackage.annexes.length})
                      </h3>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await downloadAnnexPdf(workspace.id);
                            } catch (error) {
                              console.error(error);
                            }
                          }}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-500"
                        >
                          Download annex PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => window.print()}
                          className="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-[11px] font-bold text-indigo-800 hover:bg-indigo-50"
                        >
                          Print
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-indigo-800 mb-3">
                      The app supplies the values; the official annex PDF is not generated. Carry them into the
                      corresponding ACD annex.
                    </p>
                    <div className="space-y-3">
                      {filingPackage.annexes.map((annex) => (
                        <div key={annex.code} className="rounded-lg bg-white border border-indigo-100 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900">
                              {annex.code} — {annex.title}
                            </span>
                            <span className="text-[10px] font-bold uppercase text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                              preparation sheet
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 mt-1">{annex.reason}</p>
                          <div className="mt-2 grid gap-1 text-[11px] sm:grid-cols-2">
                            {annex.fields.map((f) => (
                              <div key={f.label} className="flex justify-between border-b border-slate-100 py-0.5">
                                <span className="text-slate-500">{f.label}</span>
                                <span className="font-semibold">{f.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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
                              <span className="font-bold text-slate-900">{formatEuro(f.value)}</span>
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
