'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Landmark } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { apiClient } from '../lib/api';

export default function HomePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.push('/login');
      return;
    }

    // Fetch user's households
    apiClient.getHouseholds().then((res) => {
      if (res.data && res.data.length > 0) {
        router.push(`/${res.data[0].id}/dashboard`);
      } else {
        // Redirect to create household screen or fallback
        router.push('/login');
      }
    });
  }, [user, isLoading, router]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f6f7f9] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200/85 bg-white p-8 text-center shadow-[0_1px_2px_rgba(9,9,11,0.04)]">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-950 text-sky-400 shadow-xs">
          <Landmark className="h-6 w-6 animate-pulse" strokeWidth={1.8} aria-hidden="true" />
        </div>
        <h1 className="text-sm font-bold tracking-tight text-zinc-950">Luxembourg Tax Workspace</h1>
        <p className="mt-1.5 text-xs font-medium text-zinc-500">
          Loading Luxembourg Tax Workspace...
        </p>
        <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-zinc-900" />
        </div>
      </div>
    </div>
  );
}
