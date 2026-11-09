import { NotificationSeverity, NotificationType } from './enums';

export interface NotificationDto {
  id: string;
  householdId: string;
  workspaceId?: string | null;
  userId: string;
  actorId?: string | null;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body: string;
  entityType?: string | null;
  entityId?: string | null;
  actionUrl?: string | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationListDto {
  items: NotificationDto[];
  /** Unread count for the whole workspace/user pair, not only the returned page. */
  unreadCount: number;
}

export interface NotificationPreferenceDto {
  id?: string;
  userId: string;
  householdId: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  mutedTypes: NotificationType[];
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateNotificationPreferencesDto {
  emailEnabled?: boolean;
  pushEnabled?: boolean;
  mutedTypes?: NotificationType[];
}
