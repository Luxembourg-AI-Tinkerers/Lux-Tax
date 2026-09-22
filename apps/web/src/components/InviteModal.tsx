'use client';

import React, { useState } from 'react';
import { apiClient } from '../lib/api';
import { HouseholdRole } from '@luxtax/contracts';

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

  if (!isOpen) return null;

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
      navigator.clipboard.writeText(invitationLink);
      alert('Invitation link copied to clipboard!');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-slate-100">
        <h3 className="text-lg font-bold text-slate-900 mb-1">Invite Household Co-Filer</h3>
        <p className="text-xs text-slate-500 mb-5">
          Spouses have separate accounts but can collaborate on the same joint return.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs">
            {error}
          </div>
        )}

        {invitationLink ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-800">
              <p className="font-semibold mb-1">Invitation Created Successfully!</p>
              <p>Share this secure, single-use link with your spouse:</p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono break-all text-slate-800">
              {invitationLink}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-medium text-xs transition"
              >
                Copy Link
              </button>
              <button
                onClick={() => {
                  setInvitationLink('');
                  setEmail('');
                  onClose();
                }}
                className="py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium text-xs transition"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                Spouse's Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="spouse@example.lu"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as HouseholdRole)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
              >
                <option value={HouseholdRole.CO_FILER}>Co-Filer (Equal joint return rights)</option>
                <option value={HouseholdRole.VIEWER}>Viewer (Read-only)</option>
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium text-xs transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-medium text-xs transition shadow-sm disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Generate Invite Link'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
