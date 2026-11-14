import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { AuditModule } from '../audit/audit.module';
import { AdminModule } from '../admin/admin.module';
import { AdminService } from '../admin/admin.service';
import { ReceiptAiVisionService } from './receipt-ai-vision.service';
import { TesseractCliOcrEngine } from './ocr/ocr-engine';
import { ReturnApprovalsModule } from '../filing/return-approvals.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuditModule, AdminModule, ReturnApprovalsModule, NotificationsModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    {
      // A factory rather than a class provider: the service takes an
      // `OcrEngine` (a port, no runtime token), and the adapter is chosen
      // here — one place to swap in a different engine later.
      provide: ReceiptAiVisionService,
      useFactory: (adminService: AdminService) =>
        new ReceiptAiVisionService(adminService, new TesseractCliOcrEngine()),
      inject: [AdminService],
    },
  ],
  exports: [DocumentsService, ReceiptAiVisionService],
})
export class DocumentsModule {}

