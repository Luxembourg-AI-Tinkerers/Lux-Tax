import { Module } from '@nestjs/common';
import { FreelanceController } from './freelance.controller';
import { FreelanceService } from './freelance.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [FreelanceController],
  providers: [FreelanceService],
  exports: [FreelanceService],
})
export class FreelanceModule {}
