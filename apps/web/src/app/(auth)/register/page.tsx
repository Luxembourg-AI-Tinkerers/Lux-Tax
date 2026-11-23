'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Check, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../../../lib/auth-context';
import { apiClient } from '../../../lib/api';
import { resolvePostAuthPath } from '../../../lib/auth-redirect';
import { AuthShell, BrandLogo } from '../../../components/ui/AuthShell';

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const hasMinLen = password.length >= 8;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /\d/.test(password);

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
    <AuthShell>
      <div className="rounded-2xl border border-zinc-200/85 bg-white p-6 shadow-[0_1px_3px_rgba(9,9,11,0.05)] sm:p-8 dark:border-zinc-800/90 dark:bg-[#161920] dark:shadow-none">
        <div className="mb-6">
          <div className="mb-5 lg:hidden">
            <BrandLogo />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 text-balance dark:text-zinc-50">
            Create Tax Account
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500 text-pretty dark:text-zinc-400">
            Set up your Luxembourg personal or joint workspace.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 dark:border-rose-800/70 dark:bg-rose-950/55 dark:text-rose-200"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="register-first-name"
                className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400"
              >
                First Name
              </label>
              <input
                id="register-first-name"
                type="text"
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Jean"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-base text-zinc-950 placeholder:text-zinc-400 transition focus:border-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950/10 sm:text-sm dark:border-zinc-700/80 dark:bg-[#12151b] dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400 dark:focus:ring-sky-400/20"
              />
            </div>
            <div>
              <label
                htmlFor="register-last-name"
                className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400"
              >
                Last Name
              </label>
              <input
                id="register-last-name"
                type="text"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Dupont"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-base text-zinc-950 placeholder:text-zinc-400 transition focus:border-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950/10 sm:text-sm dark:border-zinc-700/80 dark:bg-[#12151b] dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400 dark:focus:ring-sky-400/20"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="register-household-name"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400"
            >
              Household Name <span className="font-normal normal-case text-zinc-400 dark:text-zinc-500">(optional)</span>
            </label>
            <input
              id="register-household-name"
              type="text"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              placeholder="e.g. Dupont-Muller Household"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-base text-zinc-950 placeholder:text-zinc-400 transition focus:border-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950/10 sm:text-sm dark:border-zinc-700/80 dark:bg-[#12151b] dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400 dark:focus:ring-sky-400/20"
            />
          </div>

          <div>
            <label
              htmlFor="register-email"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400"
            >
              Email Address
            </label>
            <input
              id="register-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jean.dupont@example.lu"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-base text-zinc-950 placeholder:text-zinc-400 transition focus:border-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950/10 sm:text-sm dark:border-zinc-700/80 dark:bg-[#12151b] dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400 dark:focus:ring-sky-400/20"
            />
          </div>

          <div>
            <label
              htmlFor="register-password"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="register-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a strong password"
                className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-3.5 pr-11 text-base text-zinc-950 placeholder:text-zinc-400 transition focus:border-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950/10 sm:text-sm dark:border-zinc-700/80 dark:bg-[#12151b] dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400 dark:focus:ring-sky-400/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-1.5 my-auto flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
              {[
                { ok: hasMinLen, label: '8+ characters' },
                { ok: hasLetter, label: '1 letter' },
                { ok: hasNumber, label: '1 number' },
              ].map((rule) => (
                <span
                  key={rule.label}
                  className={`inline-flex items-center gap-1 transition-colors ${
                    rule.ok
                      ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                      : 'text-zinc-400 dark:text-zinc-500'
                  }`}
                >
                  <Check className="h-3 w-3" aria-hidden="true" />
                  <span>{rule.label}</span>
                </span>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-zinc-800 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white dark:focus-visible:ring-offset-[#161920]"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Creating account...</span>
              </>
            ) : (
              <>
                <span>Create Account &amp; Workspace</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </button>
        </form>

        <div className="mt-7 border-t border-zinc-100 pt-5 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-semibold text-zinc-950 transition hover:text-sky-700 hover:underline dark:text-zinc-100 dark:hover:text-sky-400"
          >
            Sign in
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
