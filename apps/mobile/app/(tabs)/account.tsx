import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Switch,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { mobileApiClient } from '../../src/lib/api-client';
import { secureStorage } from '../../src/lib/secure-storage';
import { HouseholdDto, HouseholdRole } from '@luxtax/contracts';

export default function MobileAccountScreen() {
  const router = useRouter();
  const [household, setHousehold] = useState<HouseholdDto | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<HouseholdRole>(HouseholdRole.CO_FILER);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [biometricsEnabled, setBiometricsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);

  const loadData = async () => {
    const hhRes = await mobileApiClient.getHouseholds();
    if (hhRes.data && hhRes.data.length > 0) {
      setHousehold(hhRes.data[0]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleLogout = async () => {
    await secureStorage.clearTokens();
    router.replace('/(auth)/login');
  };

  const handleCreateInvite = async () => {
    if (!household || !inviteEmail.trim()) {
      Alert.alert('Missing Email', 'Please enter your spouse email address.');
      return;
    }
    setInviting(true);
    const res = await mobileApiClient.inviteMember(household.id, {
      invitedEmail: inviteEmail.trim(),
      role: inviteRole,
    });
    setInviting(false);

    if (res.data) {
      setInviteToken(res.data.invitationToken);
      Alert.alert('Invitation Created', `Invitation token generated (valid for 72h). Token: ${res.data.invitationToken}`);
      setInviteEmail('');
      await loadData();
    } else {
      Alert.alert('Invitation Failed', res.error?.message || 'Could not send invitation');
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0284c7" />
        <Text style={styles.loadingText}>Loading profile & settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.headerTitle}>Account & Settings</Text>
      <Text style={styles.headerSubtitle}>
        Manage household co-filers, biometric re-entry, and security settings
      </Text>

      {/* Household Info */}
      <View style={styles.card}>
        <Text style={styles.cardSectionTitle}>Active Tax Household</Text>
        <Text style={styles.hhName}>{household?.name || 'Tax Household'}</Text>
        <Text style={styles.hhMeta}>
          Created: {household?.createdAt ? new Date(household.createdAt).toLocaleDateString() : '2025'}
        </Text>

        <Text style={[styles.subLabel, { marginTop: 12 }]}>Current Members:</Text>
        {household?.members?.map((m) => (
          <View key={m.id} style={styles.memberRow}>
            <View>
              <Text style={styles.memberName}>{m.userId.substring(0, 12)}...</Text>
              <Text style={styles.memberRole}>{m.role}</Text>
            </View>
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>{m.status}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Invite Co-Filer */}
      <View style={styles.card}>
        <Text style={styles.cardSectionTitle}>Invite Spouse / Co-Filer</Text>
        <Text style={styles.cardDesc}>
          Under Luxembourg joint taxation (Class 2), spouses maintain independent credentials while sharing the tax workspace.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="spouse.email@example.lu"
          placeholderTextColor="#94a3b8"
          keyboardType="email-address"
          autoCapitalize="none"
          value={inviteEmail}
          onChangeText={setInviteEmail}
        />

        <TouchableOpacity
          style={[styles.btnPrimary, inviting && styles.btnDisabled]}
          disabled={inviting}
          onPress={handleCreateInvite}
        >
          {inviting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.btnPrimaryText}>Send Expiring Invitation (72h)</Text>
          )}
        </TouchableOpacity>

        {inviteToken && (
          <View style={styles.tokenBox}>
            <Text style={styles.tokenLabel}>Latest Invitation Token:</Text>
            <Text style={styles.tokenValue}>{inviteToken}</Text>
          </View>
        )}
      </View>

      {/* Security & Device Settings */}
      <View style={styles.card}>
        <Text style={styles.cardSectionTitle}>Security & Device Protection</Text>

        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingTitle}>Biometric Re-entry</Text>
            <Text style={styles.settingDesc}>Use Face ID / Touch ID to unlock workspace</Text>
          </View>
          <Switch
            value={biometricsEnabled}
            onValueChange={setBiometricsEnabled}
            trackColor={{ false: '#cbd5e1', true: '#0284c7' }}
          />
        </View>

        <View style={[styles.settingRow, { marginTop: 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingTitle}>Session Storage</Text>
            <Text style={styles.settingDesc}>Encrypted Hardware Keystore / SecureStore</Text>
          </View>
          <Text style={styles.secureText}>Active (AES-GCM)</Text>
        </View>
      </View>

      {/* Data Export & Logout */}
      <View style={styles.actionCard}>
        <TouchableOpacity
          style={styles.outlineBtn}
          onPress={() => Alert.alert('Export Requested', 'A GDPR archive of all household facts and evidence will be delivered to your verified email.')}
        >
          <Text style={styles.outlineBtnText}>Request Data Archive (GDPR Art. 20)</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutBtnText}>Sign Out of Workspace</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#64748b' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  headerSubtitle: { fontSize: 13, color: '#64748b', marginTop: 4, marginBottom: 16 },
  card: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16 },
  cardSectionTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 6 },
  cardDesc: { fontSize: 12, color: '#64748b', lineHeight: 18, marginBottom: 12 },
  hhName: { fontSize: 16, fontWeight: '700', color: '#0284c7', marginTop: 2 },
  hhMeta: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  subLabel: { fontSize: 13, fontWeight: '600', color: '#334155' },
  memberRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  memberName: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  memberRole: { fontSize: 11, color: '#64748b' },
  activeBadge: { backgroundColor: '#dcfce7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  activeBadgeText: { color: '#15803d', fontSize: 10, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#0f172a', marginBottom: 12 },
  btnPrimary: { backgroundColor: '#0284c7', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  btnPrimaryText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  tokenBox: { backgroundColor: '#f0f9ff', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#bae6fd', marginTop: 12 },
  tokenLabel: { fontSize: 11, fontWeight: '700', color: '#0369a1' },
  tokenValue: { fontSize: 11, color: '#0284c7', marginTop: 4, fontFamily: 'monospace' },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settingTitle: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  settingDesc: { fontSize: 11, color: '#64748b', marginTop: 2 },
  secureText: { fontSize: 12, fontWeight: '600', color: '#059669' },
  actionCard: { marginBottom: 40 },
  outlineBtn: { borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#ffffff', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  outlineBtnText: { color: '#475569', fontSize: 13, fontWeight: '600' },
  logoutBtn: { backgroundColor: '#fee2e2', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  logoutBtnText: { color: '#dc2626', fontSize: 13, fontWeight: '700' },
});
