'use client';

import React, { useState, useEffect } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileCheck2,
  Loader2,
  Lock,
  Package,
  Printer,
  ShieldCheck,
} from 'lucide-react';
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
import { ToastBanner, type ToastMessage } from './ui/ToastBanner';
import { StatusBadge, type BadgeTone } from './ui/StatusBadge';

const VERSION_STATUS_STYLES: Record<
  ReturnVersionHistoryItemDto['status'],
  { label: string; tone: BadgeTone }
> = {
  DRAFT: { label: 'Current draft', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'success' },
  SUPERSEDED: { label: 'Superseded', tone: 'neutral' },
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
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [copiedBox, setCopiedBox] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});
  const [feedback, setFeedback] = useState<ToastMessage | null>(null);

  const stepsStorageKey = `luxtax_myguichet_steps_${workspace.id}`;

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback((curr) => (curr?.message === message ? null : curr)), 5000);
  };

  const loadFilingData = async () => {
    const [verRes, pkgRes, historyRes] = await Promise.all([
      apiClient.getReturnVersion(workspace.id),
      apiClient.getFilingPackage(workspace.id),
      apiClient.getReturnVersionHistory(workspace.id),
    ]);
    if (!verRes.error) setReturnVersion(verRes.data ?? null);
    if (!pkgRes.error) setFilingPackage(pkgRes.data ?? null);
    if (!historyRes.error) setHistory(historyRes.data ?? null);
    setHistoryLoaded(true);
  };

  useEffect(() => {
    setReturnVersion(null);
    setFilingPackage(null);
    setHistory(null);
    setHistoryLoaded(false);

    if (typeof window !== 'undefined') {
      try {
        const stored = window.localStorage.getItem(stepsStorageKey);
        setCompletedSteps(stored ? (JSON.parse(stored) as Record<number, boolean>) : {});
      } catch {
        setCompletedSteps({});
      }
    }

    void loadFilingData();
  }, [workspace.id, stepsStorageKey]);

  const handleApprove = async () => {
    setApproving(true);
    const res = await apiClient.approveReturn(workspace.id);
    setApproving(false);

    if (res.error) {
      showFeedback('error', res.error);
    } else if (res.data) {
      setReturnVersion(res.data);
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

  const handleDownloadAnnex = async () => {
    setDownloadingPdf(true);
    try {
      await downloadAnnexPdf(workspace.id);
    } catch (err: any) {
      showFeedback('error', err?.message || 'Annex PDF could not be generated.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleCopy = (box: string, val: string | number) => {
    navigator.clipboard?.writeText(String(val));
    setCopiedBox(box);
    setTimeout(() => setCopiedBox((curr) => (curr === box ? null : curr)), 2000);
  };

  const toggleStep = (index: number) => {
    setCompletedSteps((prev) => {
      const next = { ...prev, [index]: !prev[index] };
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(stepsStorageKey, JSON.stringify(next));
        } catch {
          // Ignore storage quota errors
        }
      }
      return next;
    });
  };

  const members = household.members || [];
  const approvals = returnVersion?.approvals || [];

  const totalGuideSteps = filingPackage?.myGuichetGuide.length ?? 0;
  const doneGuideSteps = filingPackage
    ? filingPackage.myGuichetGuide.filter((s) => completedSteps[s.sectionIndex]).length
    : 0;

  return (
    <div className="space-y-6">
      <ToastBanner
        feedback={feedback}
        onDismiss={() => setFeedback(null)}
        action={
          feedback?.message.includes('calculated before approving') && onNavigateToCalculator ? (
            <button
              type="button"
              onClick={onNavigateToCalculator}
              className="text-xs font-bold underline hover:text-rose-950 dark:hover:text-rose-100"
            >
              Go to Tax Calculator now &rarr;
            </button>
          ) : undefined
        }
      />

      {/* Step Progress Summary */}
      <div className="no-print grid gap-3 sm:grid-cols-3">
        {[
          {
            step: '1',
            title: 'Spousal Approvals',
            done: Boolean(returnVersion?.bothSpousesApproved),
            subtitle: returnVersion?.bothSpousesApproved
              ? 'All required filers approved'
              : 'Review calculation & approve version',
          },
          {
            step: '2',
            title: 'Form 100 Package',
            done: Boolean(filingPackage),
            subtitle: filingPackage
              ? `${filingPackage.form100Boxes.length} boxes mapped`
              : 'Generate official box mappings',
          },
          {
            step: '3',
            title: 'MyGuichet Transfer',
            done: totalGuideSteps > 0 && doneGuideSteps === totalGuideSteps,
            subtitle:
              totalGuideSteps > 0
                ? `${doneGuideSteps} of ${totalGuideSteps} sections completed`
                : 'Available after package generation',
          },
        ].map((item) => (
          <div
            key={item.step}
            className={`flex items-center gap-3 rounded-2xl border p-4 shadow-xs dark:shadow-none ${
              item.done
                ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-800/70 dark:bg-emerald-950/35'
                : 'border-slate-200/90 bg-white dark:border-zinc-800 dark:bg-[#161920]'
            }`}
          >
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                item.done ? 'bg-emerald-600 text-white dark:bg-emerald-500' : 'bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-300'
              }`}
            >
              {item.done ? <Check className="h-4 w-4" aria-hidden="true" /> : item.step}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 dark:text-zinc-100">{item.title}</p>
              <p className="truncate text-[11px] text-slate-500 dark:text-zinc-400">{item.subtitle}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Dual Spouse Approval Section */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#161920] dark:shadow-none">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center dark:border-zinc-800">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="flex items-center gap-1.5 text-base font-bold text-slate-900 dark:text-zinc-50">
                <span>Joint Household Return Approval</span>
                <HelpTip id="approval" />
              </h3>
              {returnVersion?.bothSpousesApproved && (
                <StatusBadge tone="success">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  <span>Ready to File</span>
                </StatusBadge>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
              In accordance with Luxembourg tax law, filers must review and approve the exact return version before filing to ACD.
            </p>
          </div>

          <button
            type="button"
            onClick={handleApprove}
            disabled={approving || Boolean(returnVersion?.bothSpousesApproved)}
            className={`no-print inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-5 py-2.5 text-xs font-bold transition ${
              returnVersion?.bothSpousesApproved
                ? 'cursor-default border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/45 dark:text-emerald-300'
                : 'bg-zinc-950 text-white shadow-xs hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200'
            }`}
          >
            {approving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>
              {approving
                ? 'Registering Approval...'
                : returnVersion?.bothSpousesApproved
                  ? 'All Approvals Recorded'
                  : 'Approve Return Version'}
            </span>
          </button>
        </div>

        {/* Member Approval Status Cards */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {members.map((member) => {
            const hasApproved = approvals.some((a) => a.userId === member.userId && !a.isSuperseded);
            const approvalRecord = approvals.find(
              (a) => a.userId === member.userId && !a.isSuperseded,
            );

            return (
              <div
                key={member.id}
                className={`rounded-xl border p-4 transition-colors ${
                  hasApproved
                    ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/70 dark:bg-emerald-950/30'
                    : 'border-slate-200 bg-slate-50/60 dark:border-zinc-800 dark:bg-zinc-900/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        hasApproved
                          ? 'bg-emerald-600 text-white dark:bg-emerald-500'
                          : 'bg-slate-200 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}
                    >
                      {hasApproved ? <Check className="h-4 w-4" aria-hidden="true" /> : '•'}
                    </div>
                    <div className="min-w-0">
                      <h4 className="truncate text-xs font-bold text-slate-900 dark:text-zinc-100">
                        {member.user?.email || member.userId.substring(0, 8)}
                      </h4>
                      <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                        {member.role.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>

                  <StatusBadge tone={hasApproved ? 'success' : 'neutral'}>
                    {hasApproved ? 'Approved' : 'Pending Approval'}
                  </StatusBadge>
                </div>

                {hasApproved && approvalRecord && (
                  <p className="tabular-nums mt-2.5 text-[11px] text-emerald-800 dark:text-emerald-300">
                    Approved on: {new Date(approvalRecord.approvedAt).toLocaleString()}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Version History Section */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#161920] dark:shadow-none">
        <div className="border-b border-slate-100 pb-4 dark:border-zinc-800">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-slate-900 dark:text-zinc-50">Version history</h3>
            {workspace.status === WorkspaceStatus.FILED && (
              <StatusBadge tone="indigo">
                <Lock className="h-3 w-3" aria-hidden="true" />
                <span>Filed &amp; frozen</span>
              </StatusBadge>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
            A change to a material fact, questionnaire answer, document or calculation supersedes existing
            approvals and opens a new draft version.
          </p>
          {workspace.status === WorkspaceStatus.FILED && (
            <p className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
              The filed version snapshot is immutable. Material changes after filing require an
              amendment rather than an edit of the filed version.
            </p>
          )}
        </div>

        {history === null ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-500 dark:border-zinc-700 dark:text-zinc-400">
            <p className="text-xs">
              {historyLoaded ? 'Version history is not available right now.' : 'Loading version history…'}
            </p>
          </div>
        ) : history.versions.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-500 dark:border-zinc-700 dark:text-zinc-400">
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
                      ? 'border-sky-300 bg-sky-50/30 ring-2 ring-sky-100 dark:border-sky-700/80 dark:bg-sky-950/25 dark:ring-sky-900/40'
                      : 'border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/40'
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                          Version {item.versionNumber}
                        </h4>
                        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                        {item.isCurrent && (
                          <StatusBadge tone="info">Current version</StatusBadge>
                        )}
                      </div>
                      <p className="tabular-nums mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
                        {item.createdAt
                          ? `Created ${new Date(item.createdAt).toLocaleDateString()}`
                          : 'Draft not yet approved — no version snapshot exists.'}
                      </p>
                    </div>

                    <div className="text-xs text-slate-600 sm:text-right dark:text-zinc-400">
                      <p>
                        Final tax liability:{' '}
                        <span className="tabular-nums font-bold text-slate-900 dark:text-zinc-100">
                          {typeof item.finalTaxLiability === 'number'
                            ? formatEuro(item.finalTaxLiability)
                            : 'Not available until approved'}
                        </span>
                      </p>
                      <p className="mt-0.5">
                        Filing package:{' '}
                        <span
                          className={`font-bold ${
                            item.packageGenerated ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-zinc-400'
                          }`}
                        >
                          {item.packageGenerated ? 'Generated' : 'Not generated'}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1.5">
                    {item.approvals.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-2.5 text-[11px] text-slate-500 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-400">
                        {item.status === 'DRAFT'
                          ? 'No approvals yet — this draft still needs approval from all required approvers.'
                          : 'No approvals were recorded for this version.'}
                      </p>
                    ) : (
                      item.approvals.map((approval) => (
                        <div
                          key={approval.id}
                          className={`rounded-xl border p-2.5 text-[11px] ${
                            approval.isSuperseded
                              ? 'border-amber-200 bg-amber-50/70 dark:border-amber-800/70 dark:bg-amber-950/35'
                              : 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/70 dark:bg-emerald-950/35'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className="font-semibold text-slate-800 dark:text-zinc-200">
                              {approval.userEmail || approval.userId.substring(0, 8)}
                            </span>
                            <span className="tabular-nums text-slate-500 dark:text-zinc-400">
                              Approved {new Date(approval.approvedAt).toLocaleString()}
                            </span>
                          </div>
                          {approval.isSuperseded && (
                            <p className="mt-1 font-medium text-amber-800 dark:text-amber-300">
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
      <div className="rounded-2xl border border-zinc-200/85 bg-white p-5 shadow-[0_1px_2px_rgba(9,9,11,0.03)] sm:p-6 dark:border-zinc-800 dark:bg-[#161920] dark:shadow-none">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="flex items-center gap-1.5 text-base font-bold text-zinc-950 dark:text-zinc-50">
              <span>Form 100 Box Mappings &amp; MyGuichet Transfer Guide</span>
              <HelpTip id="filingRoute" />
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Generates the official Luxembourg Form 100 boxes and step-by-step transfer guide for filing online.
            </p>
          </div>

          <button
            type="button"
            onClick={handleGeneratePackage}
            disabled={generating}
            className="no-print inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-zinc-950 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            {generating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Package className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{generating ? 'Generating Package...' : 'Generate Filing Package'}</span>
          </button>
        </div>

        {filingPackage ? (
          <div className="mt-6 space-y-6">
            {/* Hash & Verification Banner */}
            <div className="flex flex-col justify-between gap-3 rounded-xl border border-zinc-200/90 bg-zinc-50 p-4 font-mono text-xs text-zinc-900 sm:flex-row sm:items-center dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 dark:text-emerald-400" aria-hidden="true" />
                <span className="font-sans font-semibold text-zinc-700 dark:text-zinc-300">
                  Package SHA-256 Checksum <HelpTip id="packageChecksum" />
                </span>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <span className="max-w-xs truncate font-bold text-zinc-950 sm:max-w-md dark:text-zinc-100">
                  {filingPackage.packageSha256}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy('sha256', filingPackage.packageSha256)}
                  aria-label="Copy package checksum"
                  className="no-print inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 font-sans text-[11px] font-semibold text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  {copiedBox === 'sha256' ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" aria-hidden="true" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Form 100 Boxes Table + Mobile Cards */}
            <div>
              <h4 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-zinc-950 dark:text-zinc-50">
                <span>Official Form 100 Box Values</span>
                <HelpTip id="formBox" />
                <span className="tabular-nums text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  ({filingPackage.form100Boxes.length} fields mapped)
                </span>
              </h4>
              {(filingPackage.unsupportedCertificateCodes ?? []).length > 0 && (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/35 dark:text-amber-200">
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

              {/* Mobile Form 100 Box Cards */}
              <div className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 md:hidden dark:divide-zinc-800 dark:border-zinc-800">
                {filingPackage.form100Boxes.map((box, i) => (
                  <div key={i} className="space-y-2 p-3.5 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono font-bold text-sky-800 dark:text-sky-400">
                          {box.sheet ?? (box as any).boxNumber ?? ''} · case {box.caseNumber ?? 'n/a'}
                        </span>
                        <span className="ml-2 text-[11px] text-zinc-400 dark:text-zinc-500">Page {box.pageNumber}</span>
                        {box.personName && (
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{box.personName}</p>
                        )}
                      </div>
                      <span className="tabular-nums font-extrabold text-zinc-950 dark:text-zinc-50">
                        {formatEuro(box.amount)}
                      </span>
                    </div>
                    <p className="font-medium text-zinc-800 dark:text-zinc-200">{box.labelFr}</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{box.labelDe}</p>
                    <div className="no-print flex items-center justify-between pt-1">
                      {box.kind && box.kind !== 'FORM_100' ? (
                        <StatusBadge tone="warning">{box.kind}</StatusBadge>
                      ) : (
                        <span />
                      )}
                      {box.kind === 'FORM_100' || !box.kind ? (
                        <button
                          type="button"
                          onClick={() => handleCopy(String(i), box.amount)}
                          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                            copiedBox === String(i)
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-300'
                              : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                          }`}
                        >
                          {copiedBox === String(i) ? (
                            <>
                              <Check className="h-3 w-3" aria-hidden="true" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" aria-hidden="true" />
                              <span>Copy value</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <StatusBadge tone="neutral">Auto</StatusBadge>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 md:block dark:border-zinc-800">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                    <tr>
                      <th className="px-4 py-2.5">Sheet / Case</th>
                      <th className="px-4 py-2.5">Page</th>
                      <th className="px-4 py-2.5">French Description</th>
                      <th className="px-4 py-2.5">German Description</th>
                      <th className="px-4 py-2.5 text-right">Value (EUR)</th>
                      <th className="no-print px-4 py-2.5 text-center">Copy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                    {filingPackage.form100Boxes.map((box, i) => (
                      <tr key={i} className="hover:bg-slate-50/70 dark:hover:bg-zinc-800/40">
                        <td className="px-4 py-2.5 font-mono font-bold text-sky-800 dark:text-sky-400">
                          {box.sheet ?? (box as any).boxNumber ?? ''} · case {box.caseNumber ?? 'n/a'}
                          {box.kind && box.kind !== 'FORM_100' && (
                            <StatusBadge tone="warning" className="ml-2 font-sans">
                              {box.kind}
                            </StatusBadge>
                          )}
                          {box.personName && (
                            <span className="mt-0.5 block font-sans text-[10px] font-normal text-slate-400 dark:text-zinc-500">
                              {box.personName}
                            </span>
                          )}
                        </td>
                        <td className="tabular-nums px-4 py-2.5 text-slate-500 dark:text-zinc-400">
                          Page {box.pageNumber}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-zinc-200">{box.labelFr}</td>
                        <td className="px-4 py-2.5 text-slate-500 dark:text-zinc-400">{box.labelDe}</td>
                        <td className="tabular-nums px-4 py-2.5 text-right font-bold text-slate-900 dark:text-zinc-50">
                          {formatEuro(box.amount)}
                        </td>
                        <td className="no-print px-4 py-2.5 text-center">
                          {box.kind === 'FORM_100' || !box.kind ? (
                            <button
                              type="button"
                              onClick={() => handleCopy(String(i), box.amount)}
                              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                                copiedBox === String(i)
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-300'
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                              }`}
                            >
                              {copiedBox === String(i) ? (
                                <>
                                  <Check className="h-3 w-3" aria-hidden="true" />
                                  <span>Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" aria-hidden="true" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          ) : (
                            <span className="text-[10px] font-semibold uppercase text-slate-400 dark:text-zinc-500">
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
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-zinc-50">
                  <FileCheck2 className="h-4 w-4 text-sky-700 dark:text-sky-400" aria-hidden="true" />
                  <span>MyGuichet.lu Step-by-Step Filing Walkthrough</span>
                </h4>
                {totalGuideSteps > 0 && (
                  <span className="tabular-nums text-xs font-semibold text-slate-500 dark:text-zinc-400">
                    {doneGuideSteps} / {totalGuideSteps} steps completed
                  </span>
                )}
              </div>

              <div className="space-y-3">
                {filingPackage.annexes.length > 0 && (
                  <div className="rounded-2xl border border-zinc-200/90 bg-zinc-50/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-zinc-950 dark:text-zinc-50">
                          Required ACD annexes ({filingPackage.annexes.length})
                        </h3>
                        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                          The app supplies the values; the official annex PDF is not generated. Carry them into the corresponding ACD annex.
                        </p>
                      </div>
                      <div className="no-print flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={handleDownloadAnnex}
                          disabled={downloadingPdf}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
                        >
                          {downloadingPdf ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <Download className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          <span>Download annex PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => window.print()}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-bold text-zinc-800 shadow-2xs transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Print</span>
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3">
                      {filingPackage.annexes.map((annex) => (
                        <div key={annex.code} className="rounded-xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-[#161920]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-zinc-100">
                              {annex.code} — {annex.title}
                            </span>
                            <StatusBadge tone="warning">preparation sheet</StatusBadge>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-600 dark:text-zinc-400">{annex.reason}</p>
                          <div className="mt-2.5 grid gap-1.5 text-[11px] sm:grid-cols-2">
                            {annex.fields.map((f) => (
                              <div key={f.label} className="flex justify-between border-b border-slate-100 py-1 dark:border-zinc-800">
                                <span className="text-slate-500 dark:text-zinc-400">{f.label}</span>
                                <span className="tabular-nums font-semibold text-slate-900 dark:text-zinc-100">{f.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {filingPackage.myGuichetGuide.map((step) => {
                  const isDone = !!completedSteps[step.sectionIndex];
                  return (
                    <div
                      key={step.sectionIndex}
                      className={`rounded-xl border p-4 text-xs transition-colors ${
                        isDone
                          ? 'border-emerald-200 bg-emerald-50/30 dark:border-emerald-800/70 dark:bg-emerald-950/25'
                          : 'border-slate-200 bg-white dark:border-zinc-800 dark:bg-[#161920]'
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <h5 className="text-sm font-bold text-slate-900 dark:text-zinc-100">{step.sectionTitle}</h5>
                        <label className="no-print flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700 dark:text-zinc-300">
                          <input
                            type="checkbox"
                            checked={isDone}
                            onChange={() => toggleStep(step.sectionIndex)}
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-zinc-600 dark:bg-zinc-900"
                          />
                          <span>Completed on MyGuichet</span>
                        </label>
                      </div>

                      <ul className="mb-3 list-inside list-disc space-y-1 text-slate-600 dark:text-zinc-400">
                        {step.instructions.map((inst, idx) => (
                          <li key={idx}>{inst}</li>
                        ))}
                      </ul>

                      {step.fieldsToEnter.length > 0 && (
                        <div className="mt-2 grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2 dark:bg-zinc-900/60">
                          {step.fieldsToEnter.map((f, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-[#161920]"
                            >
                              <div className="min-w-0 pr-2">
                                <span className="font-mono font-bold text-sky-800 dark:text-sky-400">{f.form100Box}</span>
                                <p className="truncate text-[11px] text-slate-600 dark:text-zinc-400">{f.fieldLabel}</p>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <span className="tabular-nums font-bold text-slate-900 dark:text-zinc-100">
                                  {formatEuro(f.value)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(f.form100Box, f.value)}
                                  className="no-print inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                                >
                                  {copiedBox === f.form100Box ? (
                                    <Check className="h-3 w-3 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                                  ) : (
                                    'Copy'
                                  )}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-500 dark:border-zinc-700 dark:text-zinc-400">
            <p className="text-xs">
              Once you approve the return version above, click &quot;Generate Filing Package&quot; to inspect your Form 100 boxes.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
