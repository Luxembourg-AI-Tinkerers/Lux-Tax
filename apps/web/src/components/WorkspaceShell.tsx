'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  Calculator,
  ClipboardList,
  Command,
  FileCheck2,
  FileText,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Scale,
  Search,
  Settings2,
  UserPlus,
  X,
} from 'lucide-react';
import { TaxYearWorkspaceDto, WorkspaceStatus } from '@luxtax/contracts';
import { HelpTip } from './HelpTip';
import { NotificationCenter } from './NotificationCenter';
import { StatusBadge, type BadgeTone } from './ui/StatusBadge';
import { Modal } from './ui/Modal';

export type TabKey =
  | 'overview'
  | 'documents'
  | 'freelance'
  | 'facts'
  | 'questionnaire'
  | 'calculator'
  | 'filing'
  | 'assessment'
  | 'admin';

export interface WorkspaceNavItem {
  key: TabKey;
  label: string;
  shortLabel: string;
  group: 'Workspace' | 'Tax & Filing' | 'System';
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  done?: boolean;
}

interface WorkspaceShellProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  householdName: string;
  selectedYear: number;
  onSelectYear: (year: number) => void;
  workspaces: readonly TaxYearWorkspaceDto[];
  workspace: TaxYearWorkspaceDto | null;
  statusTone: BadgeTone;
  completionScore: number;
  hasBalance: boolean;
  isRefund: boolean;
  balanceLabel: string;
  hasCoFiler: boolean;
  onOpenInvite: () => void;
  userDisplayName?: string;
  userEmail?: string;
  userInitials: string;
  onLogout: () => void;
  children?: React.ReactNode;
}

const SIDEBAR_STORAGE_KEY = 'luxtax_sidebar_collapsed';

export function WorkspaceShell({
  activeTab,
  onSelectTab,
  householdName,
  selectedYear,
  onSelectYear,
  workspaces,
  workspace,
  statusTone,
  completionScore,
  hasBalance,
  isRefund,
  balanceLabel,
  hasCoFiler,
  onOpenInvite,
  userDisplayName,
  userEmail,
  userInitials,
  onLogout,
  children,
}: WorkspaceShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage?.getItem?.(SIDEBAR_STORAGE_KEY);
      if (saved === 'true') setCollapsed(true);
    } catch {
      // Ignore storage access restrictions
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        try {
          window.localStorage?.setItem?.(SIDEBAR_STORAGE_KEY, String(next));
        } catch {
          // Ignore storage quota errors
        }
      }
      return next;
    });
  };

  // Global Cmd+K / Ctrl+K shortcut for quick workspace navigation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((open) => !open);
      } else if (event.key === 'Escape' && drawerOpen) {
        setDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  const navItems: readonly WorkspaceNavItem[] = useMemo(
    () => [
      {
        key: 'overview',
        label: 'Overview',
        shortLabel: 'Overview',
        group: 'Workspace',
        description: 'Return readiness, next steps, and household activity',
        icon: LayoutDashboard,
      },
      {
        key: 'documents',
        label: 'Document Vault',
        shortLabel: 'Docs',
        group: 'Workspace',
        description: 'Upload certificates, scan receipts, verify extracted figures',
        icon: FileText,
        done: completionScore >= 25,
      },
      {
        key: 'facts',
        label: 'Confirmed Facts',
        shortLabel: 'Facts',
        group: 'Workspace',
        description: 'Review income, withholding, and deductible return inputs',
        icon: Scale,
        done: completionScore >= 40,
      },
      {
        key: 'freelance',
        label: 'Freelance & Business',
        shortLabel: 'Freelance',
        group: 'Workspace',
        description: 'Track independent income, expenses, and VAT (Art. 14/91)',
        icon: Briefcase,
      },
      {
        key: 'questionnaire',
        label: 'Tax Profile',
        shortLabel: 'Profile',
        group: 'Tax & Filing',
        description: 'Household filing status, dependants, and checklist tasks',
        icon: ClipboardList,
        done: completionScore >= 60,
      },
      {
        key: 'calculator',
        label: `${selectedYear} Tax Engine`,
        shortLabel: 'Engine',
        group: 'Tax & Filing',
        description: 'Deterministic Luxembourg tariff, credits, and Class 2 comparison',
        icon: Calculator,
        done: hasBalance,
      },
      {
        key: 'filing',
        label: 'Approvals & Filing',
        shortLabel: 'Filing',
        group: 'Tax & Filing',
        description: 'Spousal approvals, Form 100 boxes, and MyGuichet transfer guide',
        icon: PackageCheck,
        done:
          workspace?.status === WorkspaceStatus.APPROVED ||
          workspace?.status === WorkspaceStatus.FILING_PACKAGE_READY ||
          workspace?.status === WorkspaceStatus.FILED,
      },
      {
        key: 'assessment',
        label: 'Assessment & Rollover',
        shortLabel: 'Assess',
        group: 'Tax & Filing',
        description: 'Freeze filed return, compare ACD notice, start next year',
        icon: FileCheck2,
        done:
          workspace?.status === WorkspaceStatus.FILED ||
          workspace?.status === WorkspaceStatus.ASSESSED,
      },
      {
        key: 'admin',
        label: 'Admin & Models',
        shortLabel: 'Admin',
        group: 'System',
        description: 'Rule packages, extraction model routes, and system audit',
        icon: Settings2,
      },
    ],
    [selectedYear, completionScore, hasBalance, workspace?.status],
  );

  const activeItem = navItems.find((item) => item.key === activeTab) ?? navItems[0];

  const groupedNav = useMemo(
    () => [
      { title: 'Workspace', items: navItems.filter((i) => i.group === 'Workspace') },
      { title: 'Tax & Filing', items: navItems.filter((i) => i.group === 'Tax & Filing') },
      { title: 'System', items: navItems.filter((i) => i.group === 'System') },
    ],
    [navItems],
  );

  const mobilePrimaryKeys: readonly TabKey[] = ['overview', 'documents', 'facts', 'calculator'];
  const isOverflowTabActive = !mobilePrimaryKeys.includes(activeTab);

  const handleNavigate = (tab: TabKey) => {
    onSelectTab(tab);
    setDrawerOpen(false);
    setCommandOpen(false);
    setCommandQuery('');
  };

  const filteredCommandItems = useMemo(() => {
    const q = commandQuery.trim().toLowerCase();
    if (!q) return navItems;
    return navItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q),
    );
  }, [commandQuery, navItems]);

  const renderSidebarBody = (isRailOnly: boolean, onCloseDrawer?: () => void) => (
    <div className="flex h-full flex-col">
      {/* Brand Header */}
      <div
        className={`flex h-15 shrink-0 items-center border-b border-zinc-200/80 px-3.5 ${
          isRailOnly ? 'justify-center' : 'justify-between gap-2'
        }`}
      >
        {!isRailOnly ? (
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-950 text-white shadow-xs">
              <Landmark className="h-4.5 w-4.5 text-sky-400" strokeWidth={1.9} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold tracking-tight text-zinc-950">
                {householdName}
              </p>
              <p className="truncate text-[10px] font-medium text-zinc-500">
                Luxembourg Tax · {selectedYear}
              </p>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => handleNavigate('overview')}
            title="Go to Overview"
            aria-label="Go to Overview"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-950 text-sky-400 shadow-xs transition hover:bg-zinc-800"
          >
            <Landmark className="h-4.5 w-4.5" strokeWidth={1.9} aria-hidden="true" />
          </button>
        )}

        {onCloseDrawer ? (
          <button
            type="button"
            onClick={onCloseDrawer}
            aria-label="Close sidebar navigation"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : !isRailOnly ? (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-800 lg:inline-flex"
          >
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {/* Year & Quick Search Controls */}
      {!isRailOnly ? (
        <div className="space-y-2.5 border-b border-zinc-200/70 px-3.5 py-3">
          <div className="flex items-center justify-between gap-2">
            {workspaces.length > 1 ? (
              <select
                aria-label="Select tax year"
                value={selectedYear}
                onChange={(e) => onSelectYear(Number(e.target.value))}
                className="tabular-nums w-full cursor-pointer rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-bold text-zinc-900 shadow-2xs transition hover:border-zinc-300 focus:border-zinc-950 focus:outline-none"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.taxYear}>
                    Tax Year {w.taxYear} ({w.status})
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex w-full items-center justify-between rounded-xl border border-zinc-200/90 bg-white px-2.5 py-1.5 shadow-2xs">
                <span className="tabular-nums text-xs font-bold text-zinc-900">
                  Tax Year {selectedYear}
                </span>
                {workspace?.status && (
                  <StatusBadge tone={statusTone} className="text-[10px] px-2 py-0">
                    {workspace.status.replace(/_/g, ' ')}
                  </StatusBadge>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setDrawerOpen(false);
              setCommandOpen(true);
            }}
            className="flex w-full items-center justify-between rounded-xl border border-zinc-200/90 bg-white px-2.5 py-1.5 text-xs text-zinc-500 shadow-2xs transition hover:border-zinc-300 hover:text-zinc-900"
          >
            <span className="inline-flex items-center gap-2">
              <Search className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
              <span>Quick Jump…</span>
            </span>
            <kbd className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-zinc-500">
              ⌘K
            </kbd>
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 border-b border-zinc-200/70 py-3">
          <button
            type="button"
            onClick={onCloseDrawer ? onCloseDrawer : () => setDrawerOpen(true)}
            title="Open navigation drawer"
            aria-label="Open navigation drawer"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200/80 bg-white text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950 md:flex lg:hidden"
          >
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            title="Expand sidebar"
            aria-label="Expand sidebar"
            className="hidden h-9 w-9 items-center justify-center rounded-xl border border-zinc-200/80 bg-white text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950 lg:flex"
          >
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            title="Quick Jump (⌘K)"
            aria-label="Quick Jump"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200/80 bg-white text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Navigation Groups */}
      <nav
        aria-label="Workspace sections"
        className="scrollbar-subtle flex-1 overflow-y-auto px-2.5 py-3 space-y-5"
      >
        {groupedNav.map((group) => (
          <div key={group.title}>
            {!isRailOnly && (
              <p className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                {group.title}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-current={isActive ? 'page' : undefined}
                    title={isRailOnly ? item.label : undefined}
                    onClick={() => handleNavigate(item.key)}
                    className={`group flex w-full items-center rounded-xl text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 ${
                      isRailOnly
                        ? 'justify-center p-2.5'
                        : 'justify-between gap-2.5 px-2.5 py-2'
                    } ${
                      isActive
                        ? 'bg-zinc-950 text-white shadow-xs'
                        : 'text-zinc-600 hover:bg-zinc-100/90 hover:text-zinc-950'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          isActive
                            ? 'text-sky-400'
                            : 'text-zinc-400 group-hover:text-zinc-700'
                        }`}
                        aria-hidden="true"
                      />
                      {!isRailOnly && <span className="truncate">{item.label}</span>}
                    </span>
                    {!isRailOnly && item.done && (
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          isActive ? 'bg-emerald-400' : 'bg-emerald-500'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Sidebar Footer */}
      <div className="shrink-0 border-t border-zinc-200/80 p-3 space-y-2.5">
        {!isRailOnly ? (
          <>
            {workspace && (
              <div className="rounded-xl border border-zinc-200/80 bg-white p-2.5 shadow-2xs">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-zinc-600">Return readiness</span>
                  <span className="tabular-nums font-bold text-zinc-950">{completionScore}%</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      completionScore >= 80
                        ? 'bg-emerald-500'
                        : completionScore >= 40
                        ? 'bg-sky-600'
                        : 'bg-amber-500'
                    }`}
                    style={{ width: `${completionScore}%` }}
                  />
                </div>
                {workspace.taxClass && (
                  <p className="mt-1.5 text-[10px] font-medium text-zinc-400">
                    Class: {workspace.taxClass.replace(/_/g, ' ')}
                  </p>
                )}
              </div>
            )}

            {!hasCoFiler && (
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  onOpenInvite();
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-950"
              >
                <UserPlus className="h-3.5 w-3.5 text-sky-600" aria-hidden="true" />
                <span>Invite Spouse Co-Filer</span>
              </button>
            )}

            <div className="flex items-center justify-between gap-2 rounded-xl bg-zinc-100/80 px-2.5 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-[11px] font-bold text-white">
                  {userInitials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-zinc-950 leading-tight">
                    {userDisplayName || userEmail || 'Taxpayer'}
                  </p>
                  {userEmail && userDisplayName !== userEmail && (
                    <p className="truncate text-[10px] text-zinc-500">{userEmail}</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onLogout}
                title="Sign Out"
                aria-label="Sign Out"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white hover:text-rose-600"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            {!hasCoFiler && (
              <button
                type="button"
                onClick={onOpenInvite}
                title="Invite Spouse Co-Filer"
                aria-label="Invite Spouse Co-Filer"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-sky-600 transition hover:bg-zinc-100"
              >
                <UserPlus className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={onLogout}
              title="Sign Out"
              aria-label="Sign Out"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 transition hover:bg-rose-50 hover:text-rose-600"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh bg-[#f6f7f9] text-zinc-950">
      {/* Permanent Desktop Sidebar (lg: expandable/collapsible) */}
      <aside
        className={`no-print hidden shrink-0 border-r border-zinc-200/85 bg-[#fcfcfd] transition-[width] duration-200 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col ${
          collapsed ? 'lg:w-[72px]' : 'lg:w-[264px]'
        }`}
      >
        {renderSidebarBody(collapsed)}
      </aside>

      {/* Permanent Tablet Icon Rail (md only) */}
      <aside className="no-print hidden w-[72px] shrink-0 border-r border-zinc-200/85 bg-[#fcfcfd] md:sticky md:top-0 md:flex md:h-dvh md:flex-col lg:hidden">
        {renderSidebarBody(true)}
      </aside>

      {/* Mobile & Tablet Slide-Over Drawer */}
      {drawerOpen && (
        <div className="no-print fixed inset-0 z-50 flex lg:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 bg-zinc-950/45 backdrop-blur-[2px]"
          />
          <aside className="animate-drawer-in relative z-10 flex h-dvh w-[280px] max-w-[85vw] flex-col border-r border-zinc-200 bg-[#fcfcfd] shadow-2xl">
            {renderSidebarBody(false, () => setDrawerOpen(false))}
          </aside>
        </div>
      )}

      {/* Main App Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Clean Context Header (Zero Navigation Tabs) */}
        <header className="no-print pt-safe sticky top-0 z-20 border-b border-zinc-200/80 bg-[#f6f7f9]/90 backdrop-blur-md">
          <div className="mx-auto flex h-15 max-w-[1360px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open navigation menu"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200/90 bg-white text-zinc-700 shadow-2xs transition hover:bg-zinc-50 active:scale-[0.97] lg:hidden"
              >
                <Menu className="h-4.5 w-4.5" aria-hidden="true" />
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-sm font-bold tracking-tight text-zinc-950 sm:text-base">
                    {activeItem.label}
                  </h1>
                  {workspace?.status && (
                    <StatusBadge tone={statusTone} className="hidden sm:inline-flex">
                      {workspace.status.replace(/_/g, ' ')}
                    </StatusBadge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500">
                  <span className="truncate">{householdName}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    <span className="tabular-nums font-semibold text-zinc-700">
                      Tax Year {selectedYear}
                    </span>
                    <HelpTip id="taxYearWorkspace" />
                  </span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
              {/* Quick Outcome Pill (desktop lg+, since tablet icon rail keeps header roomy) */}
              <button
                type="button"
                onClick={() => handleNavigate('calculator')}
                title="Estimated Tax Outcome"
                className="hidden items-center gap-2 rounded-xl border border-zinc-200/90 bg-white px-3 py-1.5 text-xs shadow-2xs transition hover:border-zinc-300 lg:inline-flex"
              >
                <span className="text-[11px] font-medium text-zinc-500">Outcome</span>
                <span
                  className={`tabular-nums font-bold ${
                    !hasBalance
                      ? 'text-zinc-400'
                      : isRefund
                      ? 'text-emerald-700'
                      : 'text-zinc-950'
                  }`}
                >
                  {balanceLabel}
                </span>
              </button>

              {/* Mobile / Tablet Quick Jump icon */}
              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                aria-label="Quick navigation search"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200/90 bg-white text-zinc-600 shadow-2xs transition hover:bg-zinc-50 lg:hidden"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
              </button>

              {!hasCoFiler && (
                <button
                  type="button"
                  onClick={onOpenInvite}
                  className="hidden items-center gap-1.5 rounded-xl border border-zinc-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-2xs transition hover:bg-zinc-50 lg:inline-flex"
                >
                  <UserPlus className="h-3.5 w-3.5 text-sky-600" aria-hidden="true" />
                  <span>Invite Spouse</span>
                </button>
              )}

              {workspace && <NotificationCenter workspaceId={workspace.id} />}
            </div>
          </div>
        </header>

        {/* Main Workspace Canvas (extra bottom padding on mobile for bottom dock) */}
        <main className="mx-auto w-full max-w-[1360px] flex-1 space-y-6 px-4 py-6 pb-24 sm:px-6 md:pb-10 lg:px-8">
          {children}
        </main>
      </div>

      {/* Mobile Native-Style Bottom Navigation Dock (< 768px) */}
      <nav
        aria-label="Mobile navigation dock"
        className="no-print pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200/90 bg-white/95 backdrop-blur-xl md:hidden"
      >
        <div className="grid grid-cols-5 items-stretch">
          {mobilePrimaryKeys.map((key) => {
            const item = navItems.find((i) => i.key === key)!;
            const Icon = item.icon;
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleNavigate(key)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold transition active:scale-95 ${
                  isActive ? 'text-zinc-950' : 'text-zinc-500'
                }`}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0 h-0.5 w-8 rounded-b-full bg-zinc-950"
                  />
                )}
                <Icon
                  className={`h-4.5 w-4.5 ${isActive ? 'text-sky-600' : 'text-zinc-400'}`}
                  aria-hidden="true"
                />
                <span>{item.shortLabel}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="More workspace sections"
            className={`relative flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold transition active:scale-95 ${
              isOverflowTabActive ? 'text-zinc-950' : 'text-zinc-500'
            }`}
          >
            {isOverflowTabActive && (
              <span
                aria-hidden="true"
                className="absolute top-0 h-0.5 w-8 rounded-b-full bg-zinc-950"
              />
            )}
            <Menu
              className={`h-4.5 w-4.5 ${isOverflowTabActive ? 'text-sky-600' : 'text-zinc-400'}`}
              aria-hidden="true"
            />
            <span>More</span>
          </button>
        </div>
      </nav>

      {/* Command Palette / Quick Jump Modal */}
      <Modal
        isOpen={commandOpen}
        onClose={() => {
          setCommandOpen(false);
          setCommandQuery('');
        }}
        titleId="command-palette-title"
        title="Quick Jump"
        subtitle="Navigate directly to any section or household action."
        icon={<Command className="h-4.5 w-4.5" aria-hidden="true" />}
        closeLabel="Close quick jump"
        maxWidthClass="max-w-lg"
      >
        <div className="space-y-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-zinc-400"
              aria-hidden="true"
            />
            <input
              type="text"
              autoFocus
              aria-label="Search workspace sections"
              placeholder="Jump to Documents, Tax Engine, Form 100, Admin…"
              value={commandQuery}
              onChange={(e) => setCommandQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredCommandItems.length > 0) {
                  e.preventDefault();
                  handleNavigate(filteredCommandItems[0].key);
                }
              }}
              className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pr-3.5 pl-10 text-base text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-950 focus:outline-none sm:text-sm"
            />
          </div>

          <div className="max-h-72 space-y-1 overflow-y-auto">
            {filteredCommandItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.key === activeTab;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleNavigate(item.key)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                    isActive
                      ? 'bg-zinc-950 text-white'
                      : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        isActive ? 'text-sky-400' : 'text-zinc-400'
                      }`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold">{item.label}</p>
                      <p
                        className={`truncate text-[11px] ${
                          isActive ? 'text-zinc-300' : 'text-zinc-500'
                        }`}
                      >
                        {item.description}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                      isActive ? 'bg-white/10 text-zinc-200' : 'bg-zinc-100 text-zinc-500'
                    }`}
                  >
                    {item.group}
                  </span>
                </button>
              );
            })}
            {filteredCommandItems.length === 0 && (
              <p className="py-6 text-center text-xs text-zinc-500">
                No sections matching &ldquo;{commandQuery}&rdquo;
              </p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
