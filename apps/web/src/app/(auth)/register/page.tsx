'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth-context';
import { apiClient } from '../../../lib/api';
import { resolvePostAuthPath } from '../../../lib/auth-redirect';

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await apiClient.register({
      email,
      password,
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
    });

    if (res.error) {
      setError(res.error);
      setLoading(false);
      return;
    }

    if (res.data) {
      login(res.data.tokens, res.data.user);

      // `/register?redirect=/invite/<token>` comes from an invitation link: the
      // new account exists to accept it, so go straight back there.
      const redirect = resolvePostAuthPath(
        typeof window !== 'undefined' ? window.location.search : '',
        '',
      );

      if (redirect) {
        setLoading(false);
        router.push(redirect);
        return;
      }

      // Create initial household
      const hhName = householdName.trim() || `${lastName || 'Dupont'} Household`;
      const hhRes = await apiClient.createHousehold({ name: hhName });

      setLoading(false);
      if (hhRes.data) {
        router.push(`/${hhRes.data.id}/dashboard`);
      } else {
        router.push('/');
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-sky-600 font-bold text-xl mb-3">
            LT
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Create Tax Account</h1>
          <p className="text-sm text-slate-500 mt-1">Set up your Luxembourg personal or joint workspace</p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-sm"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="register-first-name"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
              >
                First Name
              </label>
              <input
                id="register-first-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Jean"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="register-last-name"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
              >
                Last Name
              </label>
              <input
                id="register-last-name"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Dupont"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="register-household-name"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
            >
              Household Name
            </label>
            <input
              id="register-household-name"
              type="text"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              placeholder="e.g. Dupont-Muller Household"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="register-email"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
            >
              Email Address
            </label>
            <input
              id="register-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jean.dupont@example.lu"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="register-password"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
            >
              Password (min 8 chars, 1 letter &amp; 1 number)
            </label>
            <input
              id="register-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a strong password"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-medium text-sm transition shadow-sm disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Create Account & Workspace'}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link href="/login" className="text-sky-600 hover:text-sky-700 font-semibold">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
