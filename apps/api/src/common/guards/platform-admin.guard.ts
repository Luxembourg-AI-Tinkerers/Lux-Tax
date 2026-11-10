import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { isPlatformAdminEmail, parseAdminEmails } from '../auth/platform-admin';

/**
 * Interim platform-administrator gate.
 *
 * The target model (plan §5.1) is nine platform roles with time-bound,
 * reason-coded grants; no platform role exists in the schema yet. Until it
 * does, `/api/admin/**` is limited to the operator-managed `ADMIN_EMAILS`
 * allowlist. This is an allowlist gate, not the full RBAC: it grants no
 * document access and a household role never implies platform administration.
 *
 * Fails closed: when `ADMIN_EMAILS` is unset or empty, nobody is an admin.
 * Must run after `JwtAuthGuard`, which populates `request.user`.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const email = request?.user?.email;
    const verified = request?.user?.isEmailVerified === true;
    const allowlist = parseAdminEmails(process.env.ADMIN_EMAILS);

    // The allowlist matches on an e-mail address, so it is only as strong as the
    // proof that the account controls that address. Without this check, whoever
    // registers an allowlisted address first becomes the platform administrator
    // — no mailbox required.
    if (!verified) {
      throw new ForbiddenException(
        'Platform administrator access requires a verified e-mail address',
      );
    }

    if (typeof email !== 'string' || !isPlatformAdminEmail(email, allowlist)) {
      throw new ForbiddenException('Platform administrator access required');
    }
    return true;
  }
}
