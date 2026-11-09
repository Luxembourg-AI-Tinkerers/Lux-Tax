import { LuxTaxApiClient } from '@luxtax/api-client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const apiClient = new LuxTaxApiClient({
  baseUrl: API_BASE_URL,
  getAccessToken: () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('luxtax_access_token');
    }
    return null;
  },
  onUnauthorized: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('luxtax_access_token');
      localStorage.removeItem('luxtax_refresh_token');
      window.location.href = '/login';
    }
  },
});

/**
 * Download the ACD annex PDF produced by the API for a filing package.
 * Uses a blob download because the endpoint is JWT-protected.
 */
export async function downloadAnnexPdf(workspaceId: string): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxtax_access_token') : null;
  const response = await fetch(
    `${API_BASE_URL}/api/workspaces/${workspaceId}/filing-package/annexes.pdf`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );

  if (!response.ok) {
    throw new Error(`Annex PDF could not be generated (HTTP ${response.status}).`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `luxtax-annexes-${workspaceId.slice(0, 8)}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
