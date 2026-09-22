import { Module } from '@nestjs/common';
import { FilingService } from './filing.service';
import { FilingController } from './filing.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [FilingController],
  providers: [FilingService],
  exports: [FilingService],
})
export class FilingModule {}
