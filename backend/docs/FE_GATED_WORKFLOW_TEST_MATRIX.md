# FE Gated Workflow Test Matrix

## Unit-Level (service/logic)

- `tokenService.issueAssignmentTokenPair` returns ON_SITE ACTIVE + RESOLUTION LOCKED.
- `tokenService.activateResolutionTokenAfterOnSiteProof` only updates LOCKED, unexpired rows.
- `tokenService.markTokenUsed` fails for already used/revoked/expired tokens.

## Integration/API

- `POST /tickets/:id/assign`:
  - creates assignment
  - returns `onSiteToken` and `resolutionToken`
  - sends one consolidated FE assignment email
- `POST /fe/proof` with RESOLUTION token in LOCKED returns `409 RESOLUTION_TOKEN_LOCKED`.
- `POST /fe/proof` with ON_SITE token marks ON_SITE and activates RESOLUTION token.
- `POST /fe/proof` with ACTIVE RESOLUTION token allows SUCCESS/FAILED outcomes.
- reject flow revokes non-terminal tokens.

## End-to-End Workflow Scenarios

1. Happy path:
   - assign -> on-site proof -> resolution proof SUCCESS -> pending verification.
2. Blocked resolution path:
   - assign -> immediate resolution proof attempt -> locked error.
3. Failure path:
   - assign -> on-site proof -> resolution proof FAILED with reason -> `FE_ATTEMPT_FAILED`.
4. Reassignment:
   - assign FE-A -> reassign FE-B -> FE-A tokens invalid.
5. Expiry:
   - expired token returns `TOKEN_EXPIRED`.

## Scripted Verification

- Use `scripts/test-fe-gated-workflow-curl.sh` for smoke validation against dev/staging.
