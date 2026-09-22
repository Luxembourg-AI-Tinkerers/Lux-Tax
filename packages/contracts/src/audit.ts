import { AuditEventType } from './enums';

export interface AuditEventDto {
  readonly id: string;
  readonly householdId?: string;
  readonly workspaceId?: string;
  readonly actorId: string;
  readonly actorEmail?: string;
  readonly actorName?: string;
  readonly eventType: AuditEventType;
  readonly entityType: string;
  readonly entityId: string;
  readonly previousValue?: Record<string, unknown>;
  readonly newValue?: Record<string, unknown>;
  readonly description: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly createdAt: string;
}

export interface AuditFilterDto {
  readonly householdId?: string;
  readonly workspaceId?: string;
  readonly eventType?: AuditEventType;
  readonly limit?: number;
  readonly offset?: number;
}
