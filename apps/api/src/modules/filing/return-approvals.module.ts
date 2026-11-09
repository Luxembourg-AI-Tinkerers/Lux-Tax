import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReturnApprovalsService } from './return-approvals.service';

/**
 * Shared approval invalidation. It depends only on Prisma and audit, so every
 * module that mutates return-relevant data can import it without a cycle.
 */
@Module({
  imports: [PrismaModule, AuditModule, NotificationsModule],
  providers: [ReturnApprovalsService],
  exports: [ReturnApprovalsService],
})
export class ReturnApprovalsModule {}
