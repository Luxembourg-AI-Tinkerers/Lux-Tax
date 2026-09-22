import { LuxTaxApiClient } from '@luxtax/api-client';
import { secureStorage } from './secure-storage';

// In development, default to local machine API or localhost
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3001';

export const mobileApiClient = new LuxTaxApiClient({
  baseUrl: API_BASE_URL,
  getAccessToken: async () => {
    return secureStorage.getAccessToken();
  },
  onUnauthorized: async () => {
    await secureStorage.clearTokens();
  },
});
