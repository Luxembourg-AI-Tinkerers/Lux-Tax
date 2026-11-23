'use client';

import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarPlus,
  CheckCircle2,
  Clock,
  FileSearch,
  Loader2,
  Lock,
  Save,
} from 'lucide-react';
import { HelpTip } from './HelpTip';
import { apiClient } from '../lib/api';
import { formatEuro } from '../lib/money';
import {
  AssessmentDto,
  CreateFilingRecordDto,
  FilingRecordDto,
  FilingRoute,
  TaxYearWorkspaceDto,
  UpdateAssessmentFollowUpDto,
  WorkspaceStatus,
} from '@luxtax/contracts';
import { ToastBanner, type ToastMessage } from './ui/ToastBanner';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { StatusBadge } from './ui/StatusBadge';

const FILING_ROUTE_LABELS: Record<FilingRoute, string> = {
  [FilingRoute.MYGUICHET_MANUAL]: 'MyGuichet (manual entry)',
  [FilingRoute.PAPER]: 'Paper Form 100',
  [FilingRoute.OTHER]: 'Other channel',
};

/** Today as a local calendar day; `toISOString()` would shift the day around midnight. */
function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** The API returns ISO instants; a date input only accepts the calendar day. */
function toDateInputValue(value?: string | null): string {
  return value ? value.slice(0, 10) : '';
}

function getDeadlineStatus(isoDate: string): { label: string; tone: 'success' | 'warning' | 'danger' } | null {
  if (!isoDate) return null;
  const target = new Date(`${isoDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date(`${todayIsoDate()}T00:00:00`);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return { label: `Expired ${Math.abs(diffDays)}d ago`, tone: 'danger' };
  if (diffDays === 0) return { label: 'Due today', tone: 'danger' };
  if (diffDays <= 14) return { label: `${diffDays}d remaining`, tone: 'warning' };
  return { label: `${diffDays}d remaining`, tone: 'success' };
}

interface AssessmentViewProps {
  workspace: TaxYearWorkspaceDto;
  onRefresh: () => void;
  onNavigateToFiling?: () => void;
}

export function AssessmentView({
  workspace,
  onRefresh,
  onNavigateToFiling,
}: AssessmentViewProps) {
  const [assessment, setAssessment] = useState<AssessmentDto | null>(null);
  const [bulletinDate, setBulletinDate] = useState('2026-09-01');
  const [assessedIncome, setAssessedIncome] = useState('');
  const [assessedTax, setAssessedTax] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [rollingOver, setRollingOver] = useState(false);
  const [showRolloverConfirm, setShowRolloverConfirm] = useState(false);
  const [feedback, setFeedback] = useState<ToastMessage | null>(null);

  const [filingRecord, setFilingRecord] = useState<FilingRecordDto | null>(null);
  const [filedAt, setFiledAt] = useState(todayIsoDate);
  const [filingRoute, setFilingRoute] = useState<FilingRoute>(FilingRoute.MYGUICHET_MANUAL);
  const [confirmationReference, setConfirmationReference] = useState('');
  const [filingNotes, setFilingNotes] = useState('');
  const [recording, setRecording] = useState(false);

  const [objectionDeadline, setObjectionDeadline] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');
  const [isFinal, setIsFinal] = useState(false);
  const [savingFollowUp, setSavingFollowUp] = useState(false);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback((curr) => (curr?.message === message ? null : curr)), 5000);
  };

  const loadAssessment = async () => {
    const [assessmentRes, filingRecordRes] = await Promise.all([
      apiClient.getAssessment(workspace.id),
      apiClient.getFilingRecord(workspace.id),
    ]);

    if (!filingRecordRes.error) {
      setFilingRecord(filingRecordRes.data ?? null);
    }

    if (assessmentRes.data) {
      const loaded = assessmentRes.data;
      setAssessment(loaded);
      setObjectionDeadline(toDateInputValue(loaded.objectionDeadline));
      setFollowUpAt(toDateInputValue(loaded.followUpAt));
      setIsFinal(loaded.isFinal === true);
    }
  };

  useEffect(() => {
    setAssessment(null);
    setFilingRecord(null);
    void loadAssessment();
  }, [workspace.id]);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const res = await apiClient.importAssessment(workspace.id, {
      taxYear: workspace.taxYear,
      bulletinDate,
      assessedTaxableIncome: assessedIncome,
      assessedTaxDue: assessedTax,
    });
    setSubmitting(false);

    if (res.error) {
      showFeedback('error', res.error);
    } else if (res.data) {
      setAssessment(res.data);
      setObjectionDeadline(toDateInputValue(res.data.objectionDeadline));
      setFollowUpAt(toDateInputValue(res.data.followUpAt));
      showFeedback('success', 'Official ACD Bulletin imported & discrepancy reconciliation generated!');
      onRefresh();
    }
  };

  const handleConfirmRollover = async () => {
    setRollingOver(true);
    const res = await apiClient.rolloverToNextYear(workspace.id);
    setRollingOver(false);
    setShowRolloverConfirm(false);

    if (res.error) {
      showFeedback('error', res.error);
    } else if (res.data) {
      showFeedback(
        'success',
        `Successfully rolled over into tax year ${res.data.nextTaxYear}! Switch years using the tax year selector.`,
      );
      onRefresh();
    }
  };

  const handleRecordFiling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (filingRecord || recording) return;
    setRecording(true);

    const body: CreateFilingRecordDto = {
      filedAt,
      route: filingRoute,
      ...(confirmationReference.trim()
        ? { confirmationReference: confirmationReference.trim() }
        : {}),
      ...(filingNotes.trim() ? { notes: filingNotes.trim() } : {}),
    };

    const res = await apiClient.recordFiling(workspace.id, body);
    setRecording(false);

    if (res.error) {
      showFeedback('error', res.error);
    } else if (res.data) {
      setFilingRecord(res.data);
      setConfirmationReference('');
      setFilingNotes('');
      showFeedback(
        'success',
        typeof res.data.versionNumber === 'number'
          ? `Filing recorded — return version ${res.data.versionNumber} is now frozen.`
          : 'Filing recorded — the return version snapshot is now frozen.',
      );
      onRefresh();
    }
  };

  const handleSaveFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assessment) return;
    setSavingFollowUp(true);

    const body: UpdateAssessmentFollowUpDto = {
      isFinal,
      ...(objectionDeadline ? { objectionDeadline } : {}),
      ...(followUpAt ? { followUpAt } : {}),
    };

    const res = await apiClient.updateAssessmentFollowUp(workspace.id, assessment.id, body);
    setSavingFollowUp(false);

    if (res.error) {
      showFeedback('error', res.error);
    } else if (res.data) {
      setAssessment(res.data);
      setObjectionDeadline(toDateInputValue(res.data.objectionDeadline));
      setFollowUpAt(toDateInputValue(res.data.followUpAt));
      setIsFinal(res.data.isFinal === true);
      showFeedback('success', 'Assessment follow-up dates saved.');
    }
  };

  const isApprovalReadyToFreeze =
    workspace.status === WorkspaceStatus.APPROVED ||
    workspace.status === WorkspaceStatus.FILING_PACKAGE_READY ||
    workspace.status === WorkspaceStatus.FILED;

  const deadlineStatus = !isFinal ? getDeadlineStatus(objectionDeadline) : null;

  const inputClass =
    'w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-base font-medium text-zinc-950 placeholder:text-zinc-400 transition focus:border-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950/10 sm:py-2 sm:text-sm';

  return (
    <div className="space-y-6">
      <ToastBanner feedback={feedback} onDismiss={() => setFeedback(null)} />

      {/* Filing Record & Freeze Card */}
      <div className="rounded-2xl border border-zinc-200/85 bg-white p-6 shadow-[0_1px_2px_rgba(9,9,11,0.03)]">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-bold text-zinc-950">Filing record &amp; freeze</h3>
          {filingRecord && (
            <StatusBadge tone="indigo">
              <Lock className="h-3 w-3" aria-hidden="true" />
              <span>Filed &amp; frozen</span>
            </StatusBadge>
          )}
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Record the submission once the declaration has reached the ACD. Recording freezes the
          matching return version, so a later correction must start an amendment instead of editing
          this snapshot.
        </p>

        {!filingRecord && !isApprovalReadyToFreeze && (
          <div className="mt-4 flex flex-col justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-xs text-amber-950 sm:flex-row sm:items-center">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
              <div>
                <p className="font-bold">
                  Approval required before filing (Current status:{' '}
                  {workspace.status.replace(/_/g, ' ')})
                </p>
                <p className="mt-0.5 text-amber-900/90">
                  A return version must be approved by all required filers before it can be recorded as filed. If you made material edits recently, re-approve the new draft first.
                </p>
              </div>
            </div>
            {onNavigateToFiling && (
              <button
                type="button"
                onClick={onNavigateToFiling}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-zinc-950 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800 active:scale-[0.98]"
              >
                <span>Go to Approvals</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        {filingRecord ? (
          <div className="mt-5 space-y-4">
            <dl className="grid gap-4 rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 sm:grid-cols-2">
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Filed on
                </dt>
                <dd className="tabular-nums mt-0.5 text-xs font-bold text-slate-900">
                  {filingRecord.filedAt}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Filing route
                </dt>
                <dd className="mt-0.5 text-xs font-bold text-slate-900">
                  {FILING_ROUTE_LABELS[filingRecord.route] ?? filingRecord.route}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Confirmation reference
                </dt>
                <dd className="mt-0.5 font-mono text-xs font-bold text-slate-900">
                  {filingRecord.confirmationReference || 'Not provided'}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Filed return version
                </dt>
                <dd className="mt-0.5 text-xs font-bold text-slate-900">
                  {typeof filingRecord.versionNumber === 'number'
                    ? `Version ${filingRecord.versionNumber}`
                    : `Snapshot ${filingRecord.returnVersionId.slice(0, 8)}`}
                </dd>
              </div>
              {filingRecord.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Notes
                  </dt>
                  <dd className="mt-0.5 whitespace-pre-line text-xs font-medium text-slate-700">
                    {filingRecord.notes}
                  </dd>
                </div>
              )}
            </dl>

            <p className="rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 text-xs font-medium text-zinc-700">
              The filed version snapshot is immutable: its facts, calculation and approvals are kept
              exactly as filed. A material change requires an amendment rather than an edit of this
              version.
            </p>
          </div>
        ) : (
          <form onSubmit={handleRecordFiling} className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="filing-filed-at"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600"
              >
                Filed on
              </label>
              <input
                id="filing-filed-at"
                type="date"
                required
                value={filedAt}
                onChange={(e) => setFiledAt(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label
                htmlFor="filing-route"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600"
              >
                Filing route <HelpTip id="filingRoute" />
              </label>
              <select
                id="filing-route"
                value={filingRoute}
                onChange={(e) => setFilingRoute(e.target.value as FilingRoute)}
                className={inputClass}
              >
                <option value={FilingRoute.MYGUICHET_MANUAL}>MyGuichet (manual entry)</option>
                <option value={FilingRoute.PAPER}>Paper Form 100</option>
                <option value={FilingRoute.OTHER}>Other channel</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="filing-confirmation-reference"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600"
              >
                Confirmation reference (optional)
              </label>
              <input
                id="filing-confirmation-reference"
                type="text"
                maxLength={120}
                placeholder="e.g. MyGuichet receipt number"
                value={confirmationReference}
                onChange={(e) => setConfirmationReference(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label
                htmlFor="filing-notes"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600"
              >
                Notes (optional)
              </label>
              <input
                id="filing-notes"
                type="text"
                maxLength={1000}
                placeholder="e.g. posted with the 100F annex"
                value={filingNotes}
                onChange={(e) => setFilingNotes(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] text-slate-500">
                Only an approved return version can be recorded as filed, and only once: the API
                rejects a second record.
              </p>
              <button
                type="submit"
                disabled={recording || !filedAt}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-zinc-950 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
              >
                {recording ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>{recording ? 'Recording filing...' : 'Record filing & freeze this version'}</span>
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Annual Rollover Card */}
      <div className="rounded-2xl border border-zinc-200/85 bg-white p-6 shadow-[0_1px_2px_rgba(9,9,11,0.03)]">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <StatusBadge tone="info">Tax Year Transition</StatusBadge>
            <h3 className="mt-2 flex items-center gap-1.5 text-base font-bold text-zinc-950">
              <span>Roll Over to Next Tax Year ({workspace.taxYear + 1})</span>
              <HelpTip id="rollover" />
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              Copy reusable household data, dependants, and employer details into the {workspace.taxYear + 1} workspace. All figures require reconfirmation.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowRolloverConfirm(true)}
            disabled={rollingOver}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
          >
            <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{rollingOver ? 'Rolling Over...' : `Start ${workspace.taxYear + 1} Workspace`}</span>
          </button>
        </div>
      </div>

      {/* Import Assessment Form */}
      <div className="rounded-2xl border border-zinc-200/85 bg-white p-6 shadow-[0_1px_2px_rgba(9,9,11,0.03)]">
        <h3 className="text-base font-bold text-zinc-950">
          Import ACD Tax Assessment Notice (Bulletin d&apos;imposition)
        </h3>
        <p className="mt-1 mb-6 text-xs text-zinc-500">
          Compare the official tax assessment received from the Administration des contributions directes against your filed declaration.
        </p>

        <form onSubmit={handleImport} className="grid gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="assessment-bulletin-date"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-600"
            >
              Bulletin Notice Date
            </label>
            <input
              id="assessment-bulletin-date"
              type="date"
              required
              value={bulletinDate}
              onChange={(e) => setBulletinDate(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label
              htmlFor="assessment-income"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-600"
            >
              Assessed Taxable Income (€) <HelpTip id="assessmentVariance" />
            </label>
            <input
              id="assessment-income"
              type="number"
              step="0.01"
              required
              placeholder="e.g. 58200"
              value={assessedIncome}
              onChange={(e) => setAssessedIncome(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label
              htmlFor="assessment-tax-due"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-zinc-600"
            >
              Official Tax Due (€)
            </label>
            <input
              id="assessment-tax-due"
              type="number"
              step="0.01"
              required
              placeholder="e.g. 8450"
              value={assessedTax}
              onChange={(e) => setAssessedTax(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="flex justify-end sm:col-span-3">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <FileSearch className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{submitting ? 'Comparing with Return...' : 'Import & Compare Assessment'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Discrepancy Breakdown Section */}
      {assessment && (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
          <div className="mb-4 flex flex-col justify-between gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
            <div>
              <span className="tabular-nums text-xs font-bold uppercase tracking-wider text-slate-500">
                Bulletin Notice Date: {new Date(assessment.bulletinDate).toLocaleDateString()}
              </span>
              <h4 className="tabular-nums mt-0.5 text-lg font-bold text-slate-900">
                Assessment Variance: {formatEuro(Math.abs(assessment.differenceWithDeclared))}{' '}
                {assessment.differenceWithDeclared > 0
                  ? '(ACD Tax Due Higher)'
                  : assessment.differenceWithDeclared < 0
                  ? '(ACD Refund Higher)'
                  : '(Exact Match)'}
              </h4>
            </div>

            <StatusBadge tone={assessment.differenceWithDeclared === 0 ? 'success' : 'warning'}>
              {assessment.differenceWithDeclared === 0 ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>In Full Agreement</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Discrepancies Detected</span>
                </>
              )}
            </StatusBadge>
          </div>

          {assessment.discrepancies.length > 0 && (
            <div className="space-y-3">
              <h5 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Discrepancy Line-Items
              </h5>
              <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                {assessment.discrepancies.map((d, i) => (
                  <div
                    key={i}
                    className="flex flex-col justify-between gap-2 p-4 text-xs sm:flex-row sm:items-center"
                  >
                    <div>
                      <p className="font-bold text-slate-900">{d.field}</p>
                      <span className="text-slate-500">{d.notes}</span>
                    </div>
                    <div className="space-y-0.5 sm:text-right">
                      <div className="tabular-nums">
                        <span className="text-slate-400">Declared:</span> {formatEuro(d.declaredValue)} |{' '}
                        <span className="text-slate-400">ACD:</span> {formatEuro(d.assessedValue)}
                      </div>
                      <span
                        className={`tabular-nums inline-block font-bold ${
                          d.difference > 0 ? 'text-rose-600' : 'text-emerald-700'
                        }`}
                      >
                        Variance: {d.difference > 0 ? '+' : ''}
                        {formatEuro(d.difference)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Post-Filing Follow-Up Card */}
      {assessment && (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-slate-900">Post-filing follow-up</h3>
            {assessment.isFinal && <StatusBadge tone="neutral">Final assessment</StatusBadge>}
            {deadlineStatus && (
              <StatusBadge tone={deadlineStatus.tone}>
                <Clock className="h-3 w-3" aria-hidden="true" />
                <span className="tabular-nums">Objection: {deadlineStatus.label}</span>
              </StatusBadge>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Objection window and internal follow-up of this assessment. Both dates are the values
            the API returned when the notice was imported (objection: +3 months, follow-up: +30
            days from the bulletin date); an empty field is not sent and leaves the stored date
            unchanged.
          </p>

          <form onSubmit={handleSaveFollowUp} className="mt-5 grid gap-4 sm:grid-cols-3">
            <div>
              <label
                htmlFor="objection-deadline"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600"
              >
                Objection deadline <HelpTip id="objectionDeadline" />
              </label>
              <input
                id="objection-deadline"
                type="date"
                value={objectionDeadline}
                onChange={(e) => setObjectionDeadline(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label
                htmlFor="assessment-follow-up-at"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600"
              >
                Follow-up date <HelpTip id="followUpDate" />
              </label>
              <input
                id="assessment-follow-up-at"
                type="date"
                value={followUpAt}
                onChange={(e) => setFollowUpAt(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex items-end pb-1">
              <label
                htmlFor="assessment-is-final"
                className="flex cursor-pointer items-center gap-2.5 text-xs font-bold text-slate-700"
              >
                <input
                  id="assessment-is-final"
                  type="checkbox"
                  checked={isFinal}
                  onChange={(e) => setIsFinal(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Assessment is final</span>
              </label>
            </div>

            <div className="flex justify-end sm:col-span-3">
              <button
                type="submit"
                disabled={savingFollowUp}
                className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
              >
                {savingFollowUp ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>{savingFollowUp ? 'Saving...' : 'Save follow-up dates'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rollover Confirm Dialog */}
      <ConfirmDialog
        isOpen={showRolloverConfirm}
        title={`Roll over into ${workspace.taxYear + 1}?`}
        description={`Copy reusable household profile, dependants, and employer metadata into the ${workspace.taxYear + 1} tax workspace. Financial amounts still require explicit confirmation in the new year.`}
        confirmLabel={`Create ${workspace.taxYear + 1} Workspace`}
        variant="primary"
        busy={rollingOver}
        onConfirm={handleConfirmRollover}
        onCancel={() => setShowRolloverConfirm(false)}
      />
    </div>
  );
}
