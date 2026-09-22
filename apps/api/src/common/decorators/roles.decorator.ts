import { SetMetadata } from '@nestjs/common';
import { HouseholdRole } from '@luxtax/contracts';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: HouseholdRole[]) => SetMetadata(ROLES_KEY, roles);
