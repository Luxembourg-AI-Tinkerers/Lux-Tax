import {
  AuthResponseDto,
  RegisterRequestDto,
  LoginRequestDto,
  RefreshTokenRequestDto,
  UserDto,
  HouseholdDto,
  CreateHouseholdDto,
  InviteMemberDto,
  AcceptInvitationDto,
  InvitationDetailsDto,
  TaxYearWorkspaceDto,
  InitWorkspaceDto,
  WorkspaceReadinessDto,
  AuditEventDto,
  AuditFilterDto,
  DocumentDto,
  UploadDocumentRequestDto,
  DocumentVisibility,
  ExtractedFactDto,
  ConfirmedFactDto,
  ConfirmFactRequestDto,
  ConfirmFactsBulkRequestDto,
  UpdateFactRequestDto,
  QuestionnaireAnswersDto,
  ReadinessDetailsDto,
  TaxCalculationResultDto,
  ScenarioComparisonDto,
  ReturnVersionDto,
  ReturnVersionHistoryDto,
  FilingPackageDto,
  AssessmentDto,
  TaxRulePackageDto,
  FormMappingDto,
  ModelDefinitionDto,
  ModelRouteDto,
  EvaluationRunDto,
  AdminOverviewDto,
  TaxDeadlineDto,
  CreateModelDto,
  UpdateModelDto,
  TestModelConnectionDto,
  TestModelConnectionResultDto,
  UpdateModelRouteDto,
  FreelanceBusinessProfileDto,
  UpdateFreelanceProfileDto,
  FreelanceMetricsDto,
  NotificationListDto,
  NotificationDto,
  NotificationPreferenceDto,
  UpdateNotificationPreferencesDto,
  FilingRecordDto,
  CreateFilingRecordDto,
  UpdateAssessmentFollowUpDto,
} from '@luxtax/contracts';

export interface ApiClientConfig {
  readonly baseUrl: string;
  readonly getAccessToken?: () => string | null | Promise<string | null>;
  /**
   * Renews the session after a 401 on an authenticated request. Return the new
   * access token so the request can be replayed once, or `null` when the
   * session cannot be renewed (the caller is then treated as unauthorized).
   */
  readonly refreshAccessToken?: () => Promise<string | null>;
  readonly onUnauthorized?: () => void;
}

export class LuxTaxApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken?: () => string | null | Promise<string | null>;
  private readonly refreshAccessToken?: () => Promise<string | null>;
  private readonly onUnauthorized?: () => void;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.getAccessToken = config.getAccessToken;
    this.refreshAccessToken = config.refreshAccessToken;
    this.onUnauthorized = config.onUnauthorized;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ data?: T; error?: string; status: number }> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    // Only claim a JSON body when there is one. Fastify (correctly) rejects a
    // request that declares `application/json` and sends nothing, which made
    // every bodyless POST — calculate, approve, read-all, rollover — fail with
    // "Body cannot be empty when content-type is set to 'application/json'".
    const hasBody = options.body !== undefined && options.body !== null;
    const buildHeaders = (token: string | null): Record<string, string> => ({
      Accept: 'application/json',
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...((options.headers as Record<string, string>) || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    });

    let token: string | null = null;
    if (this.getAccessToken) {
      token = await this.getAccessToken();
    }

    try {
      let res = await fetch(url, {
        ...options,
        headers: buildHeaders(token),
      });

      // A 401 on a request that carried no token is a credential failure (a
      // wrong password on login, an unusable refresh token), not an expired
      // session: hand it back to the caller instead of navigating the page away
      // from the message it is about to render.
      if (res.status === 401 && token) {
        // Renew once and replay once. `/api/auth/*` is excluded: the renewal
        // call itself carries no usable session, so renewing it would recurse
        // into this same branch.
        if (this.refreshAccessToken && !endpoint.startsWith('/api/auth/')) {
          const renewed = await this.refreshAccessToken();
          if (renewed) {
            token = renewed;
            res = await fetch(url, {
              ...options,
              headers: buildHeaders(token),
            });
          }
        }

        if (res.status === 401 && this.onUnauthorized) {
          this.onUnauthorized();
        }
      }

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({ message: res.statusText }));
        return {
          error: errorBody.message || `Request failed with status ${res.status}`,
          status: res.status,
        };
      }

      if (res.status === 204) {
        return { status: res.status };
      }

      const data = (await res.json()) as T;
      return { data, status: res.status };
    } catch (err: unknown) {
      return {
        error: err instanceof Error ? err.message : 'Network error',
        status: 0,
      };
    }
  }

  // Auth APIs
  async register(body: RegisterRequestDto) {
    return this.request<AuthResponseDto>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async login(body: LoginRequestDto) {
    return this.request<AuthResponseDto>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async refreshToken(body: RefreshTokenRequestDto) {
    return this.request<AuthResponseDto>('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getMe() {
    return this.request<UserDto>('/api/users/me', {
      method: 'GET',
    });
  }

  // Household APIs
  async getHouseholds() {
    return this.request<readonly HouseholdDto[]>('/api/households', {
      method: 'GET',
    });
  }

  async getHousehold(id: string) {
    return this.request<HouseholdDto>(`/api/households/${id}`, {
      method: 'GET',
    });
  }

  async createHousehold(body: CreateHouseholdDto) {
    return this.request<HouseholdDto>('/api/households', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async inviteMember(householdId: string, body: InviteMemberDto) {
    return this.request<{ invitationToken: string; invitation: unknown }>(
      `/api/households/${householdId}/invitations`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
  }

  async getInvitationDetails(token: string) {
    return this.request<InvitationDetailsDto>(`/api/households/invitations/${token}/details`, {
      method: 'GET',
    });
  }

  async acceptInvitation(body: AcceptInvitationDto) {
    return this.request<HouseholdDto>('/api/households/invitations/accept', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // Workspace APIs
  async getWorkspaces(householdId: string) {
    return this.request<readonly TaxYearWorkspaceDto[]>(`/api/households/${householdId}/workspaces`, {
      method: 'GET',
    });
  }

  async getWorkspace(householdId: string, taxYear: number) {
    return this.request<TaxYearWorkspaceDto>(
      `/api/households/${householdId}/workspaces/${taxYear}`,
      {
        method: 'GET',
      }
    );
  }

  async initWorkspace(householdId: string, body: InitWorkspaceDto) {
    return this.request<TaxYearWorkspaceDto>(`/api/households/${householdId}/workspaces`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getWorkspaceReadiness(householdId: string, taxYear: number) {
    return this.request<WorkspaceReadinessDto>(
      `/api/households/${householdId}/workspaces/${taxYear}/readiness`,
      {
        method: 'GET',
      }
    );
  }

  // Document APIs
  async getDocuments(workspaceId: string) {
    return this.request<DocumentDto[]>(`/api/workspaces/${workspaceId}/documents`, {
      method: 'GET',
    });
  }

  async uploadDocument(workspaceId: string, body: UploadDocumentRequestDto) {
    return this.request<DocumentDto>(`/api/workspaces/${workspaceId}/documents`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async updateDocumentVisibility(
    workspaceId: string,
    documentId: string,
    visibility: DocumentVisibility,
  ) {
    return this.request<DocumentDto>(
      `/api/workspaces/${workspaceId}/documents/${documentId}/visibility`,
      {
        method: 'PATCH',
        body: JSON.stringify({ visibility }),
      }
    );
  }

  /** Reads a stored document again, for example after an OCR model was added. */
  async reextractDocument(workspaceId: string, documentId: string) {
    return this.request<DocumentDto>(
      `/api/workspaces/${workspaceId}/documents/${documentId}/reextract`,
      { method: 'POST' }
    );
  }

  async deleteDocument(workspaceId: string, documentId: string) {
    return this.request<{ success: boolean }>(
      `/api/workspaces/${workspaceId}/documents/${documentId}`,
      {
        method: 'DELETE',
      }
    );
  }

  // Freelance APIs
  async getFreelanceProfiles(workspaceId: string) {
    return this.request<FreelanceBusinessProfileDto[]>(
      `/api/workspaces/${workspaceId}/freelance/profiles`,
      { method: 'GET' }
    );
  }

  async updateFreelanceProfile(
    workspaceId: string,
    ownerId: string,
    body: UpdateFreelanceProfileDto,
  ) {
    return this.request<FreelanceBusinessProfileDto>(
      `/api/workspaces/${workspaceId}/freelance/profiles/${ownerId}`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      }
    );
  }

  async getFreelanceMetrics(workspaceId: string, ownerId?: string) {
    const query = ownerId ? `?ownerId=${encodeURIComponent(ownerId)}` : '';
    return this.request<FreelanceMetricsDto>(
      `/api/workspaces/${workspaceId}/freelance/metrics${query}`,
      { method: 'GET' }
    );
  }

  async loadFreelanceDemo(workspaceId: string) {
    return this.request<{ success: boolean; count: number }>(
      `/api/workspaces/${workspaceId}/freelance/demo`,
      { method: 'POST' }
    );
  }

  // Facts APIs
  async getFacts(workspaceId: string) {
    return this.request<{
      extractedFacts: ExtractedFactDto[];
      confirmedFacts: ConfirmedFactDto[];
    }>(`/api/workspaces/${workspaceId}/facts`, {
      method: 'GET',
    });
  }

  async confirmFact(workspaceId: string, body: ConfirmFactRequestDto) {
    return this.request<ConfirmedFactDto>(`/api/workspaces/${workspaceId}/facts/confirm`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Confirms several recognised figures in one call.
   *
   * Returns what was confirmed and what was skipped with a reason, so the UI can
   * report "4 of 5 confirmed" instead of pretending the batch was atomic.
   */
  async confirmFactsBulk(workspaceId: string, body: ConfirmFactsBulkRequestDto) {
    return this.request<{
      confirmed: ConfirmedFactDto[];
      skipped: Array<{ id: string; reason: string }>;
    }>(`/api/workspaces/${workspaceId}/facts/confirm-bulk`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async updateFact(workspaceId: string, factId: string, body: UpdateFactRequestDto) {
    return this.request<ConfirmedFactDto>(`/api/workspaces/${workspaceId}/facts/${factId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async deleteFact(workspaceId: string, factId: string) {
    return this.request<{ success: boolean }>(`/api/workspaces/${workspaceId}/facts/${factId}`, {
      method: 'DELETE',
    });
  }

  // Questionnaire & Missing Items APIs
  async getQuestionnaire(workspaceId: string) {
    return this.request<{
      answers: QuestionnaireAnswersDto;
      readiness: ReadinessDetailsDto;
    }>(`/api/workspaces/${workspaceId}/questionnaire`, {
      method: 'GET',
    });
  }

  async saveQuestionnaire(workspaceId: string, body: QuestionnaireAnswersDto) {
    return this.request<{
      answers: QuestionnaireAnswersDto;
      readiness: ReadinessDetailsDto;
    }>(`/api/workspaces/${workspaceId}/questionnaire`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async resolveTask(workspaceId: string, taskId: string) {
    return this.request<{ success: boolean }>(
      `/api/workspaces/${workspaceId}/tasks/${taskId}/resolve`,
      {
        method: 'POST',
      }
    );
  }

  // Calculation APIs
  async calculateTax(workspaceId: string) {
    return this.request<TaxCalculationResultDto>(`/api/workspaces/${workspaceId}/calculate`, {
      method: 'POST',
    });
  }

  async getCalculation(workspaceId: string) {
    return this.request<TaxCalculationResultDto | null>(`/api/workspaces/${workspaceId}/calculation`, {
      method: 'GET',
    });
  }

  /** Three assessment modes on the same facts; never persists a comparison run. */
  async compareScenarios(workspaceId: string) {
    return this.request<ScenarioComparisonDto>(
      `/api/workspaces/${workspaceId}/scenario-comparison`,
      {
        method: 'GET',
      }
    );
  }

  // Filing Package, Approvals, and Assessment APIs
  async approveReturn(workspaceId: string) {
    return this.request<ReturnVersionDto>(`/api/workspaces/${workspaceId}/approve`, {
      method: 'POST',
    });
  }

  async generateFilingPackage(workspaceId: string) {
    return this.request<FilingPackageDto>(`/api/workspaces/${workspaceId}/filing-package`, {
      method: 'POST',
    });
  }

  async importAssessment(workspaceId: string, body: any) {
    return this.request<AssessmentDto>(`/api/workspaces/${workspaceId}/assessment`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async rolloverToNextYear(workspaceId: string) {
    return this.request<{ nextWorkspaceId: string; nextTaxYear: number }>(
      `/api/workspaces/${workspaceId}/rollover`,
      {
        method: 'POST',
      }
    );
  }

  async getReturnVersion(workspaceId: string) {
    return this.request<ReturnVersionDto | null>(`/api/workspaces/${workspaceId}/return-version`, {
      method: 'GET',
    });
  }

  /** Every return version plus superseded approvals and their invalidation reason. */
  async getReturnVersionHistory(workspaceId: string) {
    return this.request<ReturnVersionHistoryDto>(
      `/api/workspaces/${workspaceId}/return-versions`,
      {
        method: 'GET',
      }
    );
  }

  async getFilingPackage(workspaceId: string) {
    return this.request<FilingPackageDto | null>(`/api/workspaces/${workspaceId}/filing-package`, {
      method: 'GET',
    });
  }

  async getAssessment(workspaceId: string) {
    return this.request<AssessmentDto | null>(`/api/workspaces/${workspaceId}/assessment`, {
      method: 'GET',
    });
  }

  /**
   * Records the actual submission. The API freezes the matching return version
   * in the same transaction, so the filed snapshot cannot be edited afterwards.
   */
  async recordFiling(workspaceId: string, body: CreateFilingRecordDto) {
    return this.request<FilingRecordDto>(`/api/workspaces/${workspaceId}/filing-record`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /** The workspace's filing record, or `null` while it has not been filed. */
  async getFilingRecord(workspaceId: string) {
    return this.request<FilingRecordDto | null>(`/api/workspaces/${workspaceId}/filing-record`, {
      method: 'GET',
    });
  }

  /** Corrects the objection/follow-up dates of an imported assessment. */
  async updateAssessmentFollowUp(
    workspaceId: string,
    assessmentId: string,
    body: UpdateAssessmentFollowUpDto,
  ) {
    return this.request<AssessmentDto>(
      `/api/workspaces/${workspaceId}/assessment/${assessmentId}/follow-up`,
      {
        method: 'PATCH',
        body: JSON.stringify(body),
      }
    );
  }

  // Audit APIs
  async getAuditActivity(householdId: string, filter: AuditFilterDto = {}) {
    const params = new URLSearchParams();
    if (filter.workspaceId) params.append('workspaceId', filter.workspaceId);
    if (filter.eventType) params.append('eventType', filter.eventType);
    if (filter.limit) params.append('limit', String(filter.limit));
    if (filter.offset) params.append('offset', String(filter.offset));

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<readonly AuditEventDto[]>(
      `/api/households/${householdId}/activity${query}`,
      {
        method: 'GET',
      }
    );
  }

  // Notification APIs
  async getNotifications(workspaceId: string, unreadOnly = false) {
    return this.request<NotificationListDto>(
      `/api/workspaces/${workspaceId}/notifications?unreadOnly=${unreadOnly}`,
      {
        method: 'GET',
      }
    );
  }

  async getNotificationUnreadCount(workspaceId: string) {
    return this.request<{ unreadCount: number }>(
      `/api/workspaces/${workspaceId}/notifications/unread-count`,
      {
        method: 'GET',
      }
    );
  }

  /** Marks one notification read; the API answers `{ success: boolean }`. */
  async markNotificationRead(workspaceId: string, notificationId: string) {
    return this.request<{ success: boolean }>(
      `/api/workspaces/${workspaceId}/notifications/${notificationId}/read`,
      {
        method: 'PATCH',
      }
    );
  }

  async markAllNotificationsRead(workspaceId: string) {
    return this.request<{ updated: number }>(
      `/api/workspaces/${workspaceId}/notifications/read-all`,
      {
        method: 'POST',
      }
    );
  }

  async getNotificationPreferences(workspaceId: string) {
    return this.request<NotificationPreferenceDto>(
      `/api/workspaces/${workspaceId}/notifications/preferences`,
      {
        method: 'GET',
      }
    );
  }

  async updateNotificationPreferences(
    workspaceId: string,
    body: UpdateNotificationPreferencesDto,
  ) {
    return this.request<NotificationPreferenceDto>(
      `/api/workspaces/${workspaceId}/notifications/preferences`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      }
    );
  }

  // Admin APIs (Platform & AI Governance)
  async getAdminOverview() {
    return this.request<AdminOverviewDto>('/api/admin/overview', {
      method: 'GET',
    });
  }

  async getAdminTaxRules() {
    return this.request<readonly TaxRulePackageDto[]>('/api/admin/tax-rules', {
      method: 'GET',
    });
  }

  async getAdminDeadlines() {
    return this.request<readonly TaxDeadlineDto[]>('/api/admin/deadlines', {
      method: 'GET',
    });
  }

  async getAdminForms() {
    return this.request<readonly FormMappingDto[]>('/api/admin/forms', {
      method: 'GET',
    });
  }

  async getAdminModels() {
    return this.request<readonly ModelDefinitionDto[]>('/api/admin/models', {
      method: 'GET',
    });
  }

  async createAdminModel(body: CreateModelDto) {
    return this.request<ModelDefinitionDto>('/api/admin/models', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async updateAdminModel(id: string, body: UpdateModelDto) {
    return this.request<ModelDefinitionDto>(`/api/admin/models/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async deleteAdminModel(id: string) {
    return this.request<{ success: boolean; message: string }>(`/api/admin/models/${id}`, {
      method: 'DELETE',
    });
  }

  async testAdminModel(body: TestModelConnectionDto) {
    return this.request<TestModelConnectionResultDto>('/api/admin/models/test', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getAdminModelRoutes() {
    return this.request<readonly ModelRouteDto[]>('/api/admin/model-routes', {
      method: 'GET',
    });
  }

  async updateAdminModelRoute(routeId: string, body: UpdateModelRouteDto) {
    return this.request<ModelRouteDto>(`/api/admin/model-routes/${routeId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async getAdminEvaluations() {
    return this.request<readonly EvaluationRunDto[]>('/api/admin/evaluations', {
      method: 'GET',
    });
  }

  async getAdminAudit(filter: { limit?: number; offset?: number } = {}) {
    const params = new URLSearchParams();
    if (filter.limit) params.append('limit', String(filter.limit));
    if (filter.offset) params.append('offset', String(filter.offset));
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<readonly AuditEventDto[]>(`/api/admin/audit${query}`, {
      method: 'GET',
    });
  }
}

