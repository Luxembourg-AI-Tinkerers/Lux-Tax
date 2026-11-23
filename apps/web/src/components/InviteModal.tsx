'use client';

import React, { useState } from 'react';
import { Check, Copy, Loader2, MailCheck, UserPlus } from 'lucide-react';
import { apiClient } from '../lib/api';
import { HouseholdRole } from '@luxtax/contracts';
import { Modal } from './ui/Modal';

interface InviteModalProps {
  householdId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function InviteModal({ householdId, isOpen, onClose, onSuccess }: InviteModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<HouseholdRole>(HouseholdRole.CO_FILER);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [invitationLink, setInvitationLink] = useState('');
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await apiClient.inviteMember(householdId, { email, role });
    setLoading(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    if (res.data?.invitationToken) {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      setInvitationLink(`${origin}/invite/${res.data.invitationToken}`);
      onSuccess();
    }
  };

  const handleCopy = () => {
    if (invitationLink) {
      navigator.clipboard?.writeText(invitationLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      titleId="invite-modal-title"
      title="Invite Household Co-Filer"
      subtitle="Spouses have separate accounts and collaborate on the same joint return."
      icon={<UserPlus className="h-4.5 w-4.5" aria-hidden="true" />}
      closeLabel="Close invite dialog"
      maxWidthClass="max-w-md"
    >
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 dark:border-rose-800/70 dark:bg-rose-950/55 dark:text-rose-200"
        >
          {error}
        </div>
      )}

      {invitationLink ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-900 dark:border-emerald-800/70 dark:bg-emerald-950/55 dark:text-emerald-200">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <div>
              <p className="font-bold">Invitation Created Successfully</p>
              <p className="mt-0.5 text-emerald-800 dark:text-emerald-300">
                Share this secure, single-use link with your spouse:
              </p>
            </div>
          </div>

          <div className="break-all rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800 select-all dark:border-zinc-800 dark:bg-[#12151b] dark:text-zinc-200">
            {invitationLink}
          </div>

          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-zinc-800 active:scale-[0.98] dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Link Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Copy Link</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setInvitationLink('');
                setEmail('');
                setCopied(false);
                onClose();
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="invite-email"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400"
            >
              Spouse&apos;s Email
            </label>
            <input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="spouse@example.lu"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-base text-zinc-950 placeholder:text-zinc-400 transition focus:border-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950/10 sm:text-sm dark:border-zinc-700/80 dark:bg-[#12151b] dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400 dark:focus:ring-sky-400/20"
            />
          </div>

          <div>
            <label
              htmlFor="invite-role"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400"
            >
              Role
            </label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as HouseholdRole)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-base text-zinc-950 transition focus:border-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950/10 sm:text-sm dark:border-zinc-700/80 dark:bg-[#12151b] dark:text-zinc-100 dark:focus:border-sky-400 dark:focus:ring-sky-400/20"
            >
              <option value={HouseholdRole.CO_FILER}>Co-Filer (Equal joint return rights)</option>
              <option value={HouseholdRole.VIEWER}>Viewer (Read-only)</option>
            </select>
          </div>

          <div className="flex gap-2.5 border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              <span>{loading ? 'Sending...' : 'Generate Invite Link'}</span>
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
