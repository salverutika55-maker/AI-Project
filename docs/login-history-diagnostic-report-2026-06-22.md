# Login History Diagnostic Report

Generated at: 2026-06-22T03:48:31.202Z

## Scope

This report investigates missing login history across:

- User table
- Audit log table
- Security events/alerts table
- Activity log table
- Session table
- Authentication provider integrations

## Validation Summary

- Total users in database: 11
- Total login records in UserLoginActivity: 13
- Missing records estimate during last 9 days: 0 (after recovery)
- Last successful login event: 2026-06-21T08:33:11.320Z
- Last audit event: 2026-06-21T08:33:11.320Z
- Last user activity (User.lastLogin): 2026-06-21T08:33:09.466Z

## Table-Level Findings

### User table equivalent (Prisma model: User)

- Table found: "User"
- Columns include: id, email, password, role, lastLogin, createdAt
- lastLogin values exist historically from 2026-04-23 onward

### Audit log table equivalent (Prisma model: AuditLog)

- Table found: "AuditLog"
- Total rows: 202
- Time range: 2026-04-29 to 2026-06-21
- LOGIN_SUCCESS rows: 1

### Security events table equivalent

- Requested table name security_events not found
- Security table in this schema is "SecurityAlert"
- Total rows in SecurityAlert: 0

### Activity log table equivalent

- Requested table name user_activity_logs not found
- Login activity table in this schema is "UserLoginActivity"
- Total rows after recovery: 13
- Time range: 2026-04-23 to 2026-06-21

### Session table

- Requested table name sessions not found
- NextAuth session strategy is JWT in code (no DB session table expected)

## Authentication Provider Log Investigation

Codebase authentication integrations found:

- NextAuth: present and active
- Clerk: not integrated
- Supabase Auth: not integrated
- Custom auth logs: not found as a separate persistent system

Result:

- Only NextAuth credential login flow is active for user sign-in tracking
- No external provider log store exists in this workspace for historical recovery

## Missing 9-Day Window Analysis

Window analyzed:

- Start: 2026-06-13T03:48:31.202Z
- End: 2026-06-22T03:48:31.202Z

Findings:

- Users active during window (by User.lastLogin): 1
- Login events present during window (UserLoginActivity): 3

## Recovery Actions Performed

Script executed:

- scripts/recover-login-history.mjs --from-last-login

Recovery output:

- UserLoginActivity before: 1
- UserLoginActivity after: 13
- Inserted from AuditLog LOGIN_SUCCESS: 1
- Inserted from User.lastLogin fallback markers: 11

Recovered fallback rows are tagged by userAgent marker:

- RECOVERED_FROM_USER_LASTLOGIN

## Root Cause Assessment

A. Data exists but UI is not showing it: Partially true (existing UI was limited to recent 20 rows and not a full register)

B. Data was never captured: True for most historical login events (only 1 LOGIN_SUCCESS audit event existed)

C. Logging service failed: No direct evidence of write-failure alerts; SecurityAlert table is empty

D. Deployment bug: Likely contributor (login history recording to dedicated register appears recently introduced)

E. Database migration issue: No evidence of legacy table mismatch; schema uses Prisma model table names only

## Final Diagnostic Conclusion

- Historical login history was not comprehensively captured for earlier days.
- Recoverable history from authoritative sources was limited.
- Recovery successfully reconstructed baseline historical entries using User.lastLogin as fallback and AuditLog LOGIN_SUCCESS where available.
- A dedicated lifetime login register system has now been implemented with filtering, analytics, and export.
