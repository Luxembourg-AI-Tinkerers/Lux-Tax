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
import { DocumentDto, DocumentVisibility, DocumentType, ExtractedFactDto, FactCategory } from '@luxtax/contracts';
import { DocumentCameraScanner } from '../../src/components/DocumentCameraScanner';
import { resolveWorkspace } from '../../src/lib/workspace';
import { replayQueue } from '../../src/lib/queue-runtime';
import { canSeeAmount, REDACTED_PLACEHOLDER } from '../../src/lib/privacy';

export default function MobileDocumentsScreen() {
  const [documents, setDocuments] = useState<readonly DocumentDto[]>([]);
  const [facts, setFacts] = useState<readonly ExtractedFactDto[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);

  // MOB-5: a fact is readable only when its source document is shared with the
  // household; another member's private draft shows a placeholder instead.
  const canSeeFact = (fact: { documentId?: string | null }): boolean => {
    const source = documents.find((doc) => doc.id === fact.documentId);
    return canSeeAmount(
      { ownerId: source?.ownerId ?? null, visibility: source?.visibility ?? null },
      viewerId,
    );
  };

  const loadData = async () => {
    try {
      const me = await mobileApiClient.getMe();
      if (me.data) setViewerId(me.data.id);

      // MOB-1: every document call is workspace-scoped; resolve once here.
      const resolved = await resolveWorkspace(mobileApiClient, 2025);
      if (resolved.ok) {
        {
          const wId = resolved.workspaceId;
          setWorkspaceId(wId);

          const [docsRes, factsRes] = await Promise.all([
            mobileApiClient.getDocuments(wId),
            mobileApiClient.getFacts(wId),
          ]);

          // MOB-4: replay queued uploads so a scan sent offline appears here.
          try {
            await replayQueue(mobileApiClient);
          } catch {
            // best effort; the queue retries on the next refresh
          }

          if (docsRes.data) setDocuments(docsRes.data);
          if (factsRes.data) setFacts(factsRes.data.extractedFacts);
        }
      }
    } catch (err: any) {
      console.warn('Error loading document data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleVisibility = async (docId: string, current: DocumentVisibility) => {
    if (!workspaceId) return;
    const nextVis =
      current === DocumentVisibility.PRIVATE_DRAFT
        ? DocumentVisibility.SHARED_FOR_DISCUSSION
        : current === DocumentVisibility.SHARED_FOR_DISCUSSION
        ? DocumentVisibility.INCLUDED_IN_RETURN
        : DocumentVisibility.PRIVATE_DRAFT;

    setActionLoading(true);
    await mobileApiClient.updateDocumentVisibility(workspaceId, docId, nextVis);
    await loadData();
    setActionLoading(false);
  };

  const handleConfirmFact = async (fact: ExtractedFactDto) => {
    if (!workspaceId) return;
    setActionLoading(true);

    // Map fact field name to FactCategory
    let category = FactCategory.OTHER_DEDUCTION;
    if (fact.fieldName.includes('childcare') || fact.fieldName.includes('creche')) {
      category = FactCategory.CHILDCARE_EXPENSE;
    } else if (fact.fieldName.includes('donation')) {
      category = FactCategory.DONATION_DEDUCTION;
    } else if (fact.fieldName.includes('gross') || fact.fieldName.includes('salary')) {
      category = FactCategory.EMPLOYMENT_INCOME;
    } else if (fact.fieldName.includes('mortgage') || fact.fieldName.includes('interest')) {
      category = FactCategory.MORTGAGE_DEDUCTION;
    } else if (fact.fieldName.includes('insurance')) {
      category = FactCategory.INSURANCE_DEDUCTION;
    } else if (
      fact.fieldName.includes('work') ||
      fact.fieldName.includes('training') ||
      fact.fieldName.includes('course') ||
      fact.fieldName.includes('medical') ||
      fact.fieldName.includes('domestic') ||
      fact.fieldName.includes('invoice')
    ) {
      category = FactCategory.OTHER_DEDUCTION;
    }


    const res = await mobileApiClient.confirmFact(workspaceId, {
      extractedFactId: fact.id,
      fieldKey: fact.fieldName,
      amount: Number(fact.fieldValue).toFixed(2),
      category,
      currency: fact.currency || 'EUR',
      isIncludedInReturn: true,
      isSharedWithHousehold: true,
    });

    setActionLoading(false);
    if (res.data) {
      Alert.alert('Fact Confirmed', `Confirmed €${fact.fieldValue} as authoritative tax evidence.`);
      await loadData();
    } else {
      Alert.alert('Error', res.error?.message || 'Failed to confirm fact');
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

      {/* Camera Scanning Quick Action */}
      <View style={styles.scanHeroCard}>
        <View style={styles.scanHeroContent}>
          <Text style={styles.scanHeroTitle}>📷 Smart Receipt & Document Scanner</Text>
          <Text style={styles.scanHeroDesc}>
            Snap receipts, crèche invoices, donation slips, or employer certificates with your camera. AI automatically extracts deductible facts.
          </Text>
          <View style={styles.scanHeroActions}>
            <TouchableOpacity
              style={styles.scanHeroBtn}
              onPress={() => setScannerVisible(true)}
              disabled={actionLoading}
            >
              <Text style={styles.scanHeroBtnText}>⚡ Scan with Camera</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.scanHeroSecondaryBtn}
              onPress={() => setScannerVisible(true)}
              disabled={actionLoading}
            >
              <Text style={styles.scanHeroSecondaryBtnText}>Upload File / Photo</Text>
            </TouchableOpacity>
          </View>
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
                    {canSeeFact(fact)
                      ? `€${Number(fact.fieldValue).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                      : REDACTED_PLACEHOLDER}
                  </Text>
                  <Text style={styles.factConfidence}>Confidence: {Math.round(fact.confidence * 100)}%</Text>
                </View>
                <TouchableOpacity
                  style={styles.confirmBtn}
                  disabled={actionLoading}
                  onPress={() => handleConfirmFact(fact)}
                >
                  <Text style={styles.confirmBtnText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            ))}
        </View>
      )}

      {/* Document List */}
      <Text style={[styles.sectionLabel, { marginTop: 12 }]}>
        Uploaded Evidence & Receipts ({documents.length})
      </Text>

      {documents.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>🧾</Text>
          <Text style={styles.emptyText}>No documents in vault yet.</Text>
          <Text style={styles.emptySubtext}>Use the camera scanner above to upload receipts or salary certificates.</Text>
        </View>
      ) : (
        documents.map((doc) => (
          <View key={doc.id} style={styles.docCard}>
            <View style={styles.docHeader}>
              <Text style={styles.docName} numberOfLines={1}>{doc.originalName}</Text>
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

      {/* Camera Scanner Modal */}
      {workspaceId && (
        <DocumentCameraScanner
          visible={scannerVisible}
          workspaceId={workspaceId}
          taxYear={2025}
          onClose={() => setScannerVisible(false)}
          onUploadSuccess={() => loadData()}
        />
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
  scanHeroCard: {
    backgroundColor: '#0284c7',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  scanHeroContent: {},
  scanHeroTitle: { fontSize: 16, fontWeight: '800', color: '#ffffff' },
  scanHeroDesc: { fontSize: 12, color: '#e0f2fe', marginTop: 6, lineHeight: 18 },
  scanHeroActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  scanHeroBtn: {
    flex: 1.2,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  scanHeroBtnText: { color: '#0284c7', fontWeight: '800', fontSize: 13 },
  scanHeroSecondaryBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  scanHeroSecondaryBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 12 },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 8 },
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
  emptyCard: { backgroundColor: '#ffffff', padding: 28, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', marginVertical: 8 },
  emptyIcon: { fontSize: 32, marginBottom: 8 },
  emptyText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  emptySubtext: { fontSize: 12, color: '#94a3b8', marginTop: 4, textAlign: 'center' },
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
