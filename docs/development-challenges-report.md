# Unified Development Report

Date: 2026-06-26
Project: AI-Project
Coverage: Full development journey from repository start to current state

## Purpose

This is the single master report that consolidates:
- Development challenges across the whole app lifecycle
- Login history incident diagnosis and recovery
- Root causes, fixes, and prevention actions in one place

## Executive Summary

The central challenge throughout development was balancing three things at once:
1. Accounting correctness
2. High-volume sync reliability
3. Audit and security-grade observability

Most regressions came from tight coupling between Tally ingestion, mapping logic, and Balance Sheet/P&L calculations. Stability improved only after introducing canonical trace/reconciliation logic, hardened audit pipelines, and incremental sync patterns.

## Phase-Wise Challenge Timeline

### Phase 1: Data Ingestion Foundation
- Tally XML tag variations caused dropped or misread vouchers.
- Opening and closing balance extraction was inconsistent.
- Day Book and Trial Balance payload assumptions frequently broke.

### Phase 2: Scale and Reliability
- Sync operations hit Vercel 500/504 limits.
- DB contention and connection pool pressure caused intermittent failures.
- Sequential processing was too slow for larger datasets.

### Phase 3: Accounting Correctness
- Debit/credit polarity, contra entries, and absolute-value misuse distorted P&L.
- Balance Sheet opening derivation and month continuity repeatedly regressed.
- Out-of-balance alerts appeared due to logic and precision edge cases.

### Phase 4: Mapping and Identity Stability
- Mapping save/automap flows had silent failures and mismatch bugs.
- Case sensitivity and template leakage caused incorrect categorization.
- Duplicate client identity and navigation mismatches affected usability.

### Phase 5: Auditability, Security, and Operations
- Historical login records were under-captured.
- Security observability for partial audit failures was weak initially.
- Packaging and Windows distribution issues slowed connector rollout.
- Cache/deployment behavior sometimes masked fresh backend data.

## Consolidated Challenge Register (Impact, Root Cause, Fix, Prevention)

### 1) Tally XML extraction inconsistencies
Impact:
- Missing or partial transaction records polluted downstream reporting.
Root cause:
- Multiple XML schema variants and parser assumptions that were too narrow.
Fix implemented:
- Exhaustive parser hardening for tag and wrapper variants.
- Extraction logic updates for raw voucher reliability.
Prevention:
- Maintain fixture-based parser regression tests across XML variants.

### 2) Sync timeout failures at scale
Impact:
- 500/504 sync failures and incomplete client ingestion.
Root cause:
- Large unchunked operations and sequential execution under hosting limits.
Fix implemented:
- Chunked uploads, parallelized query paths, bulk write optimization.
Prevention:
- Load-test large clients and enforce sync performance budgets.

### 3) DB contention and pool exhaustion
Impact:
- Intermittent ingest failures and unstable latency.
Root cause:
- High-concurrency upserts and connection pressure patterns.
Fix implemented:
- Batched/chunked writes and deadlock-prone path fixes.
Prevention:
- Monitor lock waits, pool saturation, and keep bounded parallelism.

### 4) P&L sign/net-movement logic regressions
Impact:
- Wrong profitability and account values.
Root cause:
- Misapplied absolute values and polarity/netting logic.
Fix implemented:
- Corrected net movement and debit/credit handling.
Prevention:
- Formula test suite using canonical accounting scenarios.

### 5) Opening/closing derivation instability
Impact:
- Month continuity breaks and confusing openings in UI.
Root cause:
- Mixed derivation strategies and inconsistent period boundaries.
Fix implemented:
- Standardized roll-forward behavior and pre-FY handling.
Prevention:
- Versioned derivation contract and month-transition reconciliation checks.

### 6) Balance Sheet engine drift
Impact:
- Different views/endpoints could disagree.
Root cause:
- Multiple engine variants and non-canonical consumers.
Fix implemented:
- Unified trace/reconciliation path with diagnostic audit mode.
Prevention:
- Enforce single engine contract for all BS consumers.

### 7) Mapping persistence and automap failures
Impact:
- Unmapped/wrongly mapped ledgers and user confusion.
Root cause:
- API field mismatches, case sensitivity, and weak edge handling.
Fix implemented:
- Save API corrections, dedupe hardening, placeholder cleanup.
Prevention:
- API schema validation and mapping integrity regression tests.

### 8) Duplicate identity and navigation mismatches
Impact:
- Duplicate client cards/tabs and incorrect context risk.
Root cause:
- Inconsistent identity normalization and uniqueness rules.
Fix implemented:
- Normalized-name plus client-code dedupe with canonical record preference.
Prevention:
- Shared identity utility and uniqueness invariants across modules.

### 9) Historical login under-capture
Impact:
- Incomplete audit trail and limited forensic confidence.
Root cause:
- Detailed login-success events were not reliably persisted historically.
Fix implemented:
- Login register, recovery scripts, and hardened multi-stream audit pipeline.
Prevention:
- Mandatory branch-by-branch write verification with critical alerts.

### 10) Security observability gaps
Impact:
- Partial audit failures could be missed.
Root cause:
- No dedicated critical-path alert surface initially.
Fix implemented:
- SecurityAlert model and admin alert/diagnostics workflows.
Prevention:
- Failure-injection testing for logging and security event paths.

### 11) Connector packaging and Windows distribution fragility
Impact:
- Extraction/runtime failures and delayed fixes.
Root cause:
- Frequent packaging strategy shifts and OS compatibility constraints.
Fix implemented:
- Stable portable runtime packaging, zip compatibility and reset tooling.
Prevention:
- Release checklist on clean Windows machines, including Defender checks.

### 12) UI/dashboard regressions during fast iteration
Impact:
- Runtime crashes and layout defects reduced trust.
Root cause:
- Rapid UI churn with missing imports/state/schema inconsistencies.
Fix implemented:
- Repeated stabilization passes for syntax/layout/interaction issues.
Prevention:
- Smoke tests and visual regression checks on critical dashboards.

### 13) Cache/deployment stale-data effects
Impact:
- Backend updates not visible immediately to users.
Root cause:
- Combined SSR/browser cache and stale assets.
Fix implemented:
- no-store behavior for sensitive data paths and better cache busting.
Prevention:
- Endpoint-level cache policy matrix and stale-data validation checks.

### 14) Build and release reliability under hotfix pressure
Impact:
- Broken releases and emergency rebuild cycles.
Root cause:
- Inconsistent artifact paths and weak release gates.
Fix implemented:
- Build/bundle flow corrections and release verification improvements.
Prevention:
- CI gates for build/lint/smoke checks and deterministic release scripts.

### 15) Progressive compliance hardening (RLS and secrets)
Impact:
- Security posture improved later than feature velocity.
Root cause:
- Controls introduced incrementally across moving architecture parts.
Fix implemented:
- RLS hardening, secret handling cleanup, encryption key checks.
Prevention:
- Security posture review as release prerequisite.

## Dedicated Login Incident Consolidation

### Incident
Historical login history appeared missing for earlier periods.

### Key Evidence
- AuditLog rows in analyzed window existed, but LOGIN_SUCCESS rows were sparse.
- UserLoginActivity historical depth was initially limited.
- Session tables were absent by design due to JWT session strategy.
- Relevant tables used Prisma model naming (AuditLog, UserLoginActivity, User, SecurityAlert).

### Recovery Actions
Scripts executed:
1. scripts/recover-login-history.mjs --from-last-login
2. scripts/recover-login-history-from-audit-activity.mjs

Results:
- UserLoginActivity expanded from 1 to 13 in first recovery pass.
- Further expanded to 33 after audit-activity day inference.
- Recovery sources included LOGIN_SUCCESS, users.lastLogin fallback, and authenticated activity inference.

### Root Cause Conclusion
Primary issue was historical under-capture of detailed login events, not frontend rendering failure.

### Permanent Fix
Hardened login audit pipeline now writes all of the following per successful login:
1. UserLoginActivity login record
2. AuditLog LOGIN_SUCCESS
3. AuditLog USER_ACTIVITY_LOGIN
4. AuditLog SESSION_ESTABLISHED

If any branch fails, a critical SecurityAlert with LOGIN_AUDIT_PIPELINE_FAILURE is raised.

### Current State
- New login capture path is hardened and observable.
- Historical records are reconstructed to the maximum practical level from available in-database evidence.

## Evidence Base Used For This Unified Report

- Full git history (507 commits)
- Challenge and diagnostic scripts/output patterns in repository
- Login diagnostics and recovery reports
- Balance Sheet diagnostic report

## Final Conclusion

This project faced recurring cross-cutting challenges where ingestion quality, accounting formulas, and operational reliability affected each other. The long-term stabilization came from:
1. Canonical financial trace/reconciliation design
2. Scalable incremental sync and ingestion hardening
3. Audit-grade logging, recovery, and security alerting

With these controls in place, the app moved from iterative fixes to a more verifiable and maintainable operating model.
