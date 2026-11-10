import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationOutboxService } from './notification-outbox.service';
import { NotificationRemindersService } from './notification-reminders.service';
import { NotificationDevicesService } from './notification-devices.service';
import { EmailAdapter } from './adapters/email.adapter';
import { PushAdapter } from './adapters/push.adapter';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationOutboxService,
    NotificationRemindersService,
    NotificationDevicesService,
    EmailAdapter,
    PushAdapter,
  ],
  exports: [NotificationsService, NotificationOutboxService, NotificationDevicesService],
})
export class NotificationsModule {}
