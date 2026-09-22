import { HouseholdRole, MembershipStatus } from './enums';
import { UserDto } from './auth';

export interface HouseholdMemberDto {
  readonly id: string;
  readonly userId: string;
  readonly householdId: string;
  readonly role: HouseholdRole;
  readonly status: MembershipStatus;
  readonly joinedAt?: string;
  readonly user?: UserDto;
}

export interface HouseholdInvitationDto {
  readonly id: string;
  readonly householdId: string;
  readonly invitedEmail: string;
  readonly invitedRole: HouseholdRole;
  readonly invitedByUserId: string;
  readonly expiresAt: string;
  readonly acceptedAt?: string;
  readonly isExpired: boolean;
}

export interface HouseholdDto {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly createdById: string;
  readonly createdAt: string;
  readonly members?: readonly HouseholdMemberDto[];
  readonly invitations?: readonly HouseholdInvitationDto[];
}

export interface CreateHouseholdDto {
  readonly name: string;
}

export interface InviteMemberDto {
  readonly email: string;
  readonly role: HouseholdRole;
}

export interface AcceptInvitationDto {
  readonly token: string;
}

export interface InvitationDetailsDto {
  readonly id: string;
  readonly householdName: string;
  readonly invitedEmail: string;
  readonly invitedRole: HouseholdRole;
  readonly inviterName: string;
  readonly expiresAt: string;
  readonly isValid: boolean;
}
