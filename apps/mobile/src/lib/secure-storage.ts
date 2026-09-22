import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'luxtax_access_token';
const REFRESH_TOKEN_KEY = 'luxtax_refresh_token';

export const secureStorage = {
  async getAccessToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    } catch {
      return null;
    }
  },

  async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
    } catch (err) {
      console.error('Failed to write tokens to secure storage', err);
    }
  },

  async clearTokens(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    } catch (err) {
      console.error('Failed to delete tokens from secure storage', err);
    }
  },
};
