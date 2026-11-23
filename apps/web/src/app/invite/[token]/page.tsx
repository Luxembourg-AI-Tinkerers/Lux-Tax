'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Mail,
  Shield,
  UserPlus,
} from 'lucide-react';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../lib/auth-context';
import { InvitationDetailsDto } from '@luxtax/contracts';
import { AuthShell, BrandLogo } from '../../../components/ui/AuthShell';
import { Skeleton } from '../../../components/ui/Skeleton';

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
      <AuthShell>
        <div className="rounded-2xl border border-slate-200/90 bg-white p-8 shadow-xs space-y-4 dark:border-zinc-800/90 dark:bg-[#161920] dark:shadow-none">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      </AuthShell>
    );
  }

  if (error || !details?.isValid) {
    return (
      <AuthShell>
        <div className="rounded-2xl border border-slate-200/90 bg-white p-8 text-center shadow-xs dark:border-zinc-800/90 dark:bg-[#161920] dark:shadow-none">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-200 dark:bg-rose-950/60 dark:text-rose-400 dark:ring-rose-800/60">
            <AlertCircle className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-zinc-50">Invitation Invalid or Expired</h1>
          <p className="mt-2 text-sm text-slate-500 text-pretty dark:text-zinc-400">
            {error || 'This household invitation link is either expired, already accepted, or revoked.'}
          </p>
          <Link
            href="/login"
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
          >
            Go to Sign In
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="rounded-2xl border border-zinc-200/85 bg-white p-6 shadow-[0_1px_3px_rgba(9,9,11,0.05)] sm:p-8 dark:border-zinc-800/90 dark:bg-[#161920] dark:shadow-none">
        <div className="mb-6">
          <div className="mb-5 lg:hidden">
            <BrandLogo />
          </div>
          <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200/70 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700/70">
            <UserPlus className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
            Joint Household Invitation
          </h1>
          <p className="mt-1.5 text-sm text-zinc-600 leading-relaxed text-pretty dark:text-zinc-400">
            <strong className="font-semibold text-zinc-950 dark:text-zinc-100">{details.inviterName}</strong> invited you to collaborate as{' '}
            <span className="font-semibold text-sky-700 dark:text-sky-400">{details.invitedRole.replace(/_/g, ' ')}</span> on the{' '}
            <strong className="font-semibold text-zinc-950 dark:text-zinc-100">{details.householdName}</strong> workspace.
          </p>
        </div>

        <dl className="mb-6 space-y-2.5 rounded-xl border border-zinc-200/80 bg-zinc-50 p-4 text-xs dark:border-zinc-800 dark:bg-[#12151b]">
          <div className="flex items-center justify-between gap-3">
            <dt className="inline-flex items-center gap-1.5 font-medium text-zinc-500 dark:text-zinc-400">
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Target Email</span>
            </dt>
            <dd className="font-semibold text-zinc-950 truncate dark:text-zinc-100">{details.invitedEmail}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="inline-flex items-center gap-1.5 font-medium text-zinc-500 dark:text-zinc-400">
              <Shield className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Role</span>
            </dt>
            <dd className="font-semibold text-zinc-950 dark:text-zinc-100">{details.invitedRole}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="inline-flex items-center gap-1.5 font-medium text-zinc-500 dark:text-zinc-400">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Expires</span>
            </dt>
            <dd className="font-semibold text-zinc-950 tabular-nums dark:text-zinc-100">
              {new Date(details.expiresAt).toLocaleDateString()}
            </dd>
          </div>
        </dl>

        {user ? (
          <div>
            <p className="mb-4 text-center text-xs text-zinc-600 dark:text-zinc-400">
              Signed in as <strong className="font-semibold text-zinc-950 dark:text-zinc-100">{user.email}</strong>
            </p>
            <button
              onClick={handleAccept}
              disabled={accepting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
            >
              {accepting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Joining Household...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  <span>Accept Invitation &amp; Join Household</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <Link
              href={`/login?redirect=/invite/${token}`}
              className="block w-full rounded-xl bg-zinc-950 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-xs transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
            >
              Sign In to Accept
            </Link>
            <Link
              href={`/register?redirect=/invite/${token}`}
              className="block w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-center text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Create New Account
            </Link>
          </div>
        )}
      </div>
    </AuthShell>
  );
}
