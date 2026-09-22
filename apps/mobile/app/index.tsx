import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { secureStorage } from '../src/lib/secure-storage';
import { mobileApiClient } from '../src/lib/api-client';

export default function EntryScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const token = await secureStorage.getAccessToken();
      if (!token) {
        router.replace('/(auth)/login');
        return;
      }

      const userRes = await mobileApiClient.getMe();
      if (userRes.data) {
        router.replace('/(tabs)');
      } else {
        await secureStorage.clearTokens();
        router.replace('/(auth)/login');
      }
      setChecking(false);
    }

    checkAuth();
  }, [router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#0284c7" />
      <Text style={styles.text}>Loading Luxembourg Tax Workspace...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  text: {
    marginTop: 16,
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
});
