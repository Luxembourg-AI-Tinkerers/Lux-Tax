import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuditEventType,
  AuditFilterDto,
  AuditEventDto,
  DocumentVisibility,
} from '@luxtax/contracts';
import * as crypto from 'node:crypto';
import { hashAuditEvent } from './audit-chain';
import { redactAuditEventForViewer } from './audit-redaction';

export interface CreateAuditLogParams {
  readonly householdId?: string;
  readonly workspaceId?: string;
  /**
   * Absent only when no account matches the identity being recorded — a
   * rejected login for an unknown address. Everything else names its actor.
   */
  readonly actorId?: string;
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

export interface ActivityViewerOptions {
  /**
   * PRIMARY_FILER / CO_FILER read the full feed; every other member (VIEWER)
   * gets actor e-mail, IP, user agent and private-draft names withheld.
   * Defaults to false: a caller that forgets to say fails closed.
   */
  readonly includePrivateDetails?: boolean;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async logEvent(params: CreateAuditLogParams): Promise<AuditEventDto> {
    return this.log(params);
  }

  async log(params: CreateAuditLogParams): Promise<AuditEventDto> {
    // API-10: chain this event to the previous one for the same household, so a
    // deleted or rewritten row breaks verification.
    //
    // Read-tip → compute → insert used to run unguarded, so two events in the
    // same household at the same moment both chained from the same predecessor
    // and the chain forked — permanently, because the trigger forbids repair. The
    // insert now runs inside a transaction holding a per-household advisory lock,
    // which serialises writers on that chain and costs nothing across households.
    const id = crypto.randomUUID();
    const createdAt = new Date();

    const buildHash = (prevHash: string | null) =>
      hashAuditEvent(prevHash, {
        id,
        householdId: params.householdId ?? null,
        workspaceId: params.workspaceId ?? null,
        actorId: params.actorId ?? null,
        eventType: params.eventType,
        entityType: params.entityType,
        entityId: params.entityId,
        description: params.description,
        createdAt: createdAt.toISOString(),
        previousValue: params.previousValue ?? null,
        newValue: params.newValue ?? null,
      });

    const data = (prevHash: string | null, hash: string) => ({
      id,
      createdAt,
      prevHash,
      hash,
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
    });

    // Events outside a household (login, registration) carry no chain, so they
    // need no lock.
    if (!params.householdId) {
      const hash = buildHash(null);
      const unchained = await this.prisma.auditEvent.create({ data: data(null, hash) });
      return {
        id: unchained.id,
        householdId: unchained.householdId || undefined,
        workspaceId: unchained.workspaceId || undefined,
        actorId: unchained.actorId || undefined,
        actorEmail: unchained.actorEmail || undefined,
        eventType: unchained.eventType as AuditEventType,
        entityType: unchained.entityType,
        entityId: unchained.entityId,
        description: unchained.description,
        previousValue: (unchained.previousValue ?? undefined) as Record<string, unknown> | undefined,
        newValue: (unchained.newValue ?? undefined) as Record<string, unknown> | undefined,
        ipAddress: unchained.ipAddress || undefined,
        userAgent: unchained.userAgent || undefined,
        createdAt: unchained.createdAt.toISOString(),
      };
    }

    const event = await this.prisma.$transaction(async (tx) => {
      // Advisory lock scoped to this household for the rest of the transaction.
      await tx.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        params.householdId,
      );

      const previous = await tx.auditEvent.findFirst({
        where: { householdId: params.householdId, hash: { not: null } },
        // Ties inside one millisecond are broken by id, so the tip is stable.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { hash: true },
      });

      const prevHash = previous?.hash ?? null;
      const hash = buildHash(prevHash);
      return tx.auditEvent.create({ data: data(prevHash, hash) });
    });

    return {
      id: event.id,
      householdId: event.householdId || undefined,
      workspaceId: event.workspaceId || undefined,
      actorId: event.actorId || undefined,
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
    filter: AuditFilterDto = {},
    viewer: ActivityViewerOptions = {},
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

    const activity = events.map((e) => ({
      id: e.id,
      householdId: e.householdId || undefined,
      workspaceId: e.workspaceId || undefined,
      actorId: e.actorId || undefined,
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

    if (viewer.includePrivateDetails) {
      return activity;
    }

    // One lookup for the documents named by this page of events. A document
    // that is missing (deleted) or still a private draft keeps its name to
    // itself; every other state is already readable through GET /documents.
    const documentIds = [
      ...new Set(
        activity
          .filter((event) => event.entityType === 'Document')
          .map((event) => event.entityId),
      ),
    ];
    const documents = documentIds.length
      ? await this.prisma.document.findMany({
          where: { id: { in: documentIds } },
          select: { id: true, visibility: true },
        })
      : [];
    const nameVisible = new Set(
      documents
        .filter((doc) => doc.visibility !== DocumentVisibility.PRIVATE_DRAFT)
        .map((doc) => doc.id),
    );

    return activity.map((event) =>
      redactAuditEventForViewer(event, (documentId) =>
        nameVisible.has(documentId),
      ),
    );
  }
}
