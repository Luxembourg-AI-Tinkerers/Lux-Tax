'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth-context';
import { apiClient } from '../../../lib/api';
import { resolvePostAuthPath } from '../../../lib/auth-redirect';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await apiClient.login({ email, password });
    setLoading(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    if (res.data) {
      login(res.data.tokens, res.data.user);

      // An invitation link asks for a specific destination
      // (`/login?redirect=/invite/<token>`); honour it before the household
      // default, so the invitation is not lost on the way in.
      const redirect = resolvePostAuthPath(
        typeof window !== 'undefined' ? window.location.search : '',
        '',
      );
      if (redirect) {
        router.push(redirect);
        return;
      }

      // Check households and redirect
      const hhRes = await apiClient.getHouseholds();
      if (hhRes.data && hhRes.data.length > 0) {
        router.push(`/${hhRes.data[0].id}/dashboard`);
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
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Luxembourg Tax Workspace</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to your personal or joint return</p>
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
          <div>
            <label
              htmlFor="login-email"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
            >
              Email Address
            </label>
            <input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. spouse@example.lu"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
            >
              Password
            </label>
            <input
              id="login-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-medium text-sm transition shadow-sm disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-slate-500">
          Don't have an account yet?{' '}
          <Link href="/register" className="text-sky-600 hover:text-sky-700 font-semibold">
            Create account
          </Link>
        </div>
      </div>
    </div>
  );
}
