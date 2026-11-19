# Frontend codemap

**Last updated:** 2026-11-19
**Web entry points:** `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`
**Mobile entry points:** `apps/mobile/app/_layout.tsx`, `apps/mobile/app/index.tsx`
**Shared client:** `packages/api-client/src/client.ts`

---

## Web application (`apps/web`)

Next.js 16 App Router, React 19, Tailwind CSS v4, Lucide icons. All interactive pages are client components; there is no server-side data fetching in the current build.

### Routes

| Route | File | Purpose |
|---|---|---|
| `/` | `src/app/page.tsx` | Landing / entry; redirects signed-in users toward their household |
| `/login` | `src/app/(auth)/login/page.tsx` | Credential login, optional TOTP field, error surface |
| `/register` | `src/app/(auth)/register/page.tsx` | Account creation |
| `/invite/[token]` | `src/app/invite/[token]/page.tsx` | Invitation details and acceptance |
| `/[householdId]/dashboard` | `src/app/(workspace)/[householdId]/dashboard/page.tsx` | The workspace shell: data load, tab routing, year selector, activity preview, invite modal, notification centre |
| `/_not-found` | Next.js default | Unknown route |

Build output: **6 routes** on a successful `next build`.

### Dashboard tabs

The dashboard is a single route with a `TabKey` state machine:

| Tab | Component | Responsibility |
|---|---|---|
| `overview` | inline + `NotificationCenter` | Readiness, year selection, household members, recent activity |
| `documents` | `DocumentsView` | Upload, visibility, confidence, *Needs OCR*, re-scan, confirm one/bulk |
| `freelance` | `FreelanceBusinessView` | Business profile, revenue/expense summary, demo data |
| `facts` | `FactsView` | Confirmed facts, category, inclusion toggle, editing, deletion |
| `questionnaire` | `QuestionnaireView` | Tax profile, class inputs, deductions, child relief, prior losses |
| `calculator` | `TaxCalculatorView` | Calculate, breakdown, provenance, scenario comparison |
| `filing` | `FilingPackageView` | Approval, package generation, annex PDF, Form 100 cases, version history |
| `assessment` | `AssessmentView` | Import bulletin, variance, objection deadline, follow-up, rollover |
| `admin` | `AdminConsoleView` | Platform admin console (renders a 403 state for non-admins) |

### Components

| Component | Role | Key dependencies |
|---|---|---|
| `AdminConsoleView` | Model registry, routes, connection test, audit, governance | `apiClient`, contracts, `HelpTip` |
| `AssessmentView` | Import assessment, variance, deadlines, filing record, rollover | `apiClient`, `HelpTip` |
| `CameraScanModal` | Browser camera capture → base64 upload | `navigator.mediaDevices` |
| `DocumentsView` | Vault, upload, visibility, confidence, re-extraction, batch confirm | `apiClient`, `HelpTip`, `document-visibility` |
| `FactsView` | Confirmed fact table, inclusion, edit/delete | `apiClient`, `fact-inclusion`, `money` |
| `FilingPackageView` | Approval gate, package, annex download, case map, history | `apiClient`, `HelpTip` |
| `FreelanceBusinessView` | Profiles, metrics, P&L, demo | `apiClient`, `HelpTip` |
| `HelpTip` | Accessible **?** trigger and portal bubble | `help-texts`, `tooltip-position` |
| `InviteModal` | Invite a co-filer/viewer | `apiClient` |
| `NotificationCenter` | Bell, unread count, list, mark read/all | `apiClient` |
| `QuestionnaireView` | Full tax profile form | `apiClient`, `help-texts`, `HelpTip` |
| `TaxCalculatorView` | Results, deductions, credits, provenance, scenarios | `apiClient`, `HelpTip` |

### Web libraries

| Module | Purpose |
|---|---|
| `src/lib/api.ts` | One `LuxTaxApiClient`; `API_BASE_URL` = `NEXT_PUBLIC_API_URL` or the page's hostname on port 3001; localStorage token access (`luxtax_access_token`, `luxtax_refresh_token`); single-flight refresh; `downloadAnnexPdf` |
| `src/lib/auth-context.tsx` | `AuthProvider` / `useAuth`; loads `/api/users/me`, stores tokens, best-effort logout |
| `src/lib/auth-redirect.ts` | Safe post-login redirect validation |
| `src/lib/help-texts.ts` | 56 copy entries; `HelpId` is a compile-time key |
| `src/lib/tooltip-position.ts` | Pure viewport-clamping/flip geometry |
| `src/lib/money.ts` | Euro formatting and `NO_AMOUNT` sentinel |
| `src/lib/document-visibility.ts` | Visibility labels/transitions |
| `src/lib/fact-dedup.ts` | De-duplicates extracted vs confirmed proposals |
| `src/lib/fact-inclusion.ts` | Inclusion toggle rules |
| `src/lib/camera*` (via component) | Camera permission and capture lifecycle |

### State and data flow

```
AuthProvider
  ├─ on mount: getMe() if an access token exists
  ├─ login(tokens,user): localStorage + state
  └─ logout(): POST /api/auth/logout, clear local session

DashboardPage
  ├─ loads household + workspaces + activity in parallel
  ├─ loads selected year workspace + readiness
  ├─ passes workspaceId/householdId/onChanged to tab views
  └─ a failed read clears the previous data and shows the error

Every write view
  ├─ calls apiClient
  ├─ on success: reloads the data it owns
  └─ on approval-affecting writes: the API invalidates approvals; the UI
     re-reads return versions
```

Tokens live in `localStorage` (`luxtax_access_token`, `luxtax_refresh_token`). The API client renews once on 401 and redirects to `/login` only after renewal fails.

### Styling and accessibility

- Tailwind utility classes; design tokens are consumed as CSS variables/classes from `@luxtax/design-tokens`.
- `HelpTip` uses a real `<button>`, `aria-expanded`, `aria-describedby`, keyboard focus, `Escape`, and a fixed-position portal.
- Tables use semantic `<table>`; forms use `<label>`; interactive cards are buttons or links, not click-handled `<div>`s.

### Web tests

`apps/web/test/*.spec.ts`, 80 collected tests:

- Pure modules: money, auth redirect, document visibility, fact dedup/inclusion, tooltip position, logout URL.
- Client/auth: `api-client-auth`, `session-refresh`, `logout`, `logout-url`.
- Render specs: login/register pages, dashboard, questionnaire, calculator, documents, facts, invite, camera modal, help tip.
- Ten render tests fail when `apps/web/node_modules` exists because `.tools` uses React 18's `react-test-renderer` against React 19. This is a harness mismatch; the pure and non-render specs pass.

---

## Mobile application (`apps/mobile`)

Expo SDK 52, React Native 0.76, React 18.3, Expo Router 4. Tabs are defined in `app/(tabs)/_layout.tsx`; `activity` is hidden from the tab bar and reached from Home.

### Screens

| Route | File | Purpose |
|---|---|---|
| `/` | `app/index.tsx` | Entry / session bootstrap |
| `/login` | `app/(auth)/login.tsx` | Login |
| `/(tabs)` Home | `app/(tabs)/index.tsx` | Workspace summary, readiness, contextual actions |
| `/(tabs)/documents` | `app/(tabs)/documents.tsx` | Vault, upload, camera scan, status |
| `/(tabs)/tasks` | `app/(tabs)/tasks.tsx` | Missing-information tasks |
| `/(tabs)/estimate` | `app/(tabs)/estimate.tsx` | Calculation summary and estimate |
| `/(tabs)/account` | `app/(tabs)/account.tsx` | Profile, notification preferences, app lock, sign-out |
| `/(tabs)/activity` | `app/(tabs)/activity.tsx` | Household audit feed (hidden tab) |

### Mobile libraries

| Module | Purpose |
|---|---|
| `src/lib/api-client.ts` | Mobile API client configured with SecureStore tokens |
| `src/lib/secure-storage.ts` | Expo SecureStore wrapper |
| `src/lib/workspace.ts` | Resolves household → workspace id; distinguishes `NO_HOUSEHOLD` / `NO_WORKSPACE` / `ERROR` |
| `src/lib/offline-queue.ts` | Pure FIFO queue for `UPLOAD_DOCUMENT`, `CALCULATE_TAX`, `APPROVE_RETURN`; dedupe, 50-item cap, 5 attempts, 5 s→5 min backoff |
| `src/lib/queue-runtime.ts` | Replay loop that stops on the first retryable failure |
| `src/lib/app-lock.ts` | Biometric/passcode lock policy and timeout |
| `src/lib/push-and-status.ts` | Push token registration and notification status mapping |
| `src/lib/deep-links.ts` | Invite and workspace deep-link parsing |
| `src/lib/file-export.ts` | Document/package export helpers |
| `src/lib/package-download.ts` | Filing package download |
| `src/lib/privacy.ts` | Screenshot/privacy policy helpers |

### Components

- `AppLockScreen` — lock gate with retry/unlock states.
- `DocumentCameraScanner` — Expo Camera capture and upload.
- `OfflineBanner` — queue/pending/offline state.

### Mobile tests

`apps/mobile/test/*.spec.ts`, 134 tests: app lock, client methods, deep links, file export, offline queue, package download, privacy, push/status, queue runtime, render (through a `react-native` primitive shim), workspace resolution. Layout, gestures, camera, and biometrics are **not** verified on hardware.

---

## Shared package boundaries

| Package | Imported by | Notes |
|---|---|---|
| `@luxtax/contracts` | API, web, mobile, tax-engine | Types plus the `TaxClass` enum; no third-party runtime dependency |
| `@luxtax/validation` | API, web, mobile | Same schema at every boundary |
| `@luxtax/api-client` | Web, mobile | Single client, configurable token getter/refresh |
| `@luxtax/design-tokens` | Web, mobile | Tokens + `getTermTranslation` |

Do not duplicate DTOs in a client. If a field is missing, add it to `packages/contracts` and update the API response in the same change.

---

## Related

- [Architecture](ARCHITECTURE.md)
- [Modules](MODULES.md)
- [Files](FILES.md)
- [Backend](backend.md)
- [API reference](../api.md)
- [Help affordances](../help-affordances.md)
- [Integrations](integrations.md)
