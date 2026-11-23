'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../../../lib/auth-context';
import { apiClient } from '../../../lib/api';
import { resolvePostAuthPath } from '../../../lib/auth-redirect';
import { AuthShell, BrandLogo } from '../../../components/ui/AuthShell';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <AuthShell>
      <div className="rounded-2xl border border-zinc-200/85 bg-white p-6 shadow-[0_1px_3px_rgba(9,9,11,0.05)] sm:p-8">
        <div className="mb-7">
          <div className="mb-5 lg:hidden">
            <BrandLogo />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 text-balance">
            Sign in to your workspace
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500 text-pretty">
            Access your personal or joint Luxembourg tax return.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="login-email"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-600"
            >
              Email Address
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. spouse@example.lu"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-base text-zinc-950 placeholder:text-zinc-400 transition focus:border-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950/10 sm:text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-600"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-3.5 pr-11 text-base text-zinc-950 placeholder:text-zinc-400 transition focus:border-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950/10 sm:text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-1.5 my-auto flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-zinc-800 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </button>
        </form>

        <div className="mt-7 border-t border-zinc-100 pt-5 text-center text-sm text-zinc-500">
          Don&apos;t have an account yet?{' '}
          <Link
            href="/register"
            className="font-semibold text-zinc-950 transition hover:text-sky-700 hover:underline"
          >
            Create account
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
