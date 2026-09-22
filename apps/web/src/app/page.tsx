'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-sky-600 border-t-transparent mx-auto mb-4" />
        <p className="text-slate-600 font-medium">Loading Luxembourg Tax Workspace...</p>
      </div>
    </div>
  );
}
