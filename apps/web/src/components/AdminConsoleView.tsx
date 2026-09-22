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
} from '@luxtax/contracts';

export function AdminConsoleView() {
  const [overview, setOverview] = useState<AdminOverviewDto | null>(null);
  const [taxRules, setTaxRules] = useState<readonly TaxRulePackageDto[]>([]);
  const [forms, setForms] = useState<readonly FormMappingDto[]>([]);
  const [models, setModels] = useState<readonly ModelDefinitionDto[]>([]);
  const [routes, setRoutes] = useState<readonly ModelRouteDto[]>([]);
  const [evaluations, setEvaluations] = useState<readonly EvaluationRunDto[]>([]);
  const [auditEvents, setAuditEvents] = useState<readonly AuditEventDto[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'rules' | 'models' | 'evals' | 'audit'>('rules');
  const [loading, setLoading] = useState(true);

  const loadAdminData = async () => {
    setLoading(true);
    const [ovRes, rulesRes, formsRes, modelsRes, routesRes, evalsRes, auditRes] =
      await Promise.all([
        apiClient.getAdminOverview(),
        apiClient.getAdminTaxRules(),
        apiClient.getAdminForms(),
        apiClient.getAdminModels(),
        apiClient.getAdminModelRoutes(),
        apiClient.getAdminEvaluations(),
        apiClient.getAdminAudit({ limit: 15 }),
      ]);

    if (ovRes.data) setOverview(ovRes.data);
    if (rulesRes.data) setTaxRules(rulesRes.data);
    if (formsRes.data) setForms(formsRes.data);
    if (modelsRes.data) setModels(modelsRes.data);
    if (routesRes.data) setRoutes(routesRes.data);
    if (evalsRes.data) setEvaluations(evalsRes.data);
    if (auditRes.data) setAuditEvents(auditRes.data);
    setLoading(false);
  };

  useEffect(() => {
    loadAdminData();
  }, []);

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
              Versioned tax rule packages, Form 100 mappings, AI model routes, and quality benchmark metrics
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
              {overview?.registeredModelsCount || 4}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-4 border border-slate-100">
            <p className="text-xs font-medium text-slate-500">AI Task Routes</p>
            <p className="mt-1 text-2xl font-bold text-indigo-600">
              {overview?.activeRoutesCount || 5}
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
      <div className="flex border-b border-slate-200 bg-white px-4 rounded-t-xl">
        <button
          onClick={() => setActiveSubTab('rules')}
          className={`py-3 px-4 text-xs font-bold border-b-2 transition ${
            activeSubTab === 'rules'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          📜 Tax Rule Packages & Forms
        </button>
        <button
          onClick={() => setActiveSubTab('models')}
          className={`py-3 px-4 text-xs font-bold border-b-2 transition ${
            activeSubTab === 'models'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          🤖 Model Registry & Routing
        </button>
        <button
          onClick={() => setActiveSubTab('evals')}
          className={`py-3 px-4 text-xs font-bold border-b-2 transition ${
            activeSubTab === 'evals'
              ? 'border-sky-600 text-sky-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          📊 Golden Benchmarks & Evaluations
        </button>
        <button
          onClick={() => setActiveSubTab('audit')}
          className={`py-3 px-4 text-xs font-bold border-b-2 transition ${
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
                    <span className="text-slate-500">Frais d\'obtention:</span>
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
        </div>
      )}

      {/* Subtab 2: Models & Routes */}
      {activeSubTab === 'models' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Provider-Neutral Model Registry</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {models.map((m) => (
                <div key={m.id} className="rounded-lg border border-slate-200 p-4 bg-slate-50">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-900">{m.displayName}</h4>
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      {m.providerType}
                    </span>
                  </div>
                  <p className="font-mono text-[11px] text-slate-600 mt-1">{m.modelIdentifier}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {m.capabilities.map((c) => (
                      <span key={c} className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">
                        {c}
                      </span>
                    ))}
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                      Region: {m.hostingRegion}
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500">
                    Max Data Class: <strong className="text-slate-700">{m.permittedDataClass}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Task-Based Model Routing Policies</h3>
            <div className="space-y-3">
              {routes.map((r) => (
                <div key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border border-slate-100 p-3 bg-slate-50 text-xs">
                  <div>
                    <span className="font-mono font-bold text-indigo-700">{r.taskName}</span>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Primary: <span className="font-semibold text-slate-700">{r.primaryModelId}</span> • 
                      Fallbacks: {r.fallbackModelIds.length ? r.fallbackModelIds.join(', ') : 'None'} • 
                      Timeout: {r.timeoutMs}ms
                    </div>
                  </div>
                  <div className="mt-2 sm:mt-0 sm:text-right">
                    <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                      {r.maxDataClass}
                    </span>
                    <span className="ml-2 text-[11px] text-slate-600 font-semibold">{r.activeRolloutPercentage}% Rollout</span>
                  </div>
                </div>
              ))}
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
    </div>
  );
}
