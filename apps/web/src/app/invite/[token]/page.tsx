'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../lib/auth-context';
import { InvitationDetailsDto } from '@luxtax/contracts';

export default function InviteAcceptancePage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const token = params?.token as string;

  const [details, setDetails] = useState<InvitationDetailsDto | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) return;

    apiClient.getInvitationDetails(token).then((res) => {
      setLoading(false);
      if (res.error) {
        setError(res.error);
      } else if (res.data) {
        setDetails(res.data);
      }
    });
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    setError('');

    const res = await apiClient.acceptInvitation({ token });
    setAccepting(false);

    if (res.error) {
      setError(res.error);
    } else if (res.data) {
      router.push(`/${res.data.id}/dashboard`);
    }
  };

  if (loading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent mx-auto mb-2" />
          <p className="text-slate-500 text-sm">Verifying invitation...</p>
        </div>
      </div>
    );
  }

  if (error || !details?.isValid) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-100 text-center">
          <div className="h-12 w-12 rounded-xl bg-rose-50 text-rose-600 font-bold text-xl inline-flex items-center justify-center mb-4">
            !
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Invitation Invalid or Expired</h2>
          <p className="text-sm text-slate-500 mb-6">
            {error || 'This household invitation link is either expired, already accepted, or revoked.'}
          </p>
          <Link
            href="/login"
            className="inline-block py-2.5 px-5 rounded-xl bg-sky-600 text-white font-medium text-sm hover:bg-sky-700 transition"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
        <div className="text-center mb-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-sky-600 font-bold text-xl mb-3">
            LT
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Joint Household Invitation</h1>
          <p className="text-sm text-slate-500 mt-1">
            <strong>{details.inviterName}</strong> has invited you to collaborate as a{' '}
            <span className="font-semibold text-sky-600">{details.invitedRole}</span> on the{' '}
            <strong>{details.householdName}</strong> tax workspace.
          </p>
        </div>

        <div className="p-4 bg-slate-50 rounded-xl mb-6 text-xs text-slate-600 space-y-1.5 border border-slate-100">
          <p>
            <span className="font-medium text-slate-800">Target Email:</span> {details.invitedEmail}
          </p>
          <p>
            <span className="font-medium text-slate-800">Role:</span> {details.invitedRole}
          </p>
          <p>
            <span className="font-medium text-slate-800">Expires:</span>{' '}
            {new Date(details.expiresAt).toLocaleDateString()}
          </p>
        </div>

        {user ? (
          <div>
            <p className="text-sm text-slate-600 mb-4 text-center">
              Signed in as <strong className="text-slate-900">{user.email}</strong>.
            </p>
            <button
              onClick={handleAccept}
              disabled={accepting}
              className="w-full py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-medium text-sm transition shadow-sm disabled:opacity-50"
            >
              {accepting ? 'Joining Household...' : 'Accept Invitation & Join Household'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <Link
              href={`/login?redirect=/invite/${token}`}
              className="block text-center w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-medium text-sm transition shadow-sm"
            >
              Sign In to Accept
            </Link>
            <Link
              href={`/register?redirect=/invite/${token}`}
              className="block text-center w-full py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium text-sm transition"
            >
              Create New Account
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
