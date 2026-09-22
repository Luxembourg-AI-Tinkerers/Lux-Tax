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
}
