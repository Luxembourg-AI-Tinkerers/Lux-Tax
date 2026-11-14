'use client';

import React, { useState, useRef, useEffect } from 'react';
import { DocumentVisibility, DocumentType, DocumentDto } from '@luxtax/contracts';
import { apiClient } from '../lib/api';

/**
 * The scan categories, each with a stable id so a click selects one chip. Where
 * the document model has no matching type the scan is sent as UNKNOWN, which is
 * what the API assumed before — sending the wrong type would mis-file the
 * extracted figures.
 */
const SCAN_CATEGORIES: readonly { id: string; type: DocumentType; label: string }[] = [
  { id: 'work-expense', type: DocumentType.UNKNOWN, label: '💼 Work Expense' },
  { id: 'training', type: DocumentType.UNKNOWN, label: '🎓 Course / Training' },
  { id: 'childcare', type: DocumentType.CHILDCARE_INVOICE, label: '👶 Daycare / Crèche' },
  { id: 'medical', type: DocumentType.UNKNOWN, label: '🩺 Medical Invoice' },
  { id: 'donation', type: DocumentType.DONATION_CERTIFICATE, label: '🎁 Charity Donation' },
  { id: 'salary', type: DocumentType.SALARY_CERTIFICATE, label: '📄 Salary Slip' },
  { id: 'mortgage', type: DocumentType.MORTGAGE_CERTIFICATE, label: '🏠 Mortgage Interest' },
  { id: 'insurance', type: DocumentType.INSURANCE_CERTIFICATE, label: '🛡️ Insurance / Pension' },
  { id: 'other', type: DocumentType.UNKNOWN, label: '📑 Invoice / Other' },
];

interface CameraScanModalProps {
  isOpen: boolean;
  workspaceId: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export function CameraScanModal({
  isOpen,
  workspaceId,
  onClose,
  onSuccess,
  onError,
}: CameraScanModalProps) {
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState(SCAN_CATEGORIES[2].id);
  const [visibility, setVisibility] = useState<DocumentVisibility>(DocumentVisibility.INCLUDED_IN_RETURN);
  const [uploading, setUploading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Stop camera stream on cleanup or modal close
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setCapturedImage(null);
      setCameraError(null);
    }
  }, [isOpen]);

  // Escape closes the dialog, except while the scan is being uploaded.
  useEffect(() => {
    if (!isOpen || uploading) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, uploading, onClose]);

  const selectedCategory =
    SCAN_CATEGORIES.find((category) => category.id === selectedCategoryId) ??
    SCAN_CATEGORIES[SCAN_CATEGORIES.length - 1];

  // Start live webcam stream
  const startCamera = async () => {
    setCameraError(null);
    try {
      // getUserMedia only exists in a secure context. A phone opening the dev
      // server by its LAN address (http://192.168.x.x:3000) is not one, so the
      // API is missing rather than the permission being refused; point at the
      // native-camera button instead of blaming the user.
      if (window.isSecureContext === false || !navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          'Live camera needs HTTPS (or localhost). On this address use "Snap with Phone Camera" instead - it opens your phone\u2019s own camera.'
        );
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Camera permission was denied. You can still use the "Upload Photo" button below.'
          : 'Could not access camera on this device. Please use file upload.'
      );
      setCameraActive(false);
    }
  };

  // Capture snapshot from webcam video
  const takeSnapshot = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    setCapturedImage(dataUrl);
    stopCamera();
  };

  // Handle direct file/photo selection from mobile native camera or gallery
  const handleFileCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setCapturedImage(reader.result as string);
      stopCamera();
    };
    reader.readAsDataURL(file);
  };

  // Upload to API
  const handleUpload = async () => {
    if (!capturedImage) return;

    setUploading(true);
    const base64 = capturedImage.split(',')[1];
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `Scan_Receipt_${dateStr}_${Math.floor(Math.random() * 1000)}.jpg`;

    // The API accepts private drafts only. The chosen visibility is applied by
    // a second, audited call so a failed promotion is reported instead of the
    // scan silently staying private (or being uploaded as included).
    const res = await apiClient.uploadDocument(workspaceId, {
      fileName,
      fileContentBase64: base64,
      mimeType: 'image/jpeg',
      // The chip the user picked is part of the upload, not decoration.
      documentType: selectedCategory.type,
    });

    if (res.error) {
      setUploading(false);
      onError(res.error);
      return;
    }

    if (!res.data) {
      setUploading(false);
      onError(
        `Document "${fileName}" was saved as a private draft, but the upload response had no document id; set its visibility from the documents list.`,
      );
      onClose();
      return;
    }

    // A private scan needs no promotion; any other state is applied explicitly.
    const patch =
      visibility === DocumentVisibility.PRIVATE_DRAFT
        ? null
        : await apiClient.updateDocumentVisibility(workspaceId, res.data.id, visibility);
    setUploading(false);

    if (patch?.error) {
      onError(
        `Document "${fileName}" is saved as a private draft, but applying "${visibility}" failed: ${patch.error}`,
      );
      onClose();
      return;
    }

    onSuccess(`Document "${fileName}" scanned & extracted with AI successfully!`);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="camera-scan-title"
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200 dark:border-slate-800"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center space-x-2">
            <span className="text-xl">📸</span>
            <h3 id="camera-scan-title" className="font-bold text-slate-900 dark:text-white text-base">
              Scan Receipt &amp; Tax Documents
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close scanner"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {!capturedImage ? (
            /* Mode A: Live Camera or Upload options */
            <div className="space-y-4">
              {cameraActive ? (
                /* Live Viewfinder */
                <div className="relative bg-slate-950 rounded-xl overflow-hidden aspect-4/3 flex items-center justify-center">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  {/* Framing Guide Overlay */}
                  <div className="absolute inset-8 border-2 border-dashed border-sky-400/80 rounded-xl pointer-events-none flex flex-col items-center justify-between p-4">
                    <span className="text-xs font-semibold text-white/90 bg-slate-900/70 px-3 py-1 rounded-full">
                      Align receipt or document inside frame
                    </span>
                    <span className="text-xs text-sky-200 bg-slate-900/70 px-3 py-1 rounded-full">
                      Hold still with good lighting
                    </span>
                  </div>

                  {/* Shutter Button */}
                  <div className="absolute bottom-4 inset-x-0 flex justify-center space-x-4">
                    <button
                      onClick={takeSnapshot}
                      className="px-6 py-2.5 bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-full shadow-lg shadow-sky-500/30 transition flex items-center space-x-2"
                    >
                      <span>📸</span>
                      <span>Capture Photo</span>
                    </button>
                    <button
                      onClick={stopCamera}
                      className="px-4 py-2.5 bg-slate-800/80 hover:bg-slate-800 text-slate-200 text-xs font-semibold rounded-full"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* Scanner Start Options */
                <div className="space-y-4">
                  {cameraError && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-xs rounded-xl border border-amber-200 dark:border-amber-800">
                      {cameraError}
                    </div>
                  )}

                  <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="w-16 h-16 mx-auto mb-4 bg-sky-100 dark:bg-sky-950/60 rounded-2xl flex items-center justify-center text-3xl">
                      📷
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                      Ready to Scan Receipt or Evidence
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-6">
                      Capture daycare bills, donation receipts, salary slips, or bank interest statements. AI will automatically extract deductible facts.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <button
                        onClick={startCamera}
                        className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-md shadow-sky-600/20 transition flex items-center justify-center space-x-2"
                      >
                        <span>📹</span>
                        <span>Open Live Camera</span>
                      </button>

                      <label className="px-5 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-xl border border-slate-300 dark:border-slate-700 transition cursor-pointer flex items-center justify-center space-x-2">
                        <span>📱</span>
                        <span>Snap with Phone Camera</span>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handleFileCapture}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Tips banner */}
                  <div className="p-3.5 bg-sky-50 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900/50 rounded-xl text-xs text-sky-800 dark:text-sky-300 space-y-1">
                    <p className="font-semibold">💡 Tips for Luxembourg Tax Deductions:</p>
                    <p>• 💼 Work equipment, laptop & travel qualify as Frais d'obtention.</p>
                    <p>• 🎓 Professional courses, training & certifications are deductible.</p>
                    <p>• 🩺 Medical, dental & optical bills qualify under Art. 127 (dépenses extraordinaires).</p>
                    <p>• 👶 Daycare & crèche invoices qualify for up to €5,400 deduction per child.</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Mode B: Preview Captured Scan, Tag Category, and Upload */
            <div className="space-y-4">
              <div className="relative bg-slate-950 rounded-xl overflow-hidden aspect-4/3 flex items-center justify-center border border-slate-200 dark:border-slate-800">
                <img
                  src={capturedImage}
                  alt="Captured receipt"
                  className="w-full h-full object-contain"
                />
                <span className="absolute top-3 left-3 bg-emerald-500 text-white text-xs font-bold px-2.5 py-1 rounded-md shadow">
                  ✓ Photo Captured
                </span>
              </div>

              {/* Category Picker */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Document Category
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {SCAN_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategoryId(cat.id)}
                      aria-pressed={selectedCategoryId === cat.id}
                      className={`text-xs py-2 px-2.5 rounded-lg border font-medium text-center transition ${
                        selectedCategoryId === cat.id
                          ? 'bg-sky-50 border-sky-500 text-sky-700 dark:bg-sky-950 dark:border-sky-400 dark:text-sky-300 font-bold'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>


              {/* Visibility Choice */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Evidence Visibility
                </label>
                <div className="flex gap-2">
                  {[
                    { val: DocumentVisibility.INCLUDED_IN_RETURN, label: 'Include in Return' },
                    { val: DocumentVisibility.SHARED_FOR_DISCUSSION, label: 'Share with Spouse' },
                    { val: DocumentVisibility.PRIVATE_DRAFT, label: 'Private Draft' },
                  ].map((v) => (
                    <button
                      key={v.val}
                      type="button"
                      onClick={() => setVisibility(v.val)}
                      className={`flex-1 text-xs py-2 px-2 rounded-lg border font-medium text-center transition ${
                        visibility === v.val
                          ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-950 dark:border-blue-400 dark:text-blue-300 font-bold'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex gap-3">
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="flex-1 py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-md shadow-sky-600/25 transition disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  {uploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Extracting with AI...</span>
                    </>
                  ) : (
                    <span>⚡ Upload & Extract Facts with AI</span>
                  )}
                </button>

                <button
                  onClick={() => setCapturedImage(null)}
                  disabled={uploading}
                  className="px-4 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-semibold text-xs rounded-xl transition"
                >
                  Retake
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
