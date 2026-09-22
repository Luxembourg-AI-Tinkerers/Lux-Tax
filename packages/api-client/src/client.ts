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
  UpdateFactRequestDto,
  QuestionnaireAnswersDto,
  ReadinessDetailsDto,
  TaxCalculationResultDto,
  ReturnVersionDto,
  FilingPackageDto,
  AssessmentDto,
  TaxRulePackageDto,
  FormMappingDto,
  ModelDefinitionDto,
  ModelRouteDto,
  EvaluationRunDto,
  AdminOverviewDto,
  TaxDeadlineDto,
} from '@luxtax/contracts';

export interface ApiClientConfig {
  readonly baseUrl: string;
  readonly getAccessToken?: () => string | null | Promise<string | null>;
  readonly onUnauthorized?: () => void;
}

export class LuxTaxApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken?: () => string | null | Promise<string | null>;
  private readonly onUnauthorized?: () => void;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.getAccessToken = config.getAccessToken;
    this.onUnauthorized = config.onUnauthorized;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ data?: T; error?: string; status: number }> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.getAccessToken) {
      const token = await this.getAccessToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    try {
      const res = await fetch(url, {
        ...options,
        headers,
      });

      if (res.status === 401 && this.onUnauthorized) {
        this.onUnauthorized();
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

  async deleteDocument(workspaceId: string, documentId: string) {
    return this.request<{ success: boolean }>(
      `/api/workspaces/${workspaceId}/documents/${documentId}`,
      {
        method: 'DELETE',
      }
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

  async getAdminModelRoutes() {
    return this.request<readonly ModelRouteDto[]>('/api/admin/model-routes', {
      method: 'GET',
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

