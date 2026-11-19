# Data retention, erasure and export

**Last updated:** 2026-11-19. The endpoints below match `apps/api/src/modules/users/users.controller.ts`.

The policy behind the M10 finding. It is written down because it is a product decision, not something
a patch can settle by itself.

## What a user can do, and how

| Right | Endpoint | What happens |
|---|---|---|
| See where they are signed in | `GET /api/users/me/sessions` | Last 50 sessions with creation time, expiry, IP, user agent and whether still active |
| Obtain a copy of their data | `GET /api/users/me/export` | One JSON document: profile, memberships, workspaces, the facts they own, their document metadata, filing records, audit events where they are the actor, sessions |
| Erase their account | `DELETE /api/users/me` | Identity anonymised, credential destroyed, sessions and push registrations deleted, memberships removed, households they were alone in renamed |

Both export and erasure are themselves audit events (`USER_DATA_EXPORTED`, `USER_ACCOUNT_ERASED`),
so the exercise of a right is visible in the same trail as everything else.

## What erasure does not do — and why

**It does not delete the household, its workspaces, or the audit trail.**

`audit_events` carries a trigger that rejects `UPDATE` and `DELETE` unless the session holds the
`luxtax_audit_purge` role *and* has explicitly opted in (`SET LOCAL luxtax.allow_audit_purge = 'on'`).
A cascade — deleting a household, which would null `audit_events.householdId` — is an `UPDATE`, so the
database refuses it. That is deliberate: the trail is the evidence that a return was filed, approved
and by whom.

The consequence is a policy, not an accident:

- **The financial record is retained.** Deleting a filed return because its author left would destroy
  the record of a tax filing, which has its own legal retention period.
- **The identity is not.** The user row keeps its primary key (the audit trail points at it) but
  loses its address, its password hash, its verification state, its TOTP seed and its recovery codes;
  the profile's names are cleared; the address becomes `deleted-<uuid>@deleted.invalid`.
- **The household name is personal data**, so a household the user was alone in is renamed to
  `Deleted household`. Its workspace data stays, anonymous, because the trail behind it must stay
  verifiable.
- **A shared household blocks erasure.** If the user is the last `PRIMARY_FILER` and other active
  members remain, `DELETE /api/users/me` answers **409**: erasing them would leave a co-filer with a
  household they cannot administer and a return they cannot approve. That is an ownership transfer,
  which the product does not implement yet.

## Retention of derived data

| Data | Retention | Where |
|---|---|---|
| Raw text a model read from a document (`DocumentExtraction.extractedText`, `rawJson`) | Cleared as soon as every fact of that document is confirmed | `facts.service.ts`, on confirmation |
| Sessions | Deleted when expired, as the next session is issued | `auth.service.ts` |
| Sessions of an erased account | Deleted immediately | `users.service.ts` |
| Audit events | Kept for the accountability window; a deletion requires the `luxtax_audit_purge` role and an explicit per-transaction opt-in | `20261110100000_audit_purge_role` |
| Confirmed facts, documents, filed returns | Kept with the workspace, per tax-record retention | — |

## Open, and honestly so

- **Ownership transfer** for a shared household is not implemented; the 409 is the guard that makes
  its absence safe rather than destructive.
- **A self-service retention window** (delete audit rows older than N years automatically) is not
  scheduled. The mechanism exists; choosing N is a compliance decision, and automating a guess would
  be worse than leaving it manual.
- **The mobile clients** do not yet surface the export or the session list. The API supports both.
