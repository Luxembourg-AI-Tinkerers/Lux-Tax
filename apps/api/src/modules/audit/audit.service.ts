import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditEventType, AuditFilterDto, AuditEventDto } from '@luxtax/contracts';

export interface CreateAuditLogParams {
  readonly householdId?: string;
  readonly workspaceId?: string;
  readonly actorId: string;
  readonly actorEmail?: string;
  readonly eventType: AuditEventType;
  readonly entityType: string;
  readonly entityId: string;
  readonly previousValue?: Record<string, unknown>;
  readonly newValue?: Record<string, unknown>;
  readonly description: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async logEvent(params: CreateAuditLogParams): Promise<AuditEventDto> {
    return this.log(params);
  }

  async log(params: CreateAuditLogParams): Promise<AuditEventDto> {
    const event = await this.prisma.auditEvent.create({
      data: {
        householdId: params.householdId,
        workspaceId: params.workspaceId,
        actorId: params.actorId,
        actorEmail: params.actorEmail,
        eventType: params.eventType,
        entityType: params.entityType,
        entityId: params.entityId,
        previousValue: params.previousValue ? (params.previousValue as any) : undefined,
        newValue: params.newValue ? (params.newValue as any) : undefined,
        description: params.description,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });

    return {
      id: event.id,
      householdId: event.householdId || undefined,
      workspaceId: event.workspaceId || undefined,
      actorId: event.actorId,
      actorEmail: event.actorEmail || undefined,
      eventType: event.eventType as AuditEventType,
      entityType: event.entityType,
      entityId: event.entityId,
      previousValue: (event.previousValue as Record<string, unknown>) || undefined,
      newValue: (event.newValue as Record<string, unknown>) || undefined,
      description: event.description,
      ipAddress: event.ipAddress || undefined,
      userAgent: event.userAgent || undefined,
      createdAt: event.createdAt.toISOString(),
    };
  }

  async getHouseholdActivity(
    householdId: string,
    filter: AuditFilterDto = {}
  ): Promise<readonly AuditEventDto[]> {
    const limit = Math.min(filter.limit || 50, 100);
    const offset = filter.offset || 0;

    const events = await this.prisma.auditEvent.findMany({
      where: {
        householdId,
        ...(filter.workspaceId ? { workspaceId: filter.workspaceId } : {}),
        ...(filter.eventType ? { eventType: filter.eventType } : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
    });

    return events.map((e) => ({
      id: e.id,
      householdId: e.householdId || undefined,
      workspaceId: e.workspaceId || undefined,
      actorId: e.actorId,
      actorEmail: e.actorEmail || undefined,
      eventType: e.eventType as AuditEventType,
      entityType: e.entityType,
      entityId: e.entityId,
      previousValue: (e.previousValue as Record<string, unknown>) || undefined,
      newValue: (e.newValue as Record<string, unknown>) || undefined,
      description: e.description,
      ipAddress: e.ipAddress || undefined,
      userAgent: e.userAgent || undefined,
      createdAt: e.createdAt.toISOString(),
    }));
  }
}
