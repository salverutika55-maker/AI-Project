# Missing Login Data User-wise Report

Generated at: 2026-06-22
Window analyzed: 2026-06-12 to current date

## Summary

- Users with last_login in window: 1
- Users with LOGIN_SUCCESS audit in window: 1
- Users with login_history entries in window: 1
- Users recoverable from fallback sources: 1

## User Matrix

| User | Last Login | Audit Record Exists | Recoverable | Recovery Source |
|---|---|---|---|---|
| salverutika55@gmail.com | 2026-06-21T08:33:09.466Z | Yes | Yes | users.lastLogin |
| supriya@ssatc.in | 2026-06-09T14:01:41.158Z | No | Yes | users.lastLogin |
| ssa.navimumbai@gmail.com | 2026-06-09T13:13:34.089Z | No | Yes | users.lastLogin |
| NIKAMPRASHANT10@GMAIL.COM | 2026-06-04T09:21:01.673Z | No | Yes | users.lastLogin |
| supriyabarge22@gmail.com | 2026-05-08T12:21:17.131Z | No | Yes | users.lastLogin |
| rutikavsalve@gmail.com | 2026-05-08T09:38:39.937Z | No | Yes | users.lastLogin |
| rutika09salve@gmail.com | 2026-05-04T10:09:05.834Z | No | Yes | users.lastLogin |
| vikasinsai@gmail.com | 2026-04-26T04:34:00.443Z | No | Yes | users.lastLogin |
| M@yz.com | 2026-04-25T08:32:15.879Z | No | Yes | users.lastLogin |
| apurvashahgemini@gmail.com | 2026-04-24T08:42:42.506Z | No | Yes | users.lastLogin |
| vibhavarivsalve@gmail.com | 2026-04-23T14:43:03.901Z | No | Yes | users.lastLogin |

## Conclusion

For the explicit 9-day window starting 2026-06-12, only one user shows login activity and that user already has both audit and login-history records. Older users are outside this 9-day window and are recoverable only at coarse granularity via users.lastLogin unless external auth/session/server logs are available.
