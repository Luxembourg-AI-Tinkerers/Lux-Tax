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
import { DocumentDto, DocumentVisibility, DocumentType, ExtractedFactDto } from '@luxtax/contracts';

export default function MobileDocumentsScreen() {
  const [documents, setDocuments] = useState<readonly DocumentDto[]>([]);
  const [facts, setFacts] = useState<readonly ExtractedFactDto[]>([]);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = async () => {
    const hhRes = await mobileApiClient.getHouseholds();
    if (hhRes.data && hhRes.data.length > 0) {
      const hId = hhRes.data[0].id;
      setHouseholdId(hId);

      const [docsRes, factsRes] = await Promise.all([
        mobileApiClient.getDocuments(hId, 2025),
        mobileApiClient.getExtractedFacts(hId, 2025),
      ]);

      if (docsRes.data) setDocuments(docsRes.data);
      if (factsRes.data) setFacts(factsRes.data);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleVisibility = async (docId: string, current: DocumentVisibility) => {
    if (!householdId) return;
    const nextVis =
      current === DocumentVisibility.PRIVATE_DRAFT
        ? DocumentVisibility.SHARED_FOR_DISCUSSION
        : current === DocumentVisibility.SHARED_FOR_DISCUSSION
        ? DocumentVisibility.INCLUDED_IN_RETURN
        : DocumentVisibility.PRIVATE_DRAFT;

    setActionLoading(true);
    await mobileApiClient.updateDocumentVisibility(householdId, 2025, docId, nextVis);
    await loadData();
    setActionLoading(false);
  };

  const handleConfirmFact = async (factId: string) => {
    if (!householdId) return;
    setActionLoading(true);
    const res = await mobileApiClient.confirmFact(householdId, 2025, factId);
    setActionLoading(false);
    if (res.data) {
      Alert.alert('Fact Confirmed', 'The candidate fact is now authoritative in your 2025 tax calculation.');
      await loadData();
    } else {
      Alert.alert('Error', res.error?.message || 'Failed to confirm fact');
    }
  };

  const handleUploadSample = async (type: DocumentType) => {
    if (!householdId) return;
    setActionLoading(true);

    let sampleContent = '';
    let fileName = '';

    if (type === DocumentType.CERTIFICAT_REMUNERATION) {
      fileName = 'Certificat_Remuneration_2025.txt';
      sampleContent = `CERTIFICAT DE REMUNERATION 2025
Code 101 Rémunération brute: 68500.00 EUR
Code 103 Cotisations sociales: 8400.00 EUR
Code 105 Retenue d'impôt: 10250.00 EUR`;
    } else if (type === DocumentType.INTERETS_DEBITEURS) {
      fileName = 'Attestation_Pret_Immobilier_2025.txt';
      sampleContent = `BANQUE INTERETS DEBITEURS 2025
Prêt habitation principale occupation 2025
Montant des intérêts payés: 4200.00 EUR`;
    } else {
      fileName = 'Attestation_Assurance_111_2025.txt';
      sampleContent = `ASSURANCE ET PREVOYANCE VIE
Article 111 L.I.R.
Primes payées en 2025: 1200.00 EUR`;
    }

    const base64 = btoa(sampleContent);
    const res = await mobileApiClient.uploadDocument(householdId, 2025, {
      fileName,
      mimeType: 'text/plain',
      fileContentBase64: base64,
      visibility: DocumentVisibility.INCLUDED_IN_RETURN,
    });

    setActionLoading(false);
    if (res.data) {
      Alert.alert('Document Uploaded', `${fileName} uploaded and processed.`);
      await loadData();
    } else {
      Alert.alert('Upload Failed', res.error?.message || 'Could not upload document');
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0284c7" />
        <Text style={styles.loadingText}>Loading document vault...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />}
    >
      <Text style={styles.headerTitle}>Document Vault</Text>
      <Text style={styles.headerSubtitle}>
        Secure, deduplicated certificate store with line-by-line evidence linking
      </Text>

      {/* Upload Quick Actions */}
      <View style={styles.actionSection}>
        <Text style={styles.sectionLabel}>Add Evidence (Camera / File)</Text>
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            disabled={actionLoading}
            onPress={() => handleUploadSample(DocumentType.CERTIFICAT_REMUNERATION)}
          >
            <Text style={styles.btnText}>+ Salary Certificate</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnSecondary]}
            disabled={actionLoading}
            onPress={() => handleUploadSample(DocumentType.INTERETS_DEBITEURS)}
          >
            <Text style={styles.btnSecondaryText}>+ Mortgage Interest</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Unconfirmed Candidate Facts */}
      {facts.some((f) => !f.isConfirmed) && (
        <View style={styles.reviewCard}>
          <Text style={styles.reviewTitle}>Pending Fact Confirmations</Text>
          <Text style={styles.reviewDesc}>
            AI proposed facts require human confirmation before entering authoritative tax returns.
          </Text>

          {facts
            .filter((f) => !f.isConfirmed)
            .map((fact) => (
              <View key={fact.id} style={styles.factRow}>
                <View style={styles.factInfo}>
                  <Text style={styles.factField}>{fact.fieldName}</Text>
                  <Text style={styles.factValue}>
                    €{Number(fact.fieldValue).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Text>
                  <Text style={styles.factConfidence}>Confidence: {Math.round(fact.confidence * 100)}%</Text>
                </View>
                <TouchableOpacity
                  style={styles.confirmBtn}
                  disabled={actionLoading}
                  onPress={() => handleConfirmFact(fact.id)}
                >
                  <Text style={styles.confirmBtnText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            ))}
        </View>
      )}

      {/* Document List */}
      <Text style={[styles.sectionLabel, { marginTop: 20 }]}>
        Uploaded Certificates ({documents.length})
      </Text>

      {documents.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No documents in vault yet.</Text>
          <Text style={styles.emptySubtext}>Upload salary slips or mortgage certificates to begin.</Text>
        </View>
      ) : (
        documents.map((doc) => (
          <View key={doc.id} style={styles.docCard}>
            <View style={styles.docHeader}>
              <Text style={styles.docName}>{doc.originalName}</Text>
              <View style={[styles.badge, getVisibilityBadgeStyle(doc.visibility)]}>
                <Text style={styles.badgeText}>{formatVisibility(doc.visibility)}</Text>
              </View>
            </View>

            <Text style={styles.docMeta}>
              Type: {doc.documentType} • Size: {(doc.fileSize / 1024).toFixed(1)} KB
            </Text>

            <View style={styles.docFooter}>
              <Text style={styles.hashText}>SHA: {doc.sha256Hash.substring(0, 10)}...</Text>
              <TouchableOpacity
                style={styles.toggleBtn}
                disabled={actionLoading}
                onPress={() => handleToggleVisibility(doc.id, doc.visibility)}
              >
                <Text style={styles.toggleBtnText}>Change Visibility</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function getVisibilityBadgeStyle(visibility: DocumentVisibility) {
  switch (visibility) {
    case DocumentVisibility.INCLUDED_IN_RETURN:
      return { backgroundColor: '#dcfce7' };
    case DocumentVisibility.SHARED_FOR_DISCUSSION:
      return { backgroundColor: '#e0f2fe' };
    default:
      return { backgroundColor: '#f1f5f9' };
  }
}

function formatVisibility(v: DocumentVisibility) {
  switch (v) {
    case DocumentVisibility.INCLUDED_IN_RETURN:
      return 'Included in Return';
    case DocumentVisibility.SHARED_FOR_DISCUSSION:
      return 'Shared for Discussion';
    default:
      return 'Private Draft';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#64748b' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  headerSubtitle: { fontSize: 13, color: '#64748b', marginTop: 4, marginBottom: 16 },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 8 },
  actionSection: { backgroundColor: '#ffffff', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16 },
  actionButtons: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#0284c7' },
  btnText: { color: '#ffffff', fontWeight: '600', fontSize: 13 },
  btnSecondary: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1' },
  btnSecondaryText: { color: '#334155', fontWeight: '600', fontSize: 13 },
  reviewCard: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fef3c7', borderRadius: 12, padding: 14, marginBottom: 16 },
  reviewTitle: { fontSize: 15, fontWeight: '700', color: '#92400e', marginBottom: 4 },
  reviewDesc: { fontSize: 12, color: '#b45309', marginBottom: 12 },
  factRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff', padding: 10, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#fde68a' },
  factInfo: { flex: 1 },
  factField: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  factValue: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginTop: 2 },
  factConfidence: { fontSize: 11, color: '#64748b', marginTop: 2 },
  confirmBtn: { backgroundColor: '#059669', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6 },
  confirmBtnText: { color: '#ffffff', fontWeight: '600', fontSize: 12 },
  emptyCard: { backgroundColor: '#ffffff', padding: 24, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  emptyText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  emptySubtext: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  docCard: { backgroundColor: '#ffffff', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  docHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  docName: { fontSize: 14, fontWeight: '600', color: '#0f172a', flex: 1, marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#0f172a' },
  docMeta: { fontSize: 12, color: '#64748b', marginTop: 6 },
  docFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  hashText: { fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' },
  toggleBtn: { backgroundColor: '#f8fafc', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0' },
  toggleBtnText: { fontSize: 11, fontWeight: '600', color: '#0284c7' },
});
