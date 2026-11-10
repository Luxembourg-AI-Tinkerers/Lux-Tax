'use client';

import React, { useState, useEffect } from 'react';
import { apiClient } from '../lib/api';
import { formatEuro } from '../lib/money';
import {
  AssessmentDto,
  CreateFilingRecordDto,
  FilingRecordDto,
  FilingRoute,
  TaxYearWorkspaceDto,
  UpdateAssessmentFollowUpDto,
} from '@luxtax/contracts';

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

interface AssessmentViewProps {
  workspace: TaxYearWorkspaceDto;
  onRefresh: () => void;
}

export function AssessmentView({ workspace, onRefresh }: AssessmentViewProps) {
  const [assessment, setAssessment] = useState<AssessmentDto | null>(null);
  const [bulletinDate, setBulletinDate] = useState('2026-09-01');
  const [assessedIncome, setAssessedIncome] = useState('');
  const [assessedTax, setAssessedTax] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [rollingOver, setRollingOver] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filing record: recording freezes the return version, so it is written once.
  const [filingRecord, setFilingRecord] = useState<FilingRecordDto | null>(null);
  const [filedAt, setFiledAt] = useState(todayIsoDate);
  const [filingRoute, setFilingRoute] = useState<FilingRoute>(FilingRoute.MYGUICHET_MANUAL);
  const [confirmationReference, setConfirmationReference] = useState('');
  const [filingNotes, setFilingNotes] = useState('');
  const [recording, setRecording] = useState(false);

  // Assessment follow-up dates; an empty input means "no date known / leave unchanged".
  const [objectionDeadline, setObjectionDeadline] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');
  const [isFinal, setIsFinal] = useState(false);
  const [savingFollowUp, setSavingFollowUp] = useState(false);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5000);
  };

  const loadAssessment = async () => {
    const [assessmentRes, filingRecordRes] = await Promise.all([
      apiClient.getAssessment(workspace.id),
      apiClient.getFilingRecord(workspace.id),
    ]);

    // A successful `null` is authoritative: an unfiled workspace must not keep
    // the previous workspace's filing record on screen.
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
    // Never seed the follow-up editor from another tax year's assessment.
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
      // The follow-up fields are separate state, filled only by the initial
      // load. Without this the freshly computed objection deadline and
      // follow-up date stayed blank until the page was reloaded.
      setObjectionDeadline(toDateInputValue(res.data.objectionDeadline));
      setFollowUpAt(toDateInputValue(res.data.followUpAt));
      showFeedback('success', 'Official ACD Bulletin imported & discrepancy reconciliation generated!');
      onRefresh();
    }
  };

  const handleRollover = async () => {
    if (!confirm(`Roll forward profile and dependants into the ${workspace.taxYear + 1} tax year?`)) return;
    setRollingOver(true);

    const res = await apiClient.rolloverToNextYear(workspace.id);
    setRollingOver(false);

    if (res.error) {
      showFeedback('error', res.error);
    } else if (res.data) {
      showFeedback(
        'success',
        `✓ Successfully rolled over into tax year ${res.data.nextTaxYear}! Switch years using the tax year selector.`
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
      // An unapproved workspace, a second record or an already frozen version
      // all surface here: the API is the authority on whether filing is allowed.
      showFeedback('error', res.error);
    } else if (res.data) {
      setFilingRecord(res.data);
      setConfirmationReference('');
      setFilingNotes('');
      showFeedback(
        'success',
        typeof res.data.versionNumber === 'number'
          ? `✓ Filing recorded — return version ${res.data.versionNumber} is now frozen.`
          : '✓ Filing recorded — the return version snapshot is now frozen.',
      );
      onRefresh();
    }
  };

  const handleSaveFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assessment) return;
    setSavingFollowUp(true);

    // Empty inputs are omitted: the API rejects an empty date string, and an
    // omitted date leaves the stored value untouched.
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
      showFeedback('success', '✓ Assessment follow-up dates saved.');
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
          <button onClick={() => setFeedback(null)} className="text-xs opacity-60 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* Filing Record & Freeze Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-bold text-slate-900">Filing record &amp; freeze</h3>
          {filingRecord && (
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-800">
              🔒 Filed &amp; frozen
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          Record the submission once the declaration has reached the ACD. Recording freezes the
          matching return version, so a later correction must start an amendment instead of editing
          this snapshot.
        </p>

        {filingRecord ? (
          <div className="mt-5 space-y-4">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Filed on
                </dt>
                <dd className="mt-0.5 text-xs font-bold text-slate-900">{filingRecord.filedAt}</dd>
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
                <dd className="mt-0.5 text-xs font-bold text-slate-900">
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

            <p className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 text-[11px] font-medium text-indigo-900">
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
                className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Filed on
              </label>
              <input
                id="filing-filed-at"
                type="date"
                required
                value={filedAt}
                onChange={(e) => setFiledAt(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium"
              />
            </div>

            <div>
              <label
                htmlFor="filing-route"
                className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Filing route
              </label>
              <select
                id="filing-route"
                value={filingRoute}
                onChange={(e) => setFilingRoute(e.target.value as FilingRoute)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium"
              >
                <option value={FilingRoute.MYGUICHET_MANUAL}>MyGuichet (manual entry)</option>
                <option value={FilingRoute.PAPER}>Paper Form 100</option>
                <option value={FilingRoute.OTHER}>Other channel</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="filing-confirmation-reference"
                className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700"
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
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium"
              />
            </div>

            <div>
              <label
                htmlFor="filing-notes"
                className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700"
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
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium"
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
                className="rounded-lg bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
              >
                {recording ? 'Recording filing...' : 'Record filing & freeze this version'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Annual Rollover Card */}
      <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-800">
              Tax Year Transition
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-1">
              Roll Over to Next Tax Year ({workspace.taxYear + 1})
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Copy reusable household data, dependants, and employer details into the {workspace.taxYear + 1} workspace. All data requires reconfirmation.
            </p>
          </div>

          <button
            onClick={handleRollover}
            disabled={rollingOver}
            className="rounded-lg bg-sky-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-sky-500 disabled:opacity-50 transition-colors"
          >
            {rollingOver ? 'Rolling Over...' : `📅 Start ${workspace.taxYear + 1} Workspace`}
          </button>
        </div>
      </div>

      {/* Import Assessment Form */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-1">
          Import ACD Tax Assessment Notice (Bulletin d&apos;imposition)
        </h3>
        <p className="text-xs text-slate-500 mb-6">
          Compare the official tax assessment received from the Administration des contributions directes against your filed declaration.
        </p>

        <form onSubmit={handleImport} className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              Bulletin Notice Date
            </label>
            <input
              type="date"
              required
              value={bulletinDate}
              onChange={(e) => setBulletinDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              Assessed Taxable Income (€)
            </label>
            <input
              type="number"
              step="0.01"
              required
              placeholder="e.g. 58200"
              value={assessedIncome}
              onChange={(e) => setAssessedIncome(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              Official Tax Due (€)
            </label>
            <input
              type="number"
              step="0.01"
              required
              placeholder="e.g. 8450"
              value={assessedTax}
              onChange={(e) => setAssessedTax(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium"
            />
          </div>

          <div className="sm:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50 transition"
            >
              {submitting ? 'Comparing with Return...' : '🔍 Import & Compare Assessment'}
            </button>
          </div>
        </form>
      </div>

      {/* Discrepancy Breakdown Section */}
      {assessment && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Bulletin Notice Date: {new Date(assessment.bulletinDate).toLocaleDateString()}
              </span>
              <h4 className="text-lg font-bold text-slate-900 mt-0.5">
                Assessment Variance: {formatEuro(Math.abs(assessment.differenceWithDeclared))}{' '}
                {assessment.differenceWithDeclared > 0
                  ? '(ACD Tax Due Higher)'
                  : assessment.differenceWithDeclared < 0
                  ? '(ACD Refund Higher)'
                  : '(Exact Match)'}
              </h4>
            </div>

            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                assessment.differenceWithDeclared === 0
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {assessment.differenceWithDeclared === 0 ? '✓ In Full Agreement' : '⚠ Discrepancies Detected'}
            </span>
          </div>

          {assessment.discrepancies.length > 0 && (
            <div className="space-y-3">
              <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Discrepancy Line-Items
              </h5>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {assessment.discrepancies.map((d, i) => (
                  <div key={i} className="flex items-center justify-between p-3.5 text-xs">
                    <div>
                      <p className="font-bold text-slate-900">{d.field}</p>
                      <span className="text-slate-500">{d.notes}</span>
                    </div>
                    <div className="text-right space-y-0.5">
                      <div>
                        <span className="text-slate-400">Declared:</span> {formatEuro(d.declaredValue)} |{' '}
                        <span className="text-slate-400">ACD:</span> {formatEuro(d.assessedValue)}
                      </div>
                      <span
                        className={`font-bold ${
                          d.difference > 0 ? 'text-rose-600' : 'text-emerald-600'
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
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-slate-900">Post-filing follow-up</h3>
            {assessment.isFinal && (
              <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-bold text-white">
                Final assessment
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Objection window and internal follow-up of this assessment. Both dates are the values
            the API returned when the notice was imported (objection: +3 months, follow-up: +30
            days from the bulletin date); an empty field is not sent and leaves the stored date
            unchanged.
          </p>

          <form onSubmit={handleSaveFollowUp} className="mt-5 grid gap-4 sm:grid-cols-3">
            <div>
              <label
                htmlFor="objection-deadline"
                className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Objection deadline
              </label>
              <input
                id="objection-deadline"
                type="date"
                value={objectionDeadline}
                onChange={(e) => setObjectionDeadline(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium"
              />
            </div>

            <div>
              <label
                htmlFor="assessment-follow-up-at"
                className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Follow-up date
              </label>
              <input
                id="assessment-follow-up-at"
                type="date"
                value={followUpAt}
                onChange={(e) => setFollowUpAt(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium"
              />
            </div>

            <div className="flex items-end pb-1">
              <label
                htmlFor="assessment-is-final"
                className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-700"
              >
                <input
                  id="assessment-is-final"
                  type="checkbox"
                  checked={isFinal}
                  onChange={(e) => setIsFinal(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Assessment is final
              </label>
            </div>

            <div className="flex justify-end sm:col-span-3">
              <button
                type="submit"
                disabled={savingFollowUp}
                className="rounded-lg bg-slate-800 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-50"
              >
                {savingFollowUp ? 'Saving...' : 'Save follow-up dates'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
