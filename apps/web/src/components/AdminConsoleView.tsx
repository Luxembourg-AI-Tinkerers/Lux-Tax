'use client';

import React, { useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  Check,
  Cpu,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { HelpTip } from './HelpTip';
import { apiClient } from '../lib/api';
import {
  AdminOverviewDto,
  TaxRulePackageDto,
  FormMappingDto,
  ModelDefinitionDto,
  ModelRouteDto,
  EvaluationRunDto,
  AuditEventDto,
  TaxDeadlineDto,
} from '@luxtax/contracts';
import { LUXEMBOURG_TAX_TERMS } from '@luxtax/design-tokens';
import { ToastBanner, type ToastMessage } from './ui/ToastBanner';
import { Modal } from './ui/Modal';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { CardGridSkeleton, Skeleton } from './ui/Skeleton';
import { StatusBadge } from './ui/StatusBadge';

interface ModelPreset {
  readonly name: string;
  readonly displayName: string;
  readonly providerType: 'CUSTOM_PUBLIC' | 'HOSTED' | 'PRIVATE_CLOUD' | 'LOCAL';
  readonly modelIdentifier: string;
  readonly endpointUrl: string;
  readonly capabilities: readonly ('TEXT' | 'VISION' | 'EMBEDDING' | 'RERANKING')[];
  readonly permittedDataClass: 'PUBLIC' | 'SYNTHETIC' | 'REDACTED_CUSTOMER' | 'CUSTOMER_DOCUMENT';
  readonly hostingRegion: string;
  readonly description: string;
}

const MODEL_PRESETS: readonly ModelPreset[] = [
  {
    name: 'Mistral Large (EU Sovereign)',
    displayName: 'Mistral Large 2 (EU Public)',
    providerType: 'CUSTOM_PUBLIC',
    modelIdentifier: 'mistral-large-latest',
    endpointUrl: 'https://api.mistral.ai/v1',
    capabilities: ['TEXT'],
    permittedDataClass: 'CUSTOMER_DOCUMENT',
    hostingRegion: 'EU_WEST_1',
    description: 'Compliant European sovereign cloud LLM with advanced multilingual French/German/Luxembourgish reasoning',
  },
  {
    name: 'OpenAI (GPT-4o)',
    displayName: 'OpenAI GPT-4o Vision & Reasoning',
    providerType: 'CUSTOM_PUBLIC',
    modelIdentifier: 'gpt-4o',
    endpointUrl: 'https://api.openai.com/v1',
    capabilities: ['TEXT', 'VISION'],
    permittedDataClass: 'CUSTOMER_DOCUMENT',
    hostingRegion: 'GLOBAL_PUBLIC',
    description: 'High-accuracy multimodal document extraction and structured JSON generation',
  },
  {
    name: 'Anthropic (Claude 3.5 Sonnet)',
    displayName: 'Anthropic Claude 3.5 Sonnet',
    providerType: 'CUSTOM_PUBLIC',
    modelIdentifier: 'claude-3-5-sonnet-20241022',
    endpointUrl: 'https://api.anthropic.com/v1',
    capabilities: ['TEXT', 'VISION'],
    permittedDataClass: 'CUSTOMER_DOCUMENT',
    hostingRegion: 'US_EAST_1',
    description: 'Complex financial extraction and legal code cross-referencing',
  },
  {
    name: 'Groq (Llama 3.3 70B)',
    displayName: 'Groq Llama 3.3 70B (Fast Inference)',
    providerType: 'CUSTOM_PUBLIC',
    modelIdentifier: 'llama-3.3-70b-versatile',
    endpointUrl: 'https://api.groq.com/openai/v1',
    capabilities: ['TEXT'],
    permittedDataClass: 'REDACTED_CUSTOMER',
    hostingRegion: 'GLOBAL_PUBLIC',
    description: 'Ultra-low latency inference (300+ tok/s) for interactive questionnaire suggestions',
  },
  {
    name: 'Local Ollama / vLLM',
    displayName: 'Local Self-Hosted Ollama',
    providerType: 'LOCAL',
    modelIdentifier: 'llama3:latest',
    endpointUrl: 'http://localhost:11434/v1',
    capabilities: ['TEXT'],
    permittedDataClass: 'CUSTOMER_DOCUMENT',
    hostingRegion: 'EU_LOCAL',
    description: 'Zero external network transmission on-premise local model instance',
  },
  {
    name: 'Custom Endpoint',
    displayName: '',
    providerType: 'CUSTOM_PUBLIC',
    modelIdentifier: '',
    endpointUrl: '',
    capabilities: ['TEXT'],
    permittedDataClass: 'CUSTOMER_DOCUMENT',
    hostingRegion: 'EU_CENTRAL_1',
    description: 'Configure your own private or public inference endpoint',
  },
];

export function AdminConsoleView() {
  const [overview, setOverview] = useState<AdminOverviewDto | null>(null);
  const [taxRules, setTaxRules] = useState<readonly TaxRulePackageDto[]>([]);
  const [deadlines, setDeadlines] = useState<readonly TaxDeadlineDto[]>([]);
  const [forms, setForms] = useState<readonly FormMappingDto[]>([]);
  const [models, setModels] = useState<readonly ModelDefinitionDto[]>([]);
  const [routes, setRoutes] = useState<readonly ModelRouteDto[]>([]);
  const [evaluations, setEvaluations] = useState<readonly EvaluationRunDto[]>([]);
  const [auditEvents, setAuditEvents] = useState<readonly AuditEventDto[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'rules' | 'models' | 'evals' | 'audit'>('rules');
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [notification, setNotification] = useState<ToastMessage | null>(null);

  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerForm, setRegisterForm] = useState<{
    displayName: string;
    providerType: 'CUSTOM_PUBLIC' | 'HOSTED' | 'PRIVATE_CLOUD' | 'LOCAL';
    modelIdentifier: string;
    endpointUrl: string;
    apiKey: string;
    capabilities: ('TEXT' | 'VISION' | 'EMBEDDING' | 'RERANKING')[];
    permittedDataClass: 'PUBLIC' | 'SYNTHETIC' | 'REDACTED_CUSTOMER' | 'CUSTOMER_DOCUMENT';
    hostingRegion: string;
    status: 'ACTIVE' | 'CANARY' | 'DISABLED';
  }>({
    displayName: '',
    providerType: 'CUSTOM_PUBLIC',
    modelIdentifier: '',
    endpointUrl: '',
    apiKey: '',
    capabilities: ['TEXT'],
    permittedDataClass: 'CUSTOMER_DOCUMENT',
    hostingRegion: 'EU_CENTRAL_1',
    status: 'ACTIVE',
  });
  const [modalTestResult, setModalTestResult] = useState<{
    success: boolean;
    latencyMs: number;
    message: string;
  } | null>(null);
  const [isModalTesting, setIsModalTesting] = useState(false);
  const [isSubmittingModel, setIsSubmittingModel] = useState(false);

  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [probeResults, setProbeResults] = useState<
    Record<
      string,
      {
        success: boolean;
        latencyMs: number;
        statusCode: number;
        message: string;
        timestamp: string;
      }
    >
  >({});

  const [pendingDeleteModel, setPendingDeleteModel] = useState<ModelDefinitionDto | null>(null);
  const [deletingModel, setDeletingModel] = useState(false);

  const [editingRoute, setEditingRoute] = useState<ModelRouteDto | null>(null);
  const [routeForm, setRouteForm] = useState<{
    primaryModelId: string;
    fallbackModelIds: string[];
    timeoutMs: number;
    maxDataClass: string;
    activeRolloutPercentage: number;
  }>({
    primaryModelId: '',
    fallbackModelIds: [],
    timeoutMs: 8000,
    maxDataClass: 'CUSTOMER_DOCUMENT',
    activeRolloutPercentage: 100,
  });
  const [isSubmittingRoute, setIsSubmittingRoute] = useState(false);

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 6000);
  };

  const loadAdminData = async () => {
    setLoading(true);
    setAccessDenied(false);
    setLoadError(null);
    try {
      const [ovRes, rulesRes, deadlinesRes, formsRes, modelsRes, routesRes, evalsRes, auditRes] =
        await Promise.all([
          apiClient.getAdminOverview(),
          apiClient.getAdminTaxRules(),
          apiClient.getAdminDeadlines(),
          apiClient.getAdminForms(),
          apiClient.getAdminModels(),
          apiClient.getAdminModelRoutes(),
          apiClient.getAdminEvaluations(),
          apiClient.getAdminAudit({ limit: 15 }),
        ]);

      if (ovRes.status === 403 || rulesRes.status === 403) {
        setAccessDenied(true);
        setOverview(null);
        setLoading(false);
        return;
      }

      if (ovRes.error && !ovRes.data) {
        setLoadError(ovRes.error);
      }

      if (ovRes.data) setOverview(ovRes.data);
      if (rulesRes.data) setTaxRules(rulesRes.data);
      if (deadlinesRes.data) setDeadlines(deadlinesRes.data);
      if (formsRes.data) setForms(formsRes.data);
      if (modelsRes.data) setModels(modelsRes.data);
      if (routesRes.data) setRoutes(routesRes.data);
      if (evalsRes.data) setEvaluations(evalsRes.data);
      if (auditRes.data) setAuditEvents(auditRes.data);
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to load admin console');
      showToast('error', `Failed to load admin data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const handleApplyPreset = (preset: ModelPreset) => {
    setRegisterForm((prev) => ({
      ...prev,
      displayName: preset.displayName || prev.displayName,
      providerType: preset.providerType,
      modelIdentifier: preset.modelIdentifier || prev.modelIdentifier,
      endpointUrl: preset.endpointUrl || prev.endpointUrl,
      capabilities: [...preset.capabilities],
      permittedDataClass: preset.permittedDataClass,
      hostingRegion: preset.hostingRegion,
    }));
    setModalTestResult(null);
  };

  const handleTestModalConnection = async () => {
    if (!registerForm.endpointUrl) {
      showToast('error', 'Please enter an endpoint URL to test connectivity');
      return;
    }
    setIsModalTesting(true);
    setModalTestResult(null);
    try {
      const res = await apiClient.testAdminModel({
        endpointUrl: registerForm.endpointUrl,
        modelIdentifier: registerForm.modelIdentifier,
        apiKey: registerForm.apiKey,
      });
      if (res.data) {
        setModalTestResult({
          success: res.data.success,
          latencyMs: res.data.latencyMs,
          message: res.data.message,
        });
      } else {
        setModalTestResult({
          success: false,
          latencyMs: 0,
          message: res.error || 'Connection probe failed',
        });
      }
    } catch (err: any) {
      setModalTestResult({
        success: false,
        latencyMs: 0,
        message: err.message || 'Connection failed',
      });
    } finally {
      setIsModalTesting(false);
    }
  };

  const handleRegisterModelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerForm.displayName.trim() || !registerForm.modelIdentifier.trim()) {
      showToast('error', 'Please fill in Model Name and Model Identifier');
      return;
    }
    setIsSubmittingModel(true);
    try {
      const res = await apiClient.createAdminModel({
        displayName: registerForm.displayName.trim(),
        providerType: registerForm.providerType,
        modelIdentifier: registerForm.modelIdentifier.trim(),
        endpointUrl: registerForm.endpointUrl.trim() || undefined,
        apiKey: registerForm.apiKey.trim() || undefined,
        capabilities: registerForm.capabilities,
        permittedDataClass: registerForm.permittedDataClass,
        hostingRegion: registerForm.hostingRegion.trim(),
        status: registerForm.status,
      });

      if (res.error) {
        showToast('error', `Failed to register model: ${res.error}`);
      } else {
        showToast('success', `Model "${registerForm.displayName}" successfully integrated and registered in catalog!`);
        setShowRegisterModal(false);
        setRegisterForm({
          displayName: '',
          providerType: 'CUSTOM_PUBLIC',
          modelIdentifier: '',
          endpointUrl: '',
          apiKey: '',
          capabilities: ['TEXT'],
          permittedDataClass: 'CUSTOMER_DOCUMENT',
          hostingRegion: 'EU_CENTRAL_1',
          status: 'ACTIVE',
        });
        setModalTestResult(null);
        await loadAdminData();
      }
    } catch (err: any) {
      showToast('error', `Unexpected error: ${err.message}`);
    } finally {
      setIsSubmittingModel(false);
    }
  };

  const handlePingModel = async (model: ModelDefinitionDto) => {
    setTestingModelId(model.id);
    try {
      const res = await apiClient.testAdminModel({
        modelId: model.id,
        endpointUrl: model.endpointUrl,
        modelIdentifier: model.modelIdentifier,
      });

      if (res.data) {
        setProbeResults((prev) => ({
          ...prev,
          [model.id]: res.data!,
        }));
        if (res.data.success) {
          showToast('success', `${model.displayName} responded in ${res.data.latencyMs}ms (HTTP ${res.data.statusCode})`);
        } else {
          showToast('error', `${model.displayName} probe returned HTTP ${res.data.statusCode}: ${res.data.message}`);
        }
        await loadAdminData();
      } else {
        showToast('error', `Probe failed: ${res.error}`);
      }
    } catch (err: any) {
      showToast('error', `Probe exception: ${err.message}`);
    } finally {
      setTestingModelId(null);
    }
  };

  const handleToggleModelStatus = async (model: ModelDefinitionDto) => {
    const nextStatus = model.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    try {
      const res = await apiClient.updateAdminModel(model.id, {
        status: nextStatus,
      });
      if (res.error) {
        showToast('error', `Failed to update status: ${res.error}`);
      } else {
        showToast('success', `Model "${model.displayName}" status set to ${nextStatus}`);
        await loadAdminData();
      }
    } catch (err: any) {
      showToast('error', err.message);
    }
  };

  const handleConfirmDeleteModel = async () => {
    if (!pendingDeleteModel) return;
    setDeletingModel(true);
    try {
      const res = await apiClient.deleteAdminModel(pendingDeleteModel.id);
      if (res.error) {
        showToast('error', `Cannot delete model: ${res.error}`);
      } else {
        showToast('success', `Model "${pendingDeleteModel.displayName}" removed from catalog.`);
        await loadAdminData();
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setDeletingModel(false);
      setPendingDeleteModel(null);
    }
  };

  const handleOpenEditRoute = (route: ModelRouteDto) => {
    setEditingRoute(route);
    setRouteForm({
      primaryModelId: route.primaryModelId,
      fallbackModelIds: [...route.fallbackModelIds],
      timeoutMs: route.timeoutMs,
      maxDataClass: route.maxDataClass,
      activeRolloutPercentage: route.activeRolloutPercentage,
    });
  };

  const handleSaveRouteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoute) return;
    setIsSubmittingRoute(true);
    try {
      const res = await apiClient.updateAdminModelRoute(editingRoute.id, {
        primaryModelId: routeForm.primaryModelId,
        fallbackModelIds: routeForm.fallbackModelIds,
        timeoutMs: Number(routeForm.timeoutMs),
        maxDataClass: routeForm.maxDataClass,
        activeRolloutPercentage: Number(routeForm.activeRolloutPercentage),
      });

      if (res.error) {
        showToast('error', `Failed to update route: ${res.error}`);
      } else {
        showToast('success', `Route for "${editingRoute.taskName}" updated: Primary model is now ${routeForm.primaryModelId}`);
        setEditingRoute(null);
        await loadAdminData();
      }
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setIsSubmittingRoute(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-3 dark:border-zinc-800 dark:bg-[#161920] dark:shadow-none">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-3.5 w-96 max-w-full" />
        </div>
        <CardGridSkeleton count={3} />
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="rounded-2xl border border-slate-200/90 bg-white p-8 shadow-xs dark:border-zinc-800 dark:bg-[#161920] dark:shadow-none">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/45 dark:text-amber-300">
            <ShieldAlert className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="text-base font-bold text-slate-900 dark:text-zinc-50">Administrator Access Required</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600 text-pretty dark:text-zinc-400">
            The platform governance console is restricted to accounts listed in{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-800 dark:bg-zinc-800 dark:text-zinc-200">
              ADMIN_EMAILS
            </code>{' '}
            with a verified email address. Regular household filers do not need this section to file a return.
          </p>
          <button
            type="button"
            onClick={loadAdminData}
            className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Check Again</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ToastBanner feedback={notification} onDismiss={() => setNotification(null)} />

      {loadError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800 dark:border-rose-800/70 dark:bg-rose-950/45 dark:text-rose-200"
        >
          <span>{loadError}</span>
          <button
            type="button"
            onClick={loadAdminData}
            className="rounded-lg border border-rose-300 bg-white px-3 py-1 text-xs font-bold text-rose-800 hover:bg-rose-100 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-200 dark:hover:bg-rose-900"
          >
            Retry
          </button>
        </div>
      )}

      {/* Top Banner */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#161920] dark:shadow-none">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-lg font-bold text-slate-900 dark:text-zinc-50">
                Admin Governance &amp; AI Model Console
              </h2>
              {overview && (
                <StatusBadge tone="success">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                  <span>{overview.serviceHealth}</span>
                </StatusBadge>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
              Versioned tax rule packages, Form 100 mappings, custom public model routing, and quality benchmarks
            </p>
          </div>
          <button
            type="button"
            onClick={loadAdminData}
            className="inline-flex items-center gap-1.5 self-start rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Refresh Metrics</span>
          </button>
        </div>

        {/* Aggregate KPI Grid */}
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
            <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Active Tax Years</p>
            <p className="tabular-nums mt-1 text-2xl font-bold text-slate-900 dark:text-zinc-50">
              {overview?.activeTaxYears?.join(', ') || '—'}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
            <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Registered Models</p>
            <p className="tabular-nums mt-1 text-2xl font-bold text-sky-700 dark:text-sky-400">
              {overview?.registeredModelsCount ?? models.length}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
            <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">AI Task Routes</p>
            <p className="tabular-nums mt-1 text-2xl font-bold text-indigo-700 dark:text-indigo-400">
              {overview?.activeRoutesCount ?? routes.length}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
            <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Audit Trail Events</p>
            <p className="tabular-nums mt-1 text-2xl font-bold text-slate-900 dark:text-zinc-50">
              {overview?.totalAuditEvents ?? 0}
            </p>
          </div>
        </div>
      </div>

      {/* Subtabs */}
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-zinc-200/85 bg-white p-1.5 shadow-[0_1px_2px_rgba(9,9,11,0.03)] dark:border-zinc-800 dark:bg-[#161920] dark:shadow-none">
        {[
          { key: 'rules', label: 'Tax Rule Packages & Forms', icon: ScrollText },
          { key: 'models', label: 'Model Registry & Dynamic Routing', icon: Cpu },
          { key: 'evals', label: 'Golden Benchmarks & Evals', icon: BarChart3 },
          { key: 'audit', label: 'Global Audit Trail', icon: ShieldCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeSubTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveSubTab(tab.key as any)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-bold transition ${
                active
                  ? 'bg-zinc-950 text-white shadow-xs dark:bg-zinc-100 dark:text-zinc-950'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Subtab 1: Tax Rules & Forms */}
      {activeSubTab === 'rules' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#161920] dark:shadow-none">
            <h3 className="mb-4 text-sm font-bold text-slate-900 dark:text-zinc-50">
              Immutable Tax-Year Rule Packages
            </h3>
            <div className="space-y-4">
              {taxRules.map((rule) => (
                <div key={rule.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-zinc-800">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                        Tax Year {rule.taxYear} (Package {rule.version})
                      </span>
                      <StatusBadge tone="success">{rule.status}</StatusBadge>
                    </div>
                    <span className="tabular-nums font-mono text-[11px] text-slate-500 dark:text-zinc-400">
                      Effective: {rule.effectiveDate}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                    <div>
                      <span className="text-slate-500 dark:text-zinc-400">Progressive Brackets</span>
                      <p className="tabular-nums font-semibold text-slate-800 dark:text-zinc-200">
                        {rule.progressiveScaleBrackets} Brackets (0% - 42%)
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-zinc-400">Splitting Method</span>
                      <p className="font-semibold text-slate-800 dark:text-zinc-200">
                        {rule.splittingMethodEnabled ? 'Class 2 Splitting Active' : 'Disabled'}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-zinc-400">Frais d&apos;obtention</span>
                      <p className="tabular-nums font-semibold text-slate-800 dark:text-zinc-200">
                        €{rule.standardDeductionFrais} min/employee
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-zinc-400">Primary Mortgage Cap</span>
                      <p className="tabular-nums font-semibold text-slate-800 dark:text-zinc-200">
                        €{rule.primaryResidenceMortgageCap}/member
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-slate-200 pt-3 dark:border-zinc-800">
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-zinc-400">
                      Package SHA-256 Integrity Checksum:
                    </span>
                    <p className="break-all font-mono text-[10px] text-slate-500 dark:text-zinc-500">
                      {rule.packageChecksum}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#161920] dark:shadow-none">
            <h3 className="mb-4 text-sm font-bold text-slate-900 dark:text-zinc-50">Official Form 100 Box Mappings</h3>
            {forms.map((form) => (
              <div key={form.id} className="mb-4 last:mb-0">
                <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Form: {form.formCode} ({form.version} — Tax Year {form.taxYear})
                </p>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-800">
                  <table className="w-full text-left text-xs text-slate-600 dark:text-zinc-300">
                    <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-700 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
                      <tr>
                        <th className="px-3 py-2.5">Form 100 Box</th>
                        <th className="px-3 py-2.5">Internal Domain Field</th>
                        <th className="px-3 py-2.5">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                      {form.boxMappings.map((box) => (
                        <tr key={box.boxNumber}>
                          <td className="px-3 py-2 font-mono font-bold text-sky-700 dark:text-sky-400">
                            Box {box.boxNumber}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-800 dark:text-zinc-200">{box.fieldName}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-zinc-400">{box.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          {/* Statutory Filing Deadlines */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#161920] dark:shadow-none">
            <h3 className="mb-1 text-sm font-bold text-slate-900 dark:text-zinc-50">
              Statutory Filing Deadlines &amp; Schedules (§ 19)
            </h3>
            <p className="mb-4 text-xs text-slate-500 dark:text-zinc-400">
              All official filing windows and legal deadlines are versioned per tax year from official ACD sources.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {deadlines.map((dl) => (
                <div key={dl.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-zinc-100">{dl.name}</span>
                    <StatusBadge tone="info">{dl.deadlineDate}</StatusBadge>
                  </div>
                  <p className="mt-2 text-xs text-slate-600 dark:text-zinc-400">{dl.description}</p>
                  <a
                    href={dl.officialSourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:underline dark:text-sky-400"
                  >
                    <span>Official ACD Source</span>
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>
              ))}
            </div>
          </div>

          {/* Multilingual Luxembourg Tax Terminology Reference */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#161920] dark:shadow-none">
            <h3 className="mb-1 text-sm font-bold text-slate-900 dark:text-zinc-50">
              Multilingual Tax Dictionary (§ 18)
            </h3>
            <p className="mb-4 text-xs text-slate-500 dark:text-zinc-400">
              Curated official tax terminology across English, French, and German with legal statutory references.
            </p>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-800">
              <table className="w-full text-left text-xs text-slate-600 dark:text-zinc-300">
                <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-700 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
                  <tr>
                    <th className="px-3 py-2.5">English (EN)</th>
                    <th className="px-3 py-2.5">Français (FR)</th>
                    <th className="px-3 py-2.5">Deutsch (DE)</th>
                    <th className="px-3 py-2.5">Statutory Basis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                  {LUXEMBOURG_TAX_TERMS.map((term) => (
                    <tr key={term.key}>
                      <td className="px-3 py-2 font-medium text-slate-900 dark:text-zinc-100">{term.en}</td>
                      <td className="px-3 py-2 text-slate-700 dark:text-zinc-300">{term.fr}</td>
                      <td className="px-3 py-2 text-slate-700 dark:text-zinc-300">{term.de}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-sky-700 dark:text-sky-400">
                        {term.legalReference || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Subtab 2: Models & Routes */}
      {activeSubTab === 'models' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#161920] dark:shadow-none">
            <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-50">Provider-Neutral Model Registry</h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
                  Integrate public AI models (OpenAI, Anthropic, Mistral, Groq) or private local inferences with live health probes and data protection fences.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowRegisterModal(true);
                  setModalTestResult(null);
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Integrate AI Model</span>
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {models.map((m) => {
                const probe = probeResults[m.id];
                const isTesting = testingModelId === m.id;

                return (
                  <div
                    key={m.id}
                    className={`rounded-xl border p-4 transition ${
                      m.isCustom
                        ? 'border-sky-200 bg-sky-50/20 dark:border-sky-800/70 dark:bg-sky-950/25'
                        : 'border-slate-200 bg-slate-50/60 dark:border-zinc-800 dark:bg-zinc-900/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-slate-900 dark:text-zinc-100">{m.displayName}</h4>
                          {m.isCustom && <StatusBadge tone="info">CUSTOM</StatusBadge>}
                        </div>
                        <p className="mt-0.5 font-mono text-[11px] text-slate-600 dark:text-zinc-400">
                          {m.modelIdentifier}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <StatusBadge
                          tone={
                            m.providerType === 'LOCAL'
                              ? 'success'
                              : m.providerType === 'CUSTOM_PUBLIC'
                              ? 'indigo'
                              : 'info'
                          }
                        >
                          {m.providerType}
                        </StatusBadge>
                        <StatusBadge
                          tone={
                            m.status === 'ACTIVE'
                              ? 'success'
                              : m.status === 'CANARY'
                              ? 'warning'
                              : 'neutral'
                          }
                        >
                          {m.status}
                        </StatusBadge>
                      </div>
                    </div>

                    {m.endpointUrl && (
                      <div className="mt-2.5 break-all rounded-lg border border-slate-200 bg-white/80 p-2 font-mono text-[10px] text-slate-500 dark:border-zinc-700/80 dark:bg-zinc-950/60 dark:text-zinc-400">
                        <span className="font-semibold text-slate-600 dark:text-zinc-300">Endpoint: </span>
                        {m.endpointUrl}
                        {m.apiKeyMasked && (
                          <span className="ml-2 font-bold text-indigo-700 dark:text-indigo-400">
                            [Key: {m.apiKeyMasked}]
                          </span>
                        )}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {m.capabilities.map((c) => (
                        <span
                          key={c}
                          className="rounded-md bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800 dark:bg-sky-950/60 dark:text-sky-300"
                        >
                          {c}
                        </span>
                      ))}
                      <span className="rounded-md bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-zinc-800 dark:text-zinc-300">
                        Region: {m.hostingRegion}
                      </span>
                      <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                        {m.permittedDataClass}
                      </span>
                    </div>

                    {probe && (
                      <div
                        className={`mt-3 rounded-xl border p-2.5 text-[11px] ${
                          probe.success
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/45 dark:text-emerald-200'
                            : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800/70 dark:bg-rose-950/45 dark:text-rose-200'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold">
                          <span className="inline-flex items-center gap-1">
                            {probe.success ? (
                              <Check className="h-3 w-3" aria-hidden="true" />
                            ) : (
                              <X className="h-3 w-3" aria-hidden="true" />
                            )}
                            <span>{probe.success ? 'Probe Reached Endpoint' : 'Probe Failed'}</span>
                          </span>
                          <span className="tabular-nums">{probe.latencyMs}ms</span>
                        </div>
                        <p className="mt-0.5 text-[10px] opacity-90">{probe.message}</p>
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-200 pt-3 dark:border-zinc-800">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            m.healthy ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                        />
                        <span className="tabular-nums text-[11px] font-semibold text-slate-600 dark:text-zinc-400">
                          {m.healthy ? (m.latencyMs ? `Healthy (${m.latencyMs}ms)` : 'Healthy') : 'Degraded'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handlePingModel(m)}
                          disabled={isTesting}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          <Activity className="h-3 w-3" aria-hidden="true" />
                          <span>{isTesting ? 'Probing...' : 'Ping Test'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleModelStatus(m)}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          {m.status === 'ACTIVE' ? 'Disable' : 'Activate'}
                        </button>

                        {m.isCustom && (
                          <button
                            type="button"
                            onClick={() => setPendingDeleteModel(m)}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 shadow-2xs transition hover:bg-rose-100 dark:border-rose-800/70 dark:bg-rose-950/45 dark:text-rose-300 dark:hover:bg-rose-950/65"
                          >
                            <Trash2 className="h-3 w-3" aria-hidden="true" />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Task-Based Routing Section */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#161920] dark:shadow-none">
            <div className="mb-4">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-zinc-50">
                <span>Task-Based Model Routing Policies</span>
                <HelpTip id="modelRouting" />
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
                Route Luxembourg tax processing tasks to specific primary and fallback models with traffic rollouts.
              </p>
            </div>

            <div className="space-y-3">
              {routes.map((r) => {
                const primaryModel = models.find((m) => m.id === r.primaryModelId);

                return (
                  <div
                    key={r.id}
                    className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs transition hover:border-slate-300 sm:flex-row sm:items-center dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-zinc-700"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-indigo-800 dark:text-indigo-400">{r.taskName}</span>
                        <StatusBadge tone="info">{r.maxDataClass}</StatusBadge>
                      </div>

                      <div className="text-[11px] text-slate-600 dark:text-zinc-400">
                        Primary:{' '}
                        <strong className="text-slate-900 dark:text-zinc-100">
                          {primaryModel ? primaryModel.displayName : r.primaryModelId}
                        </strong>{' '}
                        <span className="font-mono text-[10px] text-slate-500 dark:text-zinc-500">
                          ({r.primaryModelId})
                        </span>{' '}
                        • Fallbacks: {r.fallbackModelIds.length ? r.fallbackModelIds.join(', ') : 'None'} •
                        Timeout: <span className="tabular-nums">{r.timeoutMs}ms</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <StatusBadge tone="neutral">
                        <span className="tabular-nums">{r.activeRolloutPercentage}% Rollout</span>
                      </StatusBadge>
                      <button
                        type="button"
                        onClick={() => handleOpenEditRoute(r)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        <Pencil className="h-3 w-3" aria-hidden="true" />
                        <span>Edit Route Policy</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Subtab 3: Golden Evaluations */}
      {activeSubTab === 'evals' && (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#161920] dark:shadow-none">
          <h3 className="mb-1 text-sm font-bold text-slate-900 dark:text-zinc-50">
            Luxembourg Golden Benchmark Evaluations
          </h3>
          <p className="mb-4 text-xs text-slate-500 dark:text-zinc-400">
            No model route activates without exceeding the 90% exact-match and 0% hallucination thresholds on anonymised golden sets.
          </p>
          <div className="space-y-4">
            {evaluations.map((ev) => (
              <div key={ev.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-zinc-100">{ev.datasetName}</h4>
                  <StatusBadge tone="success">
                    <Check className="h-3 w-3" aria-hidden="true" />
                    <span>Threshold Passed</span>
                  </StatusBadge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <div>
                    <span className="text-slate-500 dark:text-zinc-400">Exact Match Rate</span>
                    <p className="tabular-nums text-sm font-bold text-emerald-700 dark:text-emerald-400">
                      {(ev.exactMatchRate * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-zinc-400">Schema Valid</span>
                    <p className="tabular-nums text-sm font-bold text-slate-900 dark:text-zinc-100">
                      {(ev.schemaValidRate * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-zinc-400">Hallucination Rate</span>
                    <p className="tabular-nums text-sm font-bold text-emerald-700 dark:text-emerald-400">
                      {(ev.hallucinationRate * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-zinc-400">Avg Latency</span>
                    <p className="tabular-nums text-sm font-bold text-slate-900 dark:text-zinc-100">
                      {ev.avgLatencyMs} ms
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subtab 4: Audit Trail */}
      {activeSubTab === 'audit' && (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-[#161920] dark:shadow-none">
          <h3 className="mb-1 text-sm font-bold text-slate-900 dark:text-zinc-50">Platform Immutable Audit Trail</h3>
          <p className="mb-4 text-xs text-slate-500 dark:text-zinc-400">
            Append-only record of all administrative, authentication, and filing operations
          </p>
          <div className="divide-y divide-slate-100 dark:divide-zinc-800">
            {auditEvents.map((evt) => (
              <div key={evt.id} className="py-3 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-800 dark:text-zinc-200">{evt.description}</span>
                  <span className="tabular-nums shrink-0 font-mono text-[10px] text-slate-400 dark:text-zinc-500">
                    {new Date(evt.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-zinc-400">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {evt.eventType}
                  </span>
                  <span>Actor: {evt.actorEmail || evt.actorId}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL 1: REGISTER CUSTOM AI MODEL */}
      <Modal
        isOpen={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        titleId="register-model-modal-title"
        title="Integrate AI Model (Public / Custom)"
        subtitle="Configure an OpenAI, Mistral, Anthropic, Groq, or custom public inference endpoint"
        icon={<Cpu className="h-4.5 w-4.5" aria-hidden="true" />}
        maxWidthClass="max-w-2xl"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-zinc-300">
              Quick Integration Presets
            </label>
            <div className="flex flex-wrap gap-1.5">
              {MODEL_PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => handleApplyPreset(p)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-sky-700 dark:hover:bg-sky-950/40 dark:hover:text-sky-300"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleRegisterModelSubmit} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="model-display-name" className="mb-1 block font-semibold text-slate-700 dark:text-zinc-300">
                  Display Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="model-display-name"
                  type="text"
                  required
                  value={registerForm.displayName}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({ ...prev, displayName: e.target.value }))
                  }
                  placeholder="e.g. Mistral Large 2 (EU Public)"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-950 focus:border-zinc-950 focus:outline-none dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400"
                />
              </div>

              <div>
                <label htmlFor="model-provider-type" className="mb-1 block font-semibold text-zinc-700 dark:text-zinc-300">
                  Provider Type <span className="text-rose-500">*</span>
                </label>
                <select
                  id="model-provider-type"
                  value={registerForm.providerType}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      providerType: e.target.value as any,
                    }))
                  }
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-950 focus:border-zinc-950 focus:outline-none dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-400"
                >
                  <option value="CUSTOM_PUBLIC">CUSTOM_PUBLIC (Public API Endpoint)</option>
                  <option value="HOSTED">HOSTED (Managed Cloud Inference)</option>
                  <option value="PRIVATE_CLOUD">PRIVATE_CLOUD (Dedicated VPC)</option>
                  <option value="LOCAL">LOCAL (On-Premise / Edge Instance)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="model-identifier" className="mb-1 block font-semibold text-zinc-700 dark:text-zinc-300">
                  Model Identifier <span className="text-rose-500">*</span>
                </label>
                <input
                  id="model-identifier"
                  type="text"
                  required
                  value={registerForm.modelIdentifier}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({ ...prev, modelIdentifier: e.target.value }))
                  }
                  placeholder="e.g. mistral-large-latest or gpt-4o"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-950 focus:border-zinc-950 focus:outline-none dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400"
                />
              </div>

              <div>
                <label htmlFor="model-region" className="mb-1 block font-semibold text-zinc-700 dark:text-zinc-300">
                  Hosting Region <span className="text-rose-500">*</span>
                </label>
                <input
                  id="model-region"
                  type="text"
                  required
                  value={registerForm.hostingRegion}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({ ...prev, hostingRegion: e.target.value }))
                  }
                  placeholder="e.g. EU_WEST_1, GLOBAL_PUBLIC, EU_LOCAL"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-950 focus:border-zinc-950 focus:outline-none dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400"
                />
              </div>
            </div>

            <div>
              <label htmlFor="model-endpoint-url" className="mb-1 block font-semibold text-zinc-700 dark:text-zinc-300">
                Endpoint URL (Base or Full Probe URL)
              </label>
              <div className="flex gap-2">
                <input
                  id="model-endpoint-url"
                  type="url"
                  value={registerForm.endpointUrl}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({ ...prev, endpointUrl: e.target.value }))
                  }
                  placeholder="https://api.mistral.ai/v1 or https://api.openai.com/v1"
                  className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-950 focus:border-zinc-950 focus:outline-none dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400"
                />
                <button
                  type="button"
                  onClick={handleTestModalConnection}
                  disabled={isModalTesting || !registerForm.endpointUrl}
                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 shadow-2xs transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{isModalTesting ? 'Probing...' : 'Test Probe'}</span>
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="model-api-key" className="mb-1 block font-semibold text-zinc-700 dark:text-zinc-300">
                API Key / Secret Token (Protected Server-Side)
              </label>
              <input
                id="model-api-key"
                type="password"
                value={registerForm.apiKey}
                onChange={(e) =>
                  setRegisterForm((prev) => ({ ...prev, apiKey: e.target.value }))
                }
                placeholder="sk-..."
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-950 focus:border-zinc-950 focus:outline-none dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400"
              />
              <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                Keys are stored encrypted/protected on the server and never exposed to the frontend browser client.
              </p>
            </div>

            {modalTestResult && (
              <div
                className={`rounded-xl border p-3 text-xs ${
                  modalTestResult.success
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/45 dark:text-emerald-200'
                    : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/45 dark:text-amber-200'
                }`}
              >
                <div className="flex items-center justify-between font-bold">
                  <span>{modalTestResult.success ? 'Probe Succeeded' : 'Probe Result'}</span>
                  <span className="tabular-nums">{modalTestResult.latencyMs}ms</span>
                </div>
                <p className="mt-1 text-[11px]">{modalTestResult.message}</p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="model-data-class" className="mb-1 block font-semibold text-zinc-700 dark:text-zinc-300">
                  Permitted Data Classification <HelpTip id="dataClass" />
                </label>
                <select
                  id="model-data-class"
                  value={registerForm.permittedDataClass}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      permittedDataClass: e.target.value as any,
                    }))
                  }
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-950 focus:border-zinc-950 focus:outline-none dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-400"
                >
                  <option value="CUSTOMER_DOCUMENT">CUSTOMER_DOCUMENT (Strict Personal Data)</option>
                  <option value="REDACTED_CUSTOMER">REDACTED_CUSTOMER (Anonymised / Masked)</option>
                  <option value="SYNTHETIC">SYNTHETIC (Test Sets Only)</option>
                  <option value="PUBLIC">PUBLIC (Non-PII Public Queries)</option>
                </select>
              </div>

              <div>
                <label htmlFor="model-status" className="mb-1 block font-semibold text-zinc-700 dark:text-zinc-300">
                  Initial Status
                </label>
                <select
                  id="model-status"
                  value={registerForm.status}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      status: e.target.value as any,
                    }))
                  }
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-950 focus:border-zinc-950 focus:outline-none dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-400"
                >
                  <option value="ACTIVE">ACTIVE (Ready for Routing)</option>
                  <option value="CANARY">CANARY (Shadow Testing Only)</option>
                  <option value="DISABLED">DISABLED (Temporarily Offline)</option>
                </select>
              </div>
            </div>

            <div>
              <span className="mb-1 block font-semibold text-zinc-700 dark:text-zinc-300">
                Capabilities <HelpTip id="modelCapabilities" />
              </span>
              <div className="flex flex-wrap gap-4 pt-1">
                {(['TEXT', 'VISION', 'EMBEDDING', 'RERANKING'] as const).map((cap) => {
                  const isChecked = registerForm.capabilities.includes(cap);
                  return (
                    <label key={cap} className="flex cursor-pointer items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setRegisterForm((prev) => ({
                              ...prev,
                              capabilities: [...prev.capabilities, cap],
                            }));
                          } else {
                            setRegisterForm((prev) => ({
                              ...prev,
                              capabilities: prev.capabilities.filter((c) => c !== cap),
                            }));
                          }
                        }}
                        className="rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                      />
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">{cap}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setShowRegisterModal(false)}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingModel}
                className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2 font-semibold text-white shadow-xs transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
              >
                {isSubmittingModel && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                <span>{isSubmittingModel ? 'Registering Model...' : 'Register & Save Model'}</span>
              </button>
            </div>
          </form>
        </div>
      </Modal>

      {/* MODAL 2: EDIT MODEL ROUTE POLICY */}
      <Modal
        isOpen={editingRoute !== null}
        onClose={() => setEditingRoute(null)}
        titleId="edit-route-modal-title"
        title="Edit Task Routing Policy"
        subtitle={editingRoute?.taskName}
        icon={<Pencil className="h-4.5 w-4.5" aria-hidden="true" />}
      >
        {editingRoute && (
          <form onSubmit={handleSaveRouteSubmit} className="space-y-4 text-xs">
            <div>
              <label htmlFor="route-primary-model" className="mb-1 block font-semibold text-zinc-700 dark:text-zinc-300">
                Primary Model <span className="text-rose-500">*</span>
              </label>
              <select
                id="route-primary-model"
                required
                value={routeForm.primaryModelId}
                onChange={(e) =>
                  setRouteForm((prev) => ({
                    ...prev,
                    primaryModelId: e.target.value,
                    fallbackModelIds: prev.fallbackModelIds.filter((id) => id !== e.target.value),
                  }))
                }
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-950 focus:border-zinc-950 focus:outline-none dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-400"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName} ({m.modelIdentifier}) [{m.providerType}]
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                Incoming requests for this task are directed to this primary model first.
              </p>
            </div>

            <div>
              <span className="mb-1 block font-semibold text-zinc-700 dark:text-zinc-300">Fallback Models</span>
              <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 dark:border-zinc-800 dark:bg-zinc-900/60">
                {models
                  .filter((m) => m.id !== routeForm.primaryModelId)
                  .map((m) => {
                    const isChecked = routeForm.fallbackModelIds.includes(m.id);
                    return (
                      <label key={m.id} className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setRouteForm((prev) => ({
                                ...prev,
                                fallbackModelIds: [...prev.fallbackModelIds, m.id],
                              }));
                            } else {
                              setRouteForm((prev) => ({
                                ...prev,
                                fallbackModelIds: prev.fallbackModelIds.filter((id) => id !== m.id),
                              }));
                            }
                          }}
                          className="rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                        />
                        <span className="text-zinc-800 dark:text-zinc-200">
                          {m.displayName}{' '}
                          <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                            ({m.modelIdentifier})
                          </span>
                        </span>
                      </label>
                    );
                  })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="route-timeout" className="mb-1 block font-semibold text-zinc-700 dark:text-zinc-300">
                  Timeout (ms)
                </label>
                <input
                  id="route-timeout"
                  type="number"
                  min={500}
                  max={60000}
                  step={500}
                  value={routeForm.timeoutMs}
                  onChange={(e) =>
                    setRouteForm((prev) => ({ ...prev, timeoutMs: Number(e.target.value) }))
                  }
                  className="tabular-nums w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-950 focus:border-zinc-950 focus:outline-none dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-400"
                />
              </div>

              <div>
                <label htmlFor="route-rollout" className="mb-1 block font-semibold text-zinc-700 dark:text-zinc-300">
                  Rollout Percentage <HelpTip id="rolloutPercentage" /> (
                  <span className="tabular-nums">{routeForm.activeRolloutPercentage}%</span>)
                </label>
                <input
                  id="route-rollout"
                  type="range"
                  min={0}
                  max={100}
                  value={routeForm.activeRolloutPercentage}
                  onChange={(e) =>
                    setRouteForm((prev) => ({
                      ...prev,
                      activeRolloutPercentage: Number(e.target.value),
                    }))
                  }
                  className="mt-2 w-full accent-zinc-950 dark:accent-zinc-100"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setEditingRoute(null)}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingRoute}
                className="rounded-xl bg-zinc-950 px-4 py-2 font-semibold text-white shadow-xs transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
              >
                {isSubmittingRoute ? 'Saving Route...' : 'Save Route Policy'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete Model Confirm Dialog */}
      <ConfirmDialog
        isOpen={pendingDeleteModel !== null}
        title="Delete custom model?"
        description={
          pendingDeleteModel
            ? `Are you sure you want to delete model "${pendingDeleteModel.displayName}" (${pendingDeleteModel.modelIdentifier})? This action is permanent.`
            : ''
        }
        confirmLabel="Delete Model"
        busy={deletingModel}
        onConfirm={handleConfirmDeleteModel}
        onCancel={() => setPendingDeleteModel(null)}
      />
    </div>
  );
}
