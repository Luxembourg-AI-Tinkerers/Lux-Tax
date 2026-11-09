import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { DocumentVisibility, DocumentType, DocumentDto } from '@luxtax/contracts';
import { mobileApiClient } from '../lib/api-client';
import { enqueueOperation, isNetworkError, replayQueue } from '../lib/queue-runtime';

interface DocumentCameraScannerProps {
  visible: boolean;
  /** MOB-1: uploads are workspace-scoped; a household id must not be passed here. */
  workspaceId: string;
  taxYear: number;
  onClose: () => void;
  onUploadSuccess: (doc: DocumentDto) => void;
}

interface CapturedScan {
  uri: string;
  base64: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export function DocumentCameraScanner({
  visible,
  workspaceId,
  taxYear,
  onClose,
  onUploadSuccess,
}: DocumentCameraScannerProps) {
  const [captured, setCaptured] = useState<CapturedScan | null>(null);
  const [selectedType, setSelectedType] = useState<DocumentType>(DocumentType.CHILDCARE_INVOICE);
  const [visibility, setVisibility] = useState<DocumentVisibility>(DocumentVisibility.INCLUDED_IN_RETURN);
  const [uploading, setUploading] = useState(false);

  // MOB-4: opening the scanner is a natural moment to drain the queue.
  useEffect(() => {
    if (!visible) return;
    void replayQueue(mobileApiClient).catch(() => undefined);
  }, [visible]);

  // 1. Launch Camera to scan receipt
  const handleLaunchCamera = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Camera Permission Required',
          'Luxembourg Tax Workspace needs camera access to scan your receipts and tax certificates.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.85,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const dateStr = new Date().toISOString().split('T')[0];
        const fileName = `Receipt_Scan_${dateStr}_${Math.floor(Math.random() * 1000)}.jpg`;

        setCaptured({
          uri: asset.uri,
          base64: asset.base64 || '',
          fileName: asset.fileName || fileName,
          mimeType: asset.mimeType || 'image/jpeg',
          fileSize: asset.fileSize || Math.round((asset.base64?.length || 0) * 0.75),
        });
      }
    } catch (err: any) {
      Alert.alert('Camera Error', err.message || 'Could not open camera');
    }
  };

  // 2. Select photo from gallery
  const handleSelectFromLibrary = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Photo Library Access Required',
          'Please allow access to your photo library to pick receipt photos.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.85,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const fileName = asset.fileName || `Receipt_Photo_${Date.now()}.jpg`;

        setCaptured({
          uri: asset.uri,
          base64: asset.base64 || '',
          fileName,
          mimeType: asset.mimeType || 'image/jpeg',
          fileSize: asset.fileSize || Math.round((asset.base64?.length || 0) * 0.75),
        });
      }
    } catch (err: any) {
      Alert.alert('Gallery Error', err.message || 'Could not access photo library');
    }
  };

  // 3. Pick PDF document from files
  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        // Read file to base64
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const reader = new FileReader();

        reader.onloadend = () => {
          const base64data = (reader.result as string).split(',')[1];
          setCaptured({
            uri: asset.uri,
            base64: base64data,
            fileName: asset.name,
            mimeType: asset.mimeType || 'application/pdf',
            fileSize: asset.size || 0,
          });
        };
        reader.readAsDataURL(blob);
      }
    } catch (err: any) {
      Alert.alert('File Picker Error', err.message || 'Could not select document');
    }
  };

  // 4. Submit scan to backend API
  const handleUpload = async () => {
    if (!captured || !captured.base64) {
      Alert.alert('Missing Scan', 'No image content captured. Please retake the photo.');
      return;
    }

    setUploading(true);
    try {
      const body = {
        fileName: captured.fileName,
        mimeType: captured.mimeType,
        fileContentBase64: captured.base64,
        visibility,
      };
      const res = await mobileApiClient.uploadDocument(workspaceId, body);

      setUploading(false);

      // MOB-4: keep the scan instead of losing it when the connection drops.
      if (!res.data && isNetworkError(res.error?.message)) {
        const queued = await enqueueOperation({
          kind: 'UPLOAD_DOCUMENT',
          workspaceId,
          payload: body,
          dedupeKey: `upload:${workspaceId}:${captured.fileName}`,
        });
        Alert.alert(
          'Saved offline',
          queued.ok
            ? 'You are offline. The scan is queued and will be uploaded when the connection returns.'
            : 'You are offline, and this scan is already queued.',
        );
        handleReset();
        onClose();
        return;
      }

      if (res.data) {
        Alert.alert(
          'Document Processed',
          `AI analyzed "${captured.fileName}" and extracted candidate facts for your review!`
        );
        onUploadSuccess(res.data);
        handleReset();
        onClose();
      } else {
        Alert.alert('Upload Failed', res.error?.message || 'Failed to process document scan');
      }
    } catch (err: any) {
      setUploading(false);
      Alert.alert('Upload Failed', err.message || 'Network error');
    }
  };

  const handleReset = () => {
    setCaptured(null);
    setSelectedType(DocumentType.CHILDCARE_INVOICE);
    setVisibility(DocumentVisibility.INCLUDED_IN_RETURN);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalRoot}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Scan Receipt & Documents</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {!captured ? (
          /* Step 1: Scanner Viewfinder & Capture Options */
          <ScrollView contentContainerStyle={styles.scannerBody}>
            {/* Viewfinder Alignment Guide */}
            <View style={styles.viewfinderCard}>
              <View style={styles.viewfinderOverlay}>
                <View style={[styles.cornerBracket, styles.topLeft]} />
                <View style={[styles.cornerBracket, styles.topRight]} />
                <View style={[styles.cornerBracket, styles.bottomLeft]} />
                <View style={[styles.cornerBracket, styles.bottomRight]} />

                <Text style={styles.guideIcon}>📸</Text>
                <Text style={styles.guideTitle}>Position Receipt Inside Frame</Text>
                <Text style={styles.guideSubtitle}>
                  Ensure good lighting, flat edges, and clear total amount and vendor name.
                </Text>
              </View>
            </View>

            {/* Scanning Mode Actions */}
            <View style={styles.actionGrid}>
              <TouchableOpacity style={styles.primaryActionBtn} onPress={handleLaunchCamera}>
                <Text style={styles.primaryActionIcon}>📷</Text>
                <Text style={styles.primaryActionTitle}>Scan with Phone Camera</Text>
                <Text style={styles.primaryActionSub}>Instant capture with auto-crop</Text>
              </TouchableOpacity>

              <View style={styles.secondaryRow}>
                <TouchableOpacity style={styles.secondaryActionBtn} onPress={handleSelectFromLibrary}>
                  <Text style={styles.secondaryActionIcon}>🖼️</Text>
                  <Text style={styles.secondaryActionTitle}>Photo Library</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.secondaryActionBtn} onPress={handlePickDocument}>
                  <Text style={styles.secondaryActionIcon}>📑</Text>
                  <Text style={styles.secondaryActionTitle}>Files / PDF</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Luxembourg Tax Tips Card */}
            <View style={styles.tipCard}>
              <Text style={styles.tipTitle}>💡 Deductible Receipts & Invoices in Luxembourg</Text>
              <Text style={styles.tipItem}>• 💼 Work equipment, laptop, office gear (Frais d'obtention)</Text>
              <Text style={styles.tipItem}>• 🎓 Professional courses, training & certifications</Text>
              <Text style={styles.tipItem}>• 🩺 Medical, dental & optical bills (CNS non-reimbursed)</Text>
              <Text style={styles.tipItem}>• 👶 Daycare & crèche invoices (up to €5,400/child)</Text>
              <Text style={styles.tipItem}>• 🧹 Domestic help & cleaning receipts (Art. 127bis)</Text>
              <Text style={styles.tipItem}>• 🎁 Charitable donations over €120 (Art. 112)</Text>
            </View>
          </ScrollView>
        ) : (
          /* Step 2: Review, Classify & Upload Screen */
          <ScrollView contentContainerStyle={styles.reviewBody}>
            <View style={styles.previewContainer}>
              <Image source={{ uri: captured.uri }} style={styles.previewImage} resizeMode="contain" />
              <View style={styles.previewBadge}>
                <Text style={styles.previewBadgeText}>
                  {(captured.fileSize / 1024).toFixed(1)} KB • {captured.mimeType.split('/')[1]?.toUpperCase()}
                </Text>
              </View>
            </View>

            {/* Document Classification */}
            <Text style={styles.sectionHeader}>Detected / Selected Category</Text>
            <View style={styles.categoryRow}>
              {[
                { type: DocumentType.CHILDCARE_INVOICE, label: '💼 Work Expense' },
                { type: DocumentType.CHILDCARE_INVOICE, label: '🎓 Course / Training' },
                { type: DocumentType.CHILDCARE_INVOICE, label: '👶 Daycare / Crèche' },
                { type: DocumentType.CHILDCARE_INVOICE, label: '🩺 Medical Bill' },
                { type: DocumentType.DONATION_CERTIFICATE, label: '🎁 Charity Donation' },
                { type: DocumentType.SALARY_CERTIFICATE, label: '📄 Salary Slip' },
                { type: DocumentType.MORTGAGE_CERTIFICATE, label: '🏠 Mortgage Interest' },
                { type: DocumentType.INSURANCE_CERTIFICATE, label: '🛡️ Insurance / Pension' },
                { type: DocumentType.UNKNOWN, label: '📑 Invoice / Other' },
              ].map((cat, idx) => (
                <TouchableOpacity
                  key={`${cat.label}-${idx}`}
                  style={[styles.catChip, selectedType === cat.type && styles.catChipActive]}
                  onPress={() => setSelectedType(cat.type)}
                >
                  <Text style={[styles.catChipText, selectedType === cat.type && styles.catChipTextActive]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>


            {/* Visibility Selection */}
            <Text style={styles.sectionHeader}>Evidence Visibility</Text>
            <View style={styles.visibilityRow}>
              {[
                { val: DocumentVisibility.INCLUDED_IN_RETURN, label: 'Include in Return' },
                { val: DocumentVisibility.SHARED_FOR_DISCUSSION, label: 'Share with Spouse' },
                { val: DocumentVisibility.PRIVATE_DRAFT, label: 'Private Draft' },
              ].map((v) => (
                <TouchableOpacity
                  key={v.val}
                  style={[styles.visBtn, visibility === v.val && styles.visBtnActive]}
                  onPress={() => setVisibility(v.val)}
                >
                  <Text style={[styles.visBtnText, visibility === v.val && styles.visBtnTextActive]}>
                    {v.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Action Buttons */}
            <View style={styles.bottomActions}>
              <TouchableOpacity
                style={[styles.btn, styles.uploadBtn]}
                disabled={uploading}
                onPress={handleUpload}
              >
                {uploading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.uploadBtnText}>⚡ Upload & Extract with AI</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, styles.retakeBtn]}
                disabled={uploading}
                onPress={() => setCaptured(null)}
              >
                <Text style={styles.retakeBtnText}>Retake Photo</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  closeBtn: { padding: 8, borderRadius: 20, backgroundColor: '#f1f5f9' },
  closeBtnText: { fontSize: 14, fontWeight: 'bold', color: '#64748b' },
  scannerBody: { padding: 20 },
  viewfinderCard: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    height: 240,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    overflow: 'hidden',
  },
  viewfinderOverlay: {
    width: '85%',
    height: '80%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    position: 'relative',
  },
  cornerBracket: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: '#38bdf8',
  },
  topLeft: { top: -2, left: -2, borderTopWidth: 3, borderLeftWidth: 3 },
  topRight: { top: -2, right: -2, borderTopWidth: 3, borderRightWidth: 3 },
  bottomLeft: { bottom: -2, left: -2, borderBottomWidth: 3, borderLeftWidth: 3 },
  bottomRight: { bottom: -2, right: -2, borderBottomWidth: 3, borderRightWidth: 3 },
  guideIcon: { fontSize: 36, marginBottom: 8 },
  guideTitle: { color: '#ffffff', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  guideSubtitle: { color: '#94a3b8', fontSize: 12, textAlign: 'center', marginTop: 4 },
  actionGrid: { marginBottom: 20 },
  primaryActionBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryActionIcon: { fontSize: 26, marginBottom: 4 },
  primaryActionTitle: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  primaryActionSub: { color: '#bae6fd', fontSize: 12, marginTop: 2 },
  secondaryRow: { flexDirection: 'row', gap: 12 },
  secondaryActionBtn: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  secondaryActionIcon: { fontSize: 20, marginBottom: 4 },
  secondaryActionTitle: { fontSize: 13, fontWeight: '600', color: '#334155' },
  tipCard: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 14,
    padding: 14,
  },
  tipTitle: { fontSize: 13, fontWeight: '700', color: '#0369a1', marginBottom: 6 },
  tipItem: { fontSize: 12, color: '#0c4a6e', lineHeight: 18 },
  reviewBody: { padding: 20 },
  previewContainer: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    height: 280,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  previewImage: { width: '100%', height: '100%' },
  previewBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  previewBadgeText: { color: '#ffffff', fontSize: 11, fontWeight: '600' },
  sectionHeader: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 8, marginTop: 10 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  catChip: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  catChipActive: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  catChipText: { fontSize: 12, color: '#475569', fontWeight: '500' },
  catChipTextActive: { color: '#ffffff', fontWeight: '700' },
  visibilityRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  visBtn: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  visBtnActive: { backgroundColor: '#eff6ff', borderColor: '#3b82f6' },
  visBtnText: { fontSize: 11, color: '#475569', fontWeight: '500', textAlign: 'center' },
  visBtnTextActive: { color: '#1d4ed8', fontWeight: '700' },
  bottomActions: { marginTop: 10, gap: 10 },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  uploadBtn: { backgroundColor: '#0284c7' },
  uploadBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  retakeBtn: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1' },
  retakeBtnText: { color: '#475569', fontSize: 14, fontWeight: '600' },
});
