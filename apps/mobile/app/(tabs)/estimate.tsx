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
import { TaxCalculationResultDto, TaxYearWorkspaceDto } from '@luxtax/contracts';

export default function MobileEstimateScreen() {
  const [calcResult, setCalcResult] = useState<TaxCalculationResultDto | null>(null);
  const [workspace, setWorkspace] = useState<TaxYearWorkspaceDto | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    const hhRes = await mobileApiClient.getHouseholds();
    if (hhRes.data && hhRes.data.length > 0) {
      const hId = hhRes.data[0].id;
      setHouseholdId(hId);

      const wsRes = await mobileApiClient.getWorkspace(hId, 2025);
      if (wsRes.data) setWorkspace(wsRes.data);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRunCalculation = async () => {
    if (!householdId) return;
    setCalculating(true);
    const res = await mobileApiClient.calculateTax(householdId, 2025);
    setCalculating(false);

    if (res.data) {
      setCalcResult(res.data);
      await loadData();
    } else {
      Alert.alert('Calculation Failed', res.error?.message || 'Could not calculate tax');
    }
  };

  const handleApproveReturn = async () => {
    if (!householdId) return;
    setApproving(true);
    const res = await mobileApiClient.approveReturn(householdId, 2025);
    setApproving(false);

    if (res.data) {
      Alert.alert('Return Approved', 'Your approval has been recorded on this version of the declaration.');
      await loadData();
    } else {
      Alert.alert('Approval Failed', res.error?.message || 'Could not record approval');
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0284c7" />
        <Text style={styles.loadingText}>Loading tax estimate...</Text>
      </View>
    );
  }

  const balance = calcResult
    ? Number(calcResult.estimatedRefundOrBalance)
    : workspace?.estimatedTaxBalance
    ? Number(workspace.estimatedTaxBalance)
    : 0;

  const isRefund = balance > 0;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />}
    >
      <Text style={styles.headerTitle}>2025 Tax Estimate</Text>
      <Text style={styles.headerSubtitle}>
        Deterministic calculation based strictly on confirmed facts and versioned Luxembourg tax law
      </Text>

      {/* Primary Result Banner */}
      <View style={[styles.bannerCard, isRefund ? styles.bannerRefund : styles.bannerPayable]}>
        <Text style={[styles.bannerType, isRefund ? styles.textRefund : styles.textPayable]}>
          {isRefund ? 'ESTIMATED REFUND' : 'ESTIMATED BALANCE DUE'}
        </Text>
        <Text style={[styles.bannerAmount, isRefund ? styles.textRefund : styles.textPayable]}>
          {isRefund ? '+' : ''}€{Math.abs(balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </Text>
        <Text style={styles.bannerNote}>
          Active Return Version: v{workspace?.activeReturnVersion || 1} • Status: {workspace?.status}
        </Text>
      </View>

      {/* Calculate Button */}
      <TouchableOpacity
        style={[styles.calcButton, calculating && styles.calcButtonDisabled]}
        disabled={calculating}
        onPress={handleRunCalculation}
      >
        {calculating ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.calcButtonText}>⚡ Recalculate 2025 Tax</Text>
        )}
      </TouchableOpacity>

      {/* Detailed Breakdown */}
      {calcResult && (
        <View style={styles.breakdownCard}>
          <Text style={styles.cardSectionTitle}>Calculation Breakdown</Text>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Total Gross Income</Text>
            <Text style={styles.rowVal}>€{Number(calcResult.totalGrossIncome).toFixed(2)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Total Deductions Allowed</Text>
            <Text style={[styles.rowVal, { color: '#059669' }]}>
              -€{Number(calcResult.totalDeductions).toFixed(2)}
            </Text>
          </View>
          <View style={[styles.row, styles.dividerRow]}>
            <Text style={[styles.rowLabel, { fontWeight: '700' }]}>Taxable Income</Text>
            <Text style={[styles.rowVal, { fontWeight: '700' }]}>
              €{Number(calcResult.taxableIncome).toFixed(2)}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Base Tax ({calcResult.taxClass})</Text>
            <Text style={styles.rowVal}>€{Number(calcResult.baseTax).toFixed(2)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Solidarity Surcharge (7%)</Text>
            <Text style={styles.rowVal}>€{Number(calcResult.solidaritySurcharge).toFixed(2)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Tax Credits (CIS / CIM)</Text>
            <Text style={[styles.rowVal, { color: '#059669' }]}>
              -€{Number(calcResult.totalTaxCredits).toFixed(2)}
            </Text>
          </View>
          <View style={[styles.row, styles.dividerRow]}>
            <Text style={[styles.rowLabel, { fontWeight: '700' }]}>Final Tax Liability</Text>
            <Text style={[styles.rowVal, { fontWeight: '700' }]}>
              €{Number(calcResult.totalTaxLiability).toFixed(2)}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Withholding Tax Paid at Source</Text>
            <Text style={[styles.rowVal, { color: '#0284c7' }]}>
              €{Number(calcResult.withholdingTaxPaid).toFixed(2)}
            </Text>
          </View>
        </View>
      )}

      {/* Line-item Legal Provenance */}
      {calcResult && calcResult.provenance && calcResult.provenance.length > 0 && (
        <View style={styles.provCard}>
          <Text style={styles.cardSectionTitle}>Legal Provenance & Rule Codes</Text>
          {calcResult.provenance.map((p, idx) => (
            <View key={idx} style={styles.provRow}>
              <View style={styles.provHeader}>
                <Text style={styles.provDesc}>{p.description}</Text>
                <Text style={styles.provAmount}>€{Number(p.amount).toFixed(2)}</Text>
              </View>
              <Text style={styles.provRule}>Rule: {p.ruleCode} ({p.category})</Text>
            </View>
          ))}
        </View>
      )}

      {/* Spousal Approval Action */}
      <View style={styles.approvalCard}>
        <Text style={styles.approvalTitle}>Filing Approval</Text>
        <Text style={styles.approvalDesc}>
          Under Luxembourg joint taxation (Class 2), both spouses must independently review and sign off on
          the exact same return version before filing packages can be generated.
        </Text>
        <TouchableOpacity
          style={[styles.approveBtn, approving && styles.calcButtonDisabled]}
          disabled={approving}
          onPress={handleApproveReturn}
        >
          {approving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.approveBtnText}>✓ Approve Return Version v{workspace?.activeReturnVersion || 1}</Text>
          )}
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
  bannerCard: { borderRadius: 12, padding: 18, alignItems: 'center', marginBottom: 16, borderWidth: 1 },
  bannerRefund: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  bannerPayable: { backgroundColor: '#fffbeb', borderColor: '#fef3c7' },
  bannerType: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  bannerAmount: { fontSize: 32, fontWeight: '800', marginTop: 4, marginBottom: 4 },
  textRefund: { color: '#15803d' },
  textPayable: { color: '#b45309' },
  bannerNote: { fontSize: 11, color: '#64748b', marginTop: 4 },
  calcButton: { backgroundColor: '#0284c7', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginBottom: 16 },
  calcButtonDisabled: { opacity: 0.6 },
  calcButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  breakdownCard: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16 },
  cardSectionTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { fontSize: 13, color: '#475569' },
  rowVal: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  dividerRow: { borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 4, paddingTop: 8 },
  provCard: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16 },
  provRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  provHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  provDesc: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  provAmount: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  provRule: { fontSize: 11, color: '#0284c7', marginTop: 2, fontFamily: 'monospace' },
  approvalCard: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 30 },
  approvalTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  approvalDesc: { fontSize: 12, color: '#64748b', lineHeight: 18, marginBottom: 12 },
  approveBtn: { backgroundColor: '#059669', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  approveBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
});
