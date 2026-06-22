# Historical Login Recovery Execution Report

Date: 2026-06-22

## Recovery Objective

Recover historical login data from all available in-database sources.

## Sources Used

1. Explicit login audit events (AuditLog action LOGIN_SUCCESS)
2. User profile fallback (User.lastLogin)
3. Authenticated audit activity timeline (first AuditLog event per user per day)

## Scripts Executed

1. scripts/recover-login-history.mjs --from-last-login
2. scripts/recover-login-history-from-audit-activity.mjs

## Execution Results

### First recovery pass

- Before: 1
- After: 13
- Inserted from LOGIN_SUCCESS: 1
- Inserted from users.lastLogin: 11

### Second recovery pass (audit activity day inference)

- Candidate audit user-days: 22
- Inserted: 20
- Skipped: 2 (already had login entries on those days)
- Final total in UserLoginActivity: 33

## Interpretation

- Historical login coverage has been materially expanded.
- Newly recovered entries are inferred from authenticated activity and should be treated as reconstructed audit records.
- This is the maximum recoverable set from currently available database sources.

## Data Quality Labels

Recovered entries can be distinguished by userAgent markers:

- RECOVERED_FROM_USER_LASTLOGIN (coarse fallback)
- Original non-browser/derived markers from audit-based reconstruction

## Next Validation Points

1. Open Admin Dashboard > User Login Register and confirm increased historical rows.
2. Filter by All Time and verify timeline now includes additional dates from Apr-Jun.
3. Export CSV and archive for audit documentation.
