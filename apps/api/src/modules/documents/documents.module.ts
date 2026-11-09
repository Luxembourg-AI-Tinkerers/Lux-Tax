import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { AuditModule } from '../audit/audit.module';
import { AdminModule } from '../admin/admin.module';
import { ReceiptAiVisionService } from './receipt-ai-vision.service';
import { ReturnApprovalsModule } from '../filing/return-approvals.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuditModule, AdminModule, ReturnApprovalsModule, NotificationsModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, ReceiptAiVisionService],
  exports: [DocumentsService, ReceiptAiVisionService],
})
export class DocumentsModule {}

