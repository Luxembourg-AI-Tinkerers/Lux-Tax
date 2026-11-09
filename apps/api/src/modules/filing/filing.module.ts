import { Module } from '@nestjs/common';
import { FilingService } from './filing.service';
import { FilingController } from './filing.controller';
import { AnnexPdfService } from './annex-pdf.service';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReturnApprovalsModule } from './return-approvals.module';

@Module({
  imports: [AuditModule, NotificationsModule, ReturnApprovalsModule],
  controllers: [FilingController],
  providers: [FilingService, AnnexPdfService],
  exports: [FilingService],
})
export class FilingModule {}
