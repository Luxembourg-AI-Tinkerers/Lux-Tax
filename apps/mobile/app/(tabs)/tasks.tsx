import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { mobileApiClient } from '../../src/lib/api-client';
import { resolveWorkspace } from '../../src/lib/workspace';
import { WorkspaceReadinessDto, TaskSeverity } from '@luxtax/contracts';

export default function MobileTasksScreen() {
  const [readiness, setReadiness] = useState<WorkspaceReadinessDto | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    const hhRes = await mobileApiClient.getHouseholds();
    if (hhRes.data && hhRes.data.length > 0) {
      const hId = hhRes.data[0].id;
      setHouseholdId(hId);

      // Readiness is household-scoped, the questionnaire is workspace-scoped
      // (MOB-1/MOB-2): resolve both so no id crosses over.
      const resolved = await resolveWorkspace(mobileApiClient, 2025, hId);
      if (resolved.ok) setWorkspaceId(resolved.workspaceId);

      const readRes = await mobileApiClient.getWorkspaceReadiness(hId, 2025);
      if (readRes.data) setReadiness(readRes.data);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleResolveQuestionnaire = async () => {
    if (!workspaceId) {
      Alert.alert('No workspace', 'Open or create a tax workspace for 2025 first.');
      return;
    }

    setLoading(true);
    // `submitTaxProfile` never existed on the client; the questionnaire endpoint is
    // workspace-scoped and expects the current QuestionnaireAnswersDto shape.
    const res = await mobileApiClient.saveQuestionnaire(workspaceId, {
      maritalStatus: 'MARRIED',
      hasEmploymentIncome: true,
      hasPensionIncome: false,
      hasPrimaryResidenceMortgage: true,
      hasLifeInsuranceOrPensionPlan: false,
      hasDonations: false,
      childrenCount: 0,
      hasFreelanceIncome: false,
    });
    setLoading(false);

    if (res.error) {
      Alert.alert('Save Failed', res.error.message || 'Could not save the questionnaire.');
      return;
    }

    await loadData();
    Alert.alert('Profile Saved', 'Household questionnaire has been updated.');
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0284c7" />
        <Text style={styles.loadingText}>Evaluating readiness tasks...</Text>
      </View>
    );
  }

  const items = readiness?.missingItems || [];
  const blockers = items.filter((i) => i.severity === TaskSeverity.BLOCKER);
  const warnings = items.filter((i) => i.severity === TaskSeverity.WARNING);
  const recommendations = items.filter((i) => i.severity === TaskSeverity.RECOMMENDATION);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />}
    >
      <Text style={styles.headerTitle}>Readiness & Tasks</Text>
      <Text style={styles.headerSubtitle}>
        Automated missing-information engine ensuring full compliance before filing
      </Text>

      {/* Progress Banner */}
      <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>Declaration Completion</Text>
          <Text style={styles.progressValue}>{readiness?.overallPercentage ?? 0}%</Text>
        </View>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${readiness?.overallPercentage ?? 0}%`,
                backgroundColor: (readiness?.overallPercentage ?? 0) >= 80 ? '#059669' : '#0284c7',
              },
            ]}
          />
        </View>
        <Text style={styles.progressHint}>
          {readiness?.isReadyForFiling
            ? 'All blocker tasks resolved! Workspace is ready for formal dual-spouse approval.'
            : `${blockers.length} blocker items must be resolved before filing.`}
        </Text>
      </View>

      {/* Quick Profile Setup */}
      <TouchableOpacity style={styles.quickProfileCard} onPress={handleResolveQuestionnaire}>
        <View>
          <Text style={styles.quickProfileTitle}>Update Tax Profile Questions</Text>
          <Text style={styles.quickProfileDesc}>Residency, employment, mortgage interest, insurance</Text>
        </View>
        <Text style={styles.quickProfileArrow}>→</Text>
      </TouchableOpacity>

      {/* Task Groups */}
      <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Active Checklist ({items.length})</Text>

      {items.length === 0 ? (
        <View style={styles.allClearCard}>
          <Text style={styles.allClearTitle}>All Tasks Completed!</Text>
          <Text style={styles.allClearDesc}>
            Your return has all necessary evidence and answers. Proceed to the Estimate tab.
          </Text>
        </View>
      ) : (
        items.map((task) => (
          <View key={task.id} style={styles.taskCard}>
            <View style={styles.taskHeader}>
              <View style={[styles.sevBadge, getSeverityBadgeStyle(task.severity)]}>
                <Text style={[styles.sevText, getSeverityTextStyle(task.severity)]}>
                  {task.severity}
                </Text>
              </View>
              <Text style={styles.taskType}>{task.taskType}</Text>
            </View>
            <Text style={styles.taskDesc}>{task.description}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function getSeverityBadgeStyle(severity: TaskSeverity) {
  switch (severity) {
    case TaskSeverity.BLOCKER:
      return { backgroundColor: '#fee2e2' };
    case TaskSeverity.WARNING:
      return { backgroundColor: '#fef3c7' };
    default:
      return { backgroundColor: '#e0f2fe' };
  }
}

function getSeverityTextStyle(severity: TaskSeverity) {
  switch (severity) {
    case TaskSeverity.BLOCKER:
      return { color: '#dc2626' };
    case TaskSeverity.WARNING:
      return { color: '#d97706' };
    default:
      return { color: '#0284c7' };
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#64748b' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  headerSubtitle: { fontSize: 13, color: '#64748b', marginTop: 4, marginBottom: 16 },
  progressCard: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 12 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  progressLabel: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  progressValue: { fontSize: 18, fontWeight: '700', color: '#0284c7' },
  progressBar: { height: 8, backgroundColor: '#e2e8f0', borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  progressHint: { fontSize: 12, color: '#64748b', marginTop: 8 },
  quickProfileCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f0f9ff', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#bae6fd', marginBottom: 16 },
  quickProfileTitle: { fontSize: 14, fontWeight: '700', color: '#0369a1' },
  quickProfileDesc: { fontSize: 12, color: '#0284c7', marginTop: 2 },
  quickProfileArrow: { fontSize: 18, fontWeight: '700', color: '#0369a1' },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 8 },
  allClearCard: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', padding: 20, borderRadius: 12, alignItems: 'center' },
  allClearTitle: { fontSize: 15, fontWeight: '700', color: '#15803d' },
  allClearDesc: { fontSize: 12, color: '#16a34a', marginTop: 4, textAlign: 'center' },
  taskCard: { backgroundColor: '#ffffff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  taskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  sevBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  sevText: { fontSize: 10, fontWeight: '700' },
  taskType: { fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' },
  taskDesc: { fontSize: 13, color: '#334155', lineHeight: 18 },
});
