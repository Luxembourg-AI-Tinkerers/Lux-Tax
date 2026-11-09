import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { HouseholdsModule } from './modules/households/households.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { AuditModule } from './modules/audit/audit.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { FactsModule } from './modules/facts/facts.module';
import { QuestionnaireModule } from './modules/questionnaire/questionnaire.module';
import { CalculationsModule } from './modules/calculations/calculations.module';
import { FilingModule } from './modules/filing/filing.module';
import { AdminModule } from './modules/admin/admin.module';
import { FreelanceModule } from './modules/freelance/freelance.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    HouseholdsModule,
    WorkspacesModule,
    DocumentsModule,
    FactsModule,
    QuestionnaireModule,
    CalculationsModule,
    FilingModule,
    AdminModule,
    FreelanceModule,
    NotificationsModule,
  ],
  providers: [
    // API-8: global rate limiting. The guard is inert unless RATE_LIMIT_ENABLED=true,
    // so enabling it is an operational decision rather than a deploy.
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
