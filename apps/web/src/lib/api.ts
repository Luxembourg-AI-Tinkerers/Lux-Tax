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
