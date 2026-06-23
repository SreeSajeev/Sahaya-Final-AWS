# FE Gated Resolution Token Rollout

## Feature Flag

- Backend flag: `FE_GATED_RESOLUTION_TOKEN=true`
- Frontend optional safety flag: `VITE_ALLOW_CLIENT_TOKEN_CREATION=false`

## Safe Rollout Steps

1. Apply DB migration `20260320180000_add_fe_token_lifecycle_and_assignment_notification.sql`.
2. Deploy backend with `FE_GATED_RESOLUTION_TOKEN=false`.
3. Deploy frontend with `VITE_ALLOW_CLIENT_TOKEN_CREATION=false`.
4. Validate in staging with `FE_GATED_RESOLUTION_TOKEN=true`.
5. Enable in production for pilot organisation.
6. Monitor JSON log events:
   - `assignment_tokens_issued`
   - `assignment_email_sent`
   - `assignment_email_failed`
   - `resolution_token_activated`
   - `resolution_token_used`
7. Roll out globally after 24-48h stable metrics.

## Rollback

- Set `FE_GATED_RESOLUTION_TOKEN=false`.
- Keep migration applied (additive and backward-compatible).
