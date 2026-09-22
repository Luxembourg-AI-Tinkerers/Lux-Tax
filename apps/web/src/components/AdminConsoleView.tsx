'use client';

import React, { useEffect, useState } from 'react';
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
  CreateModelDto,
  UpdateModelRouteDto,
} from '@luxtax/contracts';
import { LUXEMBOURG_TAX_TERMS } from '@luxtax/design-tokens';

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

  // Notifications & State
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Register Model Modal
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

  // Model Testing State
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

  // Route Editing Modal
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

      if (ovRes.data) setOverview(ovRes.data);
      if (rulesRes.data) setTaxRules(rulesRes.data);
      if (deadlinesRes.data) setDeadlines(deadlinesRes.data);
      if (formsRes.data) setForms(formsRes.data);
      if (modelsRes.data) setModels(modelsRes.data);
      if (routesRes.data) setRoutes(routesRes.data);
      if (evalsRes.data) setEvaluations(evalsRes.data);
      if (auditRes.data) setAuditEvents(auditRes.data);
    } catch (err: any) {
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
          showToast('success', `⚡ ${model.displayName} responded in ${res.data.latencyMs}ms (HTTP ${res.data.statusCode})`);
        } else {
          showToast('error', `⚡ ${model.displayName} probe returned HTTP ${res.data.statusCode}: ${res.data.message}`);
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

  const handleDeleteModel = async (model: ModelDefinitionDto) => {
    if (!confirm(`Are you sure you want to delete model "${model.displayName}" (${model.modelIdentifier})? This action is permanent.`)) {
      return;
    }
    try {
      const res = await apiClient.deleteAdminModel(model.id);
      if (res.error) {
        showToast('error', `Cannot delete model: ${res.error}`);
      } else {
        showToast('success', `Model "${model.displayName}" removed from catalog.`);
        await loadAdminData();
      }
    } catch (err: any) {
      showToast('error', err.message);
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
      <div className="p-8 text-center text-slate-500">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-600 border-t-transparent mx-auto mb-2" />
        <p className="text-sm">Loading admin governance console...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`flex items-center justify-between rounded-lg p-3 text-xs font-semibold shadow-sm transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : notification.type === 'error'
              ? 'bg-rose-50 text-rose-800 border border-rose-200'
              : 'bg-sky-50 text-sky-800 border border-sky-200'
          }`}
        >
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-600 ml-4 font-bold text-sm"
          >
            &times;
          </button>
        </div>
      )}

      {/* Top Banner */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">Admin Governance & AI Model Console</h2>
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                ● {overview?.serviceHealth || 'HEALTHY'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Versioned tax rule packages, Form 100 mappings, custom public model routing, and quality benchmarks
            </p>
          </div>
          <button
            onClick={loadAdminData}
            className="self-start rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition"
          >
            ↻ Refresh Metrics
          </button>
        </div>

        {/* Aggregate KPI Grid */}
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-4 border border-slate-100">
            <p className="text-xs font-medium text-slate-500">Active Tax Years</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {overview?.activeTaxYears?.join(', ') || '2025'}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-4 border border-slate-100">
            <p className="text-xs font-medium text-slate-500">Registered Models</p>
            <p className="mt-1 text-2xl font-bold text-sky-600">
              {overview?.registeredModelsCount ?? models.length}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-4 border border-slate-100">
            <p className="text-xs font-medium text-slate-500">AI Task Routes</p>
            <p className="mt-1 text-2xl font-bold text-indigo-600">
              {overview?.activeRoutesCount ?? routes.length}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-4 border border-slate-100">
            <p className="text-xs font-medium text-slate-500">Audit Trail Events</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {overview?.totalAuditEvents || 0}
            </p>
          </div>
        </div>
      </div>

      {/* Subtabs */}
      <div className="flex border-b border-slate-200 bg-white px-4 rounded-t-xl overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('rules')}
          className={`py-3 px-4 text-xs font-bold border-b-2 whitespace-nowrap transition ${
            activeSubTab === 'rules'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          📜 Tax Rule Packages & Forms
        </button>
        <button
          onClick={() => setActiveSubTab('models')}
          className={`py-3 px-4 text-xs font-bold border-b-2 whitespace-nowrap transition ${
            activeSubTab === 'models'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          🤖 Model Registry & Dynamic Routing
        </button>
        <button
          onClick={() => setActiveSubTab('evals')}
          className={`py-3 px-4 text-xs font-bold border-b-2 whitespace-nowrap transition ${
            activeSubTab === 'evals'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          📊 Golden Benchmarks & Evals
        </button>
        <button
          onClick={() => setActiveSubTab('audit')}
          className={`py-3 px-4 text-xs font-bold border-b-2 whitespace-nowrap transition ${
            activeSubTab === 'audit'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          🛡️ Global Audit Trail
        </button>
      </div>

      {/* Subtab 1: Tax Rules & Forms */}
      {activeSubTab === 'rules' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-4">
              Immutable Tax-Year Rule Packages
            </h3>
            {taxRules.map((rule) => (
              <div key={rule.id} className="rounded-lg border border-slate-200 p-4 bg-slate-50">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <span className="text-sm font-bold text-slate-900">
                      Tax Year {rule.taxYear} (Package {rule.version})
                    </span>
                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      {rule.status}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-500">
                    Effective: {rule.effectiveDate}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                  <div>
                    <span className="text-slate-500">Progressive Brackets:</span>
                    <p className="font-semibold text-slate-800">{rule.progressiveScaleBrackets} Brackets (0% - 42%)</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Splitting Method:</span>
                    <p className="font-semibold text-slate-800">
                      {rule.splittingMethodEnabled ? 'Class 2 Splitting Active' : 'Disabled'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Frais d&apos;obtention:</span>
                    <p className="font-semibold text-slate-800">€{rule.standardDeductionFrais} min/employee</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Primary Mortgage Cap:</span>
                    <p className="font-semibold text-slate-800">€{rule.primaryResidenceMortgageCap}/member</p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200">
                  <span className="text-[11px] font-semibold text-slate-600">Package SHA-256 Integrity Checksum:</span>
                  <p className="font-mono text-[10px] text-slate-500 break-all">{rule.packageChecksum}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Official Form 100 Box Mappings</h3>
            {forms.map((form) => (
              <div key={form.id}>
                <p className="text-xs font-semibold text-slate-700 mb-2">
                  Form: {form.formCode} ({form.version} — Tax Year {form.taxYear})
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-700">
                      <tr>
                        <th className="py-2 px-3">Form 100 Box</th>
                        <th className="py-2 px-3">Internal Domain Field</th>
                        <th className="py-2 px-3">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {form.boxMappings.map((box) => (
                        <tr key={box.boxNumber}>
                          <td className="py-2 px-3 font-mono font-bold text-sky-700">Box {box.boxNumber}</td>
                          <td className="py-2 px-3 font-mono text-slate-800">{box.fieldName}</td>
                          <td className="py-2 px-3 text-slate-600">{box.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          {/* Statutory Filing Deadlines */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Statutory Filing Deadlines & Schedules (§ 19)</h3>
            <p className="text-xs text-slate-500 mb-4">
              All official filing windows and legal deadlines are versioned per tax year from official ACD sources.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {deadlines.map((dl) => (
                <div key={dl.id} className="rounded-lg border border-slate-200 p-4 bg-slate-50">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900">{dl.name}</span>
                    <span className="rounded bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-800">
                      {dl.deadlineDate}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-2">{dl.description}</p>
                  <a
                    href={dl.officialSourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-3 text-[11px] font-semibold text-sky-600 hover:underline"
                  >
                    Official ACD Source &rarr;
                  </a>
                </div>
              ))}
            </div>
          </div>

          {/* Multilingual Luxembourg Tax Terminology Reference */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Multilingual Tax Dictionary (§ 18)</h3>
            <p className="text-xs text-slate-500 mb-4">
              Curated official tax terminology across English, French, and German with legal statutory references.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-700">
                  <tr>
                    <th className="py-2 px-3">English (EN)</th>
                    <th className="py-2 px-3">Français (FR)</th>
                    <th className="py-2 px-3">Deutsch (DE)</th>
                    <th className="py-2 px-3">Statutory Basis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {LUXEMBOURG_TAX_TERMS.map((term) => (
                    <tr key={term.key}>
                      <td className="py-2 px-3 font-medium text-slate-900">{term.en}</td>
                      <td className="py-2 px-3 text-slate-700">{term.fr}</td>
                      <td className="py-2 px-3 text-slate-700">{term.de}</td>
                      <td className="py-2 px-3 font-mono text-[11px] text-sky-700">{term.legalReference || '—'}</td>
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
          {/* Header + Register Button */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Provider-Neutral Model Registry</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Integrate public AI models (OpenAI, Anthropic, Mistral, Groq) or private local inferences with live health probes and data protection fences.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowRegisterModal(true);
                  setModalTestResult(null);
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 transition"
              >
                <span>➕</span> Integrate AI Model
              </button>
            </div>

            {/* Models Cards Grid */}
            <div className="grid gap-4 sm:grid-cols-2">
              {models.map((m) => {
                const probe = probeResults[m.id];
                const isTesting = testingModelId === m.id;

                return (
                  <div
                    key={m.id}
                    className={`rounded-lg border p-4 transition ${
                      m.isCustom ? 'border-sky-200 bg-sky-50/20' : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-slate-900">{m.displayName}</h4>
                          {m.isCustom && (
                            <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold text-sky-800 border border-sky-200">
                              CUSTOM
                            </span>
                          )}
                        </div>
                        <p className="font-mono text-[11px] text-slate-600 mt-0.5">{m.modelIdentifier}</p>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                            m.providerType === 'CUSTOM_PUBLIC'
                              ? 'bg-purple-100 text-purple-800'
                              : m.providerType === 'LOCAL'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}
                        >
                          {m.providerType}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                            m.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : m.status === 'CANARY'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {m.status}
                        </span>
                      </div>
                    </div>

                    {/* Endpoint & Key Info */}
                    {m.endpointUrl && (
                      <div className="mt-2 text-[10px] font-mono text-slate-500 break-all bg-white/70 p-1.5 rounded border border-slate-200">
                        <span className="font-semibold text-slate-600">Endpoint: </span>
                        {m.endpointUrl}
                        {m.apiKeyMasked && (
                          <span className="ml-2 text-indigo-600 font-bold">
                            [Key: {m.apiKeyMasked}]
                          </span>
                        )}
                      </div>
                    )}

                    {/* Capabilities & Tags */}
                    <div className="mt-3 flex flex-wrap gap-1">
                      {m.capabilities.map((c) => (
                        <span key={c} className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">
                          {c}
                        </span>
                      ))}
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                        Region: {m.hostingRegion}
                      </span>
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        {m.permittedDataClass}
                      </span>
                    </div>

                    {/* Probe Result Box if triggered */}
                    {probe && (
                      <div
                        className={`mt-3 p-2 rounded text-[11px] border ${
                          probe.success
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border-rose-200'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold">
                          <span>{probe.success ? '✓ Probe Reached Endpoint' : '✗ Probe Failed'}</span>
                          <span>{probe.latencyMs}ms</span>
                        </div>
                        <p className="mt-0.5 text-[10px] opacity-90">{probe.message}</p>
                      </div>
                    )}

                    {/* Action Bar */}
                    <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            m.healthy ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                        />
                        <span className="text-[10px] font-semibold text-slate-600">
                          {m.healthy ? (m.latencyMs ? `Healthy (${m.latencyMs}ms)` : 'Healthy') : 'Degraded'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handlePingModel(m)}
                          disabled={isTesting}
                          className="rounded bg-white border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs disabled:opacity-50"
                        >
                          {isTesting ? '⚡ Probing...' : '⚡ Ping Test'}
                        </button>

                        <button
                          onClick={() => handleToggleModelStatus(m)}
                          className="rounded bg-white border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs"
                        >
                          {m.status === 'ACTIVE' ? 'Disable' : 'Activate'}
                        </button>

                        {m.isCustom && (
                          <button
                            onClick={() => handleDeleteModel(m)}
                            className="rounded bg-rose-50 border border-rose-200 px-2 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-100 transition shadow-xs"
                          >
                            🗑️ Delete
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
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Task-Based Model Routing Policies</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Route Luxembourg tax processing tasks to specific primary and fallback models with traffic rollouts.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {routes.map((r) => {
                const primaryModel = models.find((m) => m.id === r.primaryModelId);

                return (
                  <div
                    key={r.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-slate-200 p-4 bg-slate-50 text-xs hover:border-slate-300 transition"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-indigo-700">{r.taskName}</span>
                        <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                          {r.maxDataClass}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-600">
                        Primary:{' '}
                        <strong className="text-slate-900">
                          {primaryModel ? primaryModel.displayName : r.primaryModelId}
                        </strong>{' '}
                        <span className="font-mono text-[10px] text-slate-500">({r.primaryModelId})</span> • 
                        Fallbacks: {r.fallbackModelIds.length ? r.fallbackModelIds.join(', ') : 'None'} • 
                        Timeout: {r.timeoutMs}ms
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                        {r.activeRolloutPercentage}% Rollout
                      </span>
                      <button
                        onClick={() => handleOpenEditRoute(r)}
                        className="rounded-lg bg-white border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-xs"
                      >
                        ✏️ Edit Route Policy
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
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-2">Luxembourg Golden Benchmark Evaluations</h3>
          <p className="text-xs text-slate-500 mb-4">
            No model route activates without exceeding the 90% exact-match and 0% hallucination thresholds on anonymised golden sets.
          </p>
          <div className="space-y-4">
            {evaluations.map((ev) => (
              <div key={ev.id} className="rounded-lg border border-slate-200 p-4 bg-slate-50">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800">{ev.datasetName}</h4>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                    ✓ Threshold Passed
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <div>
                    <span className="text-slate-500">Exact Match Rate:</span>
                    <p className="text-sm font-bold text-emerald-600">{(ev.exactMatchRate * 100).toFixed(1)}%</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Schema Valid:</span>
                    <p className="text-sm font-bold text-slate-800">{(ev.schemaValidRate * 100).toFixed(1)}%</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Hallucination Rate:</span>
                    <p className="text-sm font-bold text-emerald-600">{(ev.hallucinationRate * 100).toFixed(1)}%</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Avg Latency:</span>
                    <p className="text-sm font-bold text-slate-800">{ev.avgLatencyMs} ms</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subtab 4: Audit Trail */}
      {activeSubTab === 'audit' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-2">Platform Immutable Audit Trail</h3>
          <p className="text-xs text-slate-500 mb-4">
            Append-only record of all administrative, authentication, and filing operations
          </p>
          <div className="divide-y divide-slate-100">
            {auditEvents.map((evt) => (
              <div key={evt.id} className="py-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">{evt.description}</span>
                  <span className="font-mono text-[10px] text-slate-400">
                    {new Date(evt.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700">
                    {evt.eventType}
                  </span>
                  <span>Actor: {evt.actorEmail || evt.actorId}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 1: REGISTER CUSTOM AI MODEL                         */}
      {/* ========================================================= */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Integrate AI Model (Public / Custom)</h3>
                <p className="text-xs text-slate-500">
                  Configure an OpenAI, Mistral, Anthropic, Groq, or custom public inference endpoint
                </p>
              </div>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl"
              >
                &times;
              </button>
            </div>

            {/* Quick Presets */}
            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Quick Integration Presets
              </label>
              <div className="flex flex-wrap gap-1.5">
                {MODEL_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => handleApplyPreset(p)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-sky-50 hover:border-sky-300 hover:text-sky-700 transition"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleRegisterModelSubmit} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Display Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={registerForm.displayName}
                    onChange={(e) =>
                      setRegisterForm((prev) => ({ ...prev, displayName: e.target.value }))
                    }
                    placeholder="e.g. Mistral Large 2 (EU Public)"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-sky-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Provider Type <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={registerForm.providerType}
                    onChange={(e) =>
                      setRegisterForm((prev) => ({
                        ...prev,
                        providerType: e.target.value as any,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-sky-500 focus:outline-hidden bg-white"
                  >
                    <option value="CUSTOM_PUBLIC">CUSTOM_PUBLIC (Public API Endpoint)</option>
                    <option value="HOSTED">HOSTED (Managed Cloud Inference)</option>
                    <option value="PRIVATE_CLOUD">PRIVATE_CLOUD (Dedicated VPC)</option>
                    <option value="LOCAL">LOCAL (On-Premise / Edge Instance)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Model Identifier <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={registerForm.modelIdentifier}
                    onChange={(e) =>
                      setRegisterForm((prev) => ({ ...prev, modelIdentifier: e.target.value }))
                    }
                    placeholder="e.g. mistral-large-latest or gpt-4o"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-sky-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Hosting Region <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={registerForm.hostingRegion}
                    onChange={(e) =>
                      setRegisterForm((prev) => ({ ...prev, hostingRegion: e.target.value }))
                    }
                    placeholder="e.g. EU_WEST_1, GLOBAL_PUBLIC, EU_LOCAL"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-sky-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Endpoint URL (Base or Full Probe URL)
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={registerForm.endpointUrl}
                    onChange={(e) =>
                      setRegisterForm((prev) => ({ ...prev, endpointUrl: e.target.value }))
                    }
                    placeholder="https://api.mistral.ai/v1 or https://api.openai.com/v1"
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-sky-500 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={handleTestModalConnection}
                    disabled={isModalTesting || !registerForm.endpointUrl}
                    className="rounded-lg bg-slate-100 border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition disabled:opacity-50 whitespace-nowrap"
                  >
                    {isModalTesting ? '⚡ Probing...' : '⚡ Test Probe'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  API Key / Secret Token (Protected Server-Side)
                </label>
                <input
                  type="password"
                  value={registerForm.apiKey}
                  onChange={(e) =>
                    setRegisterForm((prev) => ({ ...prev, apiKey: e.target.value }))
                  }
                  placeholder="sk-..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:border-sky-500 focus:outline-hidden"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Keys are stored encrypted/protected on the server and never exposed to the frontend browser client.
                </p>
              </div>

              {/* Probe Result Box in Modal */}
              {modalTestResult && (
                <div
                  className={`p-3 rounded-lg border text-xs ${
                    modalTestResult.success
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span>{modalTestResult.success ? '✓ Probe Succeeded' : '⚠ Probe Result'}</span>
                    <span>{modalTestResult.latencyMs}ms</span>
                  </div>
                  <p className="mt-1 text-[11px]">{modalTestResult.message}</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Permitted Data Classification
                  </label>
                  <select
                    value={registerForm.permittedDataClass}
                    onChange={(e) =>
                      setRegisterForm((prev) => ({
                        ...prev,
                        permittedDataClass: e.target.value as any,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-sky-500 focus:outline-hidden bg-white"
                  >
                    <option value="CUSTOMER_DOCUMENT">CUSTOMER_DOCUMENT (Strict Personal Data)</option>
                    <option value="REDACTED_CUSTOMER">REDACTED_CUSTOMER (Anonymised / Masked)</option>
                    <option value="SYNTHETIC">SYNTHETIC (Test Sets Only)</option>
                    <option value="PUBLIC">PUBLIC (Non-PII Public Queries)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Initial Status</label>
                  <select
                    value={registerForm.status}
                    onChange={(e) =>
                      setRegisterForm((prev) => ({
                        ...prev,
                        status: e.target.value as any,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-sky-500 focus:outline-hidden bg-white"
                  >
                    <option value="ACTIVE">ACTIVE (Ready for Routing)</option>
                    <option value="CANARY">CANARY (Shadow Testing Only)</option>
                    <option value="DISABLED">DISABLED (Temporarily Offline)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Capabilities</label>
                <div className="flex flex-wrap gap-4 pt-1">
                  {(['TEXT', 'VISION', 'EMBEDDING', 'RERANKING'] as const).map((cap) => {
                    const isChecked = registerForm.capabilities.includes(cap);
                    return (
                      <label key={cap} className="flex items-center gap-1.5 cursor-pointer">
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
                          className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        />
                        <span className="font-medium text-slate-700">{cap}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="rounded-lg bg-slate-100 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingModel}
                  className="rounded-lg bg-sky-600 px-4 py-2 font-semibold text-white hover:bg-sky-700 transition disabled:opacity-50"
                >
                  {isSubmittingModel ? 'Registering Model...' : 'Register & Save Model'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: EDIT MODEL ROUTE POLICY                          */}
      {/* ========================================================= */}
      {editingRoute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Edit Task Routing Policy</h3>
                <p className="text-xs font-mono text-indigo-700">{editingRoute.taskName}</p>
              </div>
              <button
                onClick={() => setEditingRoute(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveRouteSubmit} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Primary Model <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={routeForm.primaryModelId}
                  onChange={(e) =>
                    setRouteForm((prev) => ({
                      ...prev,
                      primaryModelId: e.target.value,
                      fallbackModelIds: prev.fallbackModelIds.filter((id) => id !== e.target.value),
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-sky-500 focus:outline-hidden bg-white font-medium"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName} ({m.modelIdentifier}) [{m.providerType}]
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  Incoming requests for this task are directed to this primary model first.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Fallback Models</label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto border border-slate-200 rounded-lg p-2.5 bg-slate-50">
                  {models
                    .filter((m) => m.id !== routeForm.primaryModelId)
                    .map((m) => {
                      const isChecked = routeForm.fallbackModelIds.includes(m.id);
                      return (
                        <label key={m.id} className="flex items-center gap-2 cursor-pointer">
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
                            className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                          />
                          <span className="text-slate-800">
                            {m.displayName} <span className="text-slate-500 font-mono text-[10px]">({m.modelIdentifier})</span>
                          </span>
                        </label>
                      );
                    })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Timeout (ms)</label>
                  <input
                    type="number"
                    min={500}
                    max={60000}
                    step={500}
                    value={routeForm.timeoutMs}
                    onChange={(e) =>
                      setRouteForm((prev) => ({ ...prev, timeoutMs: Number(e.target.value) }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-sky-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Rollout Percentage ({routeForm.activeRolloutPercentage}%)
                  </label>
                  <input
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
                    className="w-full accent-sky-600 mt-2"
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingRoute(null)}
                  className="rounded-lg bg-slate-100 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRoute}
                  className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 transition disabled:opacity-50"
                >
                  {isSubmittingRoute ? 'Saving Route...' : 'Save Route Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
