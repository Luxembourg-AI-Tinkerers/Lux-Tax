import { Module } from '@nestjs/common';
import { CalculationsService } from './calculations.service';
import { CalculationsController } from './calculations.controller';
import { AuditModule } from '../audit/audit.module';
import { ReturnApprovalsModule } from '../filing/return-approvals.module';

@Module({
  imports: [AuditModule, ReturnApprovalsModule],
  controllers: [CalculationsController],
  providers: [CalculationsService],
  exports: [CalculationsService],
})
export class CalculationsModule {}
