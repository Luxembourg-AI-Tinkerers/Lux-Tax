import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { mobileApiClient } from '../../src/lib/api-client';
import { secureStorage } from '../../src/lib/secure-storage';
import { HouseholdDto, TaxYearWorkspaceDto, WorkspaceReadinessDto } from '@luxtax/contracts';

export default function MobileWorkspaceScreen() {
  const router = useRouter();
  const [household, setHousehold] = useState<HouseholdDto | null>(null);
  const [workspace, setWorkspace] = useState<TaxYearWorkspaceDto | null>(null);
  const [readiness, setReadiness] = useState<WorkspaceReadinessDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    const hhRes = await mobileApiClient.getHouseholds();
    if (hhRes.data && hhRes.data.length > 0) {
      const activeHh = hhRes.data[0];
      setHousehold(activeHh);

      const [wsRes, readRes] = await Promise.all([
        mobileApiClient.getWorkspace(activeHh.id, 2025),
        mobileApiClient.getWorkspaceReadiness(activeHh.id, 2025),
      ]);

      if (wsRes.data) setWorkspace(wsRes.data);
      if (readRes.data) setReadiness(readRes.data);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleLogout = async () => {
    await secureStorage.clearTokens();
    router.replace('/(auth)/login');
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0284c7" />
        <Text style={styles.loadingText}>Loading workspace...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />}
    >
      {/* Top Banner */}
      <View style={styles.banner}>
        <Text style={styles.householdName}>{household?.name || 'Tax Household'}</Text>
        <View style={styles.yearTag}>
          <Text style={styles.yearText}>Tax Year 2025</Text>
        </View>
      </View>

      {/* Readiness Overview */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Return Readiness</Text>
        <Text style={styles.statLarge}>{readiness?.overallPercentage ?? 10}%</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${readiness?.overallPercentage ?? 10}%` }]} />
        </View>
        <Text style={styles.cardDesc}>
          Workspace initialized. Spousal co-filers have equal approval rights on the joint declaration.
        </Text>
      </View>

      {/* Estimated Tax Outcome */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Estimated Tax Outcome</Text>
        <Text style={styles.statLarge}>
          {workspace?.estimatedTaxBalance ? `€${workspace.estimatedTaxBalance}` : '€0.00'}
        </Text>
        <Text style={styles.cardDesc}>
          Deterministic estimate derived strictly from confirmed certificates and versioned 2025 tax rules.
        </Text>
      </View>

      {/* Household Co-Filers */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Household Co-Filers</Text>
        {household?.members?.map((m, index) => (
          <View key={m.id} style={styles.memberRow}>
            <View style={styles.memberNumber}>
              <Text style={styles.memberNumberText}>{index + 1}</Text>
            </View>
            <View style={styles.memberInfo}>
              <Text style={styles.memberEmail}>{m.user?.email || 'Filer'}</Text>
              <Text style={styles.memberRole}>{m.role}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Sign out button */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 16,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
  },
  banner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  householdName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  yearTag: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  yearText: {
    color: '#0369a1',
    fontWeight: '700',
    fontSize: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  statLarge: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: 8,
    backgroundColor: '#0284c7',
    borderRadius: 4,
  },
  cardDesc: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  memberNumber: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#f0f9ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  memberNumberText: {
    color: '#0284c7',
    fontWeight: '700',
    fontSize: 12,
  },
  memberInfo: {
    flex: 1,
  },
  memberEmail: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  memberRole: {
    fontSize: 11,
    color: '#94a3b8',
  },
  logoutButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 8,
    marginBottom: 40,
  },
  logoutText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
});
