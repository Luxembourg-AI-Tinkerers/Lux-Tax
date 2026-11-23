'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Baby,
  Briefcase,
  Camera,
  Check,
  FileText,
  GraduationCap,
  HeartHandshake,
  Home,
  Lightbulb,
  Loader2,
  Receipt,
  RotateCcw,
  Shield,
  Smartphone,
  Sparkles,
  Stethoscope,
  Video,
} from 'lucide-react';
import { DocumentVisibility, DocumentType } from '@luxtax/contracts';
import { apiClient } from '../lib/api';
import { Modal } from './ui/Modal';

/**
 * The scan categories, each with a stable id so a click selects one chip. Where
 * the document model has no matching type the scan is sent as UNKNOWN, which is
 * what the API assumed before — sending the wrong type would mis-file the
 * extracted figures.
 */
const SCAN_CATEGORIES: readonly {
  id: string;
  type: DocumentType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'work-expense', type: DocumentType.UNKNOWN, label: 'Work Expense', icon: Briefcase },
  { id: 'training', type: DocumentType.UNKNOWN, label: 'Course / Training', icon: GraduationCap },
  { id: 'childcare', type: DocumentType.CHILDCARE_INVOICE, label: 'Daycare / Crèche', icon: Baby },
  { id: 'medical', type: DocumentType.UNKNOWN, label: 'Medical Invoice', icon: Stethoscope },
  { id: 'donation', type: DocumentType.DONATION_CERTIFICATE, label: 'Charity Donation', icon: HeartHandshake },
  { id: 'salary', type: DocumentType.SALARY_CERTIFICATE, label: 'Salary Slip', icon: FileText },
  { id: 'mortgage', type: DocumentType.MORTGAGE_CERTIFICATE, label: 'Mortgage Interest', icon: Home },
  { id: 'insurance', type: DocumentType.INSURANCE_CERTIFICATE, label: 'Insurance / Pension', icon: Shield },
  { id: 'other', type: DocumentType.UNKNOWN, label: 'Invoice / Other', icon: Receipt },
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

  const selectedCategory =
    SCAN_CATEGORIES.find((category) => category.id === selectedCategoryId) ??
    SCAN_CATEGORIES[SCAN_CATEGORIES.length - 1];

  const startCamera = async () => {
    setCameraError(null);
    try {
      // getUserMedia only exists in a secure context. A phone opening the dev
      // server by its LAN address (http://192.168.x.x:3000) is not one, so the
      // API is missing rather than the permission being refused; point at the
      // native-camera button instead of blaming the user.
      if (window.isSecureContext === false || !navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          'Live camera needs HTTPS (or localhost). On this address use "Snap with Phone Camera" instead — it opens your phone\u2019s own camera.'
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
          ? 'Camera permission was denied. You can still use the "Snap with Phone Camera" button below.'
          : 'Could not access camera on this device. Please use file upload.'
      );
      setCameraActive(false);
    }
  };

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      disableEscape={uploading}
      titleId="camera-scan-title"
      title="Scan Receipt & Tax Documents"
      subtitle="Capture receipts or certificates to extract deductible figures automatically."
      icon={<Camera className="h-4.5 w-4.5" aria-hidden="true" />}
      closeLabel="Close scanner"
      maxWidthClass="max-w-xl"
    >
      {!capturedImage ? (
        <div className="space-y-4">
          {cameraActive ? (
            <div className="relative flex aspect-4/3 items-center justify-center overflow-hidden rounded-xl bg-zinc-950">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-6 flex flex-col items-center justify-between rounded-xl border-2 border-dashed border-sky-400/80 p-4">
                <span className="rounded-full bg-zinc-900/85 px-3 py-1 text-xs font-semibold text-white">
                  Align receipt or document inside frame
                </span>
                <span className="rounded-full bg-zinc-900/85 px-3 py-1 text-xs text-sky-200">
                  Hold still with good lighting
                </span>
              </div>

              <div className="absolute inset-x-0 bottom-4 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={takeSnapshot}
                  className="inline-flex items-center gap-2 rounded-full bg-zinc-950/90 px-6 py-2.5 text-xs font-bold text-white ring-1 ring-white/25 shadow-lg transition hover:bg-zinc-800 active:scale-[0.98] dark:bg-zinc-900/90 dark:hover:bg-zinc-800"
                >
                  <Camera className="h-4 w-4" aria-hidden="true" />
                  <span>Capture Photo</span>
                </button>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="rounded-full bg-zinc-800/90 px-4 py-2.5 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {cameraError && (
                <div
                  role="alert"
                  className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs font-medium text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-200"
                >
                  {cameraError}
                </div>
              )}

              <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-8 text-center dark:border-zinc-700/80 dark:bg-[#12151b]">
                <div className="mx-auto mb-3.5 flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800/70 dark:bg-sky-950/60 dark:text-sky-300">
                  <Camera className="h-6 w-6" aria-hidden="true" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-50">
                  Ready to Scan Receipt or Evidence
                </h4>
                <p className="mx-auto mt-1.5 mb-6 max-w-sm text-xs leading-relaxed text-slate-500 dark:text-zinc-400">
                  Capture daycare bills, donation receipts, salary slips, or bank interest statements for automatic figure extraction.
                </p>

                <div className="flex flex-col justify-center gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={startCamera}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800 active:scale-[0.98] dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
                  >
                    <Video className="h-4 w-4" aria-hidden="true" />
                    <span>Open Live Camera</span>
                  </button>

                  <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800">
                    <Smartphone className="h-4 w-4 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
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

              <div className="space-y-1.5 rounded-xl border border-sky-200/70 bg-sky-50/70 p-4 text-xs text-sky-900 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-200">
                <p className="flex items-center gap-1.5 font-bold text-sky-950 dark:text-sky-100">
                  <Lightbulb className="h-3.5 w-3.5 text-sky-700 dark:text-sky-400" aria-hidden="true" />
                  <span>Common Deductible Evidence (Luxembourg LIR)</span>
                </p>
                <ul className="space-y-1 pl-5 text-[11px] leading-relaxed text-sky-800 list-disc dark:text-sky-300">
                  <li>Work equipment, laptops &amp; training qualify as Frais d&apos;obtention.</li>
                  <li>Medical, dental &amp; optical bills qualify under Art. 127 (dépenses extraordinaires).</li>
                  <li>Daycare &amp; crèche invoices qualify up to €5,400 forfait per child.</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="relative flex aspect-4/3 items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950 dark:border-zinc-800">
            <img
              src={capturedImage}
              alt="Captured receipt"
              className="h-full w-full object-contain"
            />
            <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs">
              <Check className="h-3 w-3" aria-hidden="true" />
              <span>Photo Captured</span>
            </span>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
              Document Category
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SCAN_CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const active = selectedCategoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(cat.id)}
                    aria-pressed={active}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition ${
                      active
                        ? 'border-zinc-950 bg-zinc-950 font-bold text-white shadow-2xs dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                        : 'border-zinc-200 bg-white font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
              Evidence Visibility
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { val: DocumentVisibility.INCLUDED_IN_RETURN, label: 'Include in Return' },
                { val: DocumentVisibility.SHARED_FOR_DISCUSSION, label: 'Share with Spouse' },
                { val: DocumentVisibility.PRIVATE_DRAFT, label: 'Private Draft' },
              ].map((v) => (
                <button
                  key={v.val}
                  type="button"
                  onClick={() => setVisibility(v.val)}
                  className={`rounded-xl border px-2.5 py-2 text-center text-xs transition ${
                    visibility === v.val
                      ? 'border-zinc-950 bg-zinc-950 font-bold text-white shadow-2xs dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                      : 'border-zinc-200 bg-white font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2.5 border-t border-slate-100 pt-4 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setCapturedImage(null)}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Retake</span>
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Extracting with AI...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  <span>Upload &amp; Extract Facts with AI</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
