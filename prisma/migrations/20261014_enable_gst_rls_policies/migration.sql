-- ====================================================================
-- MIGRATION: 20261014_enable_gst_rls_policies
-- PURPOSE: Enable Supabase Row Level Security (RLS) on all 7 GST tables
--          and enforce multi-tenant authorization policies.
-- ====================================================================

-- 1. Helper Functions for Tenant Authorization

-- Resolves the current user's ID in public."User" based on session setting or auth JWT/UID
CREATE OR REPLACE FUNCTION public.get_current_user_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.current_user_id', true), ''),
    (
      SELECT u.id
      FROM public."User" u
      WHERE (
        (auth.uid() IS NOT NULL AND (u.id = auth.uid()::text OR u.email = auth.email()))
        OR (auth.email() IS NOT NULL AND u.email = auth.email())
        OR ((auth.jwt() ->> 'sub') IS NOT NULL AND (u.id = (auth.jwt() ->> 'sub') OR u.email = (auth.jwt() ->> 'email')))
      )
      LIMIT 1
    )
  );
$$;

-- Checks if the resolved user is a global platform admin
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."User" u
    WHERE u.id = public.get_current_user_id()
      AND u.role = 'ADMIN'
  );
$$;

-- Checks if the user is an approved member of target_org_id with at least min_role
CREATE OR REPLACE FUNCTION public.has_org_access(target_org_id text, min_role text DEFAULT 'READ_ONLY')
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id text;
  v_user_role text;
  v_user_rank int;
  v_required_rank int;
BEGIN
  -- 1. Platform ADMIN bypasses org checks
  IF public.is_platform_admin() THEN
    RETURN TRUE;
  END IF;

  v_user_id := public.get_current_user_id();
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 2. Query approved membership
  SELECT m.role::text INTO v_user_role
  FROM public."OrganizationMembership" m
  WHERE m."organizationId" = target_org_id
    AND m."userId" = v_user_id
    AND m.status = 'APPROVED'
  LIMIT 1;

  IF v_user_role IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 3. Role hierarchy (lower number = higher privilege)
  v_user_rank := CASE v_user_role
    WHEN 'SUPER_ADMIN' THEN 1
    WHEN 'ORG_ADMIN' THEN 2
    WHEN 'FINANCE_MANAGER' THEN 3
    WHEN 'ACCOUNTANT' THEN 4
    WHEN 'STAFF' THEN 5
    WHEN 'READ_ONLY' THEN 6
    ELSE 99
  END;

  v_required_rank := CASE min_role
    WHEN 'SUPER_ADMIN' THEN 1
    WHEN 'ORG_ADMIN' THEN 2
    WHEN 'FINANCE_MANAGER' THEN 3
    WHEN 'ACCOUNTANT' THEN 4
    WHEN 'STAFF' THEN 5
    WHEN 'READ_ONLY' THEN 6
    ELSE 6
  END;

  RETURN v_user_rank <= v_required_rank;
END;
$$;

-- Verifies that target_client_id belongs to target_org_id and user is authorized
CREATE OR REPLACE FUNCTION public.has_client_access(target_client_id text, target_org_id text, min_role text DEFAULT 'READ_ONLY')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."Client" c
    WHERE c.id = target_client_id
      AND c."organizationId" = target_org_id
      AND public.has_org_access(target_org_id, min_role)
  );
$$;

-- Verifies that target_conn_id belongs to target_client_id and target_org_id and user is authorized
CREATE OR REPLACE FUNCTION public.has_gst_connection_access(target_conn_id text, target_client_id text, target_org_id text, min_role text DEFAULT 'READ_ONLY')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."GSTConnection" conn
    WHERE conn.id = target_conn_id
      AND conn."clientId" = target_client_id
      AND conn."organizationId" = target_org_id
      AND public.has_client_access(target_client_id, target_org_id, min_role)
  );
$$;

-- ====================================================================
-- 2. ENABLE ROW LEVEL SECURITY ON ALL 7 GST TABLES
-- ====================================================================

ALTER TABLE public."GSTConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GSTSyncRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GSTR1Record" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GSTR2BRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GSTR3BRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GSTReturnStatus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GSTAuditLog" ENABLE ROW LEVEL SECURITY;

-- ====================================================================
-- 3. DROP ANY EXISTING POLICIES (IDEMPOTENT RERUNS)
-- ====================================================================

DROP POLICY IF EXISTS "gst_connection_select" ON public."GSTConnection";
DROP POLICY IF EXISTS "gst_connection_insert" ON public."GSTConnection";
DROP POLICY IF EXISTS "gst_connection_update" ON public."GSTConnection";
DROP POLICY IF EXISTS "gst_connection_delete" ON public."GSTConnection";

DROP POLICY IF EXISTS "gst_sync_run_select" ON public."GSTSyncRun";
DROP POLICY IF EXISTS "gst_sync_run_insert" ON public."GSTSyncRun";
DROP POLICY IF EXISTS "gst_sync_run_update" ON public."GSTSyncRun";
DROP POLICY IF EXISTS "gst_sync_run_delete" ON public."GSTSyncRun";

DROP POLICY IF EXISTS "gstr1_record_select" ON public."GSTR1Record";
DROP POLICY IF EXISTS "gstr1_record_insert" ON public."GSTR1Record";
DROP POLICY IF EXISTS "gstr1_record_update" ON public."GSTR1Record";
DROP POLICY IF EXISTS "gstr1_record_delete" ON public."GSTR1Record";

DROP POLICY IF EXISTS "gstr2b_record_select" ON public."GSTR2BRecord";
DROP POLICY IF EXISTS "gstr2b_record_insert" ON public."GSTR2BRecord";
DROP POLICY IF EXISTS "gstr2b_record_update" ON public."GSTR2BRecord";
DROP POLICY IF EXISTS "gstr2b_record_delete" ON public."GSTR2BRecord";

DROP POLICY IF EXISTS "gstr3b_record_select" ON public."GSTR3BRecord";
DROP POLICY IF EXISTS "gstr3b_record_insert" ON public."GSTR3BRecord";
DROP POLICY IF EXISTS "gstr3b_record_update" ON public."GSTR3BRecord";
DROP POLICY IF EXISTS "gstr3b_record_delete" ON public."GSTR3BRecord";

DROP POLICY IF EXISTS "gst_return_status_select" ON public."GSTReturnStatus";
DROP POLICY IF EXISTS "gst_return_status_insert" ON public."GSTReturnStatus";
DROP POLICY IF EXISTS "gst_return_status_update" ON public."GSTReturnStatus";
DROP POLICY IF EXISTS "gst_return_status_delete" ON public."GSTReturnStatus";

DROP POLICY IF EXISTS "gst_audit_log_select" ON public."GSTAuditLog";
DROP POLICY IF EXISTS "gst_audit_log_insert" ON public."GSTAuditLog";
DROP POLICY IF EXISTS "gst_audit_log_update" ON public."GSTAuditLog";
DROP POLICY IF EXISTS "gst_audit_log_delete" ON public."GSTAuditLog";

-- ====================================================================
-- 4. POLICIES: GSTConnection
-- ====================================================================

CREATE POLICY "gst_connection_select"
  ON public."GSTConnection"
  FOR SELECT
  TO authenticated, anon
  USING (public.has_client_access("clientId", "organizationId", 'READ_ONLY'));

CREATE POLICY "gst_connection_insert"
  ON public."GSTConnection"
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (public.has_client_access("clientId", "organizationId", 'FINANCE_MANAGER'));

CREATE POLICY "gst_connection_update"
  ON public."GSTConnection"
  FOR UPDATE
  TO authenticated, anon
  USING (public.has_client_access("clientId", "organizationId", 'FINANCE_MANAGER'))
  WITH CHECK (public.has_client_access("clientId", "organizationId", 'FINANCE_MANAGER'));

CREATE POLICY "gst_connection_delete"
  ON public."GSTConnection"
  FOR DELETE
  TO authenticated, anon
  USING (public.has_client_access("clientId", "organizationId", 'FINANCE_MANAGER'));

-- ====================================================================
-- 5. POLICIES: GSTSyncRun
-- ====================================================================

CREATE POLICY "gst_sync_run_select"
  ON public."GSTSyncRun"
  FOR SELECT
  TO authenticated, anon
  USING (public.has_gst_connection_access("gstConnectionId", "clientId", "organizationId", 'READ_ONLY'));

CREATE POLICY "gst_sync_run_insert"
  ON public."GSTSyncRun"
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (public.has_gst_connection_access("gstConnectionId", "clientId", "organizationId", 'FINANCE_MANAGER'));

CREATE POLICY "gst_sync_run_update"
  ON public."GSTSyncRun"
  FOR UPDATE
  TO authenticated, anon
  USING (public.has_gst_connection_access("gstConnectionId", "clientId", "organizationId", 'FINANCE_MANAGER'))
  WITH CHECK (public.has_gst_connection_access("gstConnectionId", "clientId", "organizationId", 'FINANCE_MANAGER'));

CREATE POLICY "gst_sync_run_delete"
  ON public."GSTSyncRun"
  FOR DELETE
  TO authenticated, anon
  USING (public.has_gst_connection_access("gstConnectionId", "clientId", "organizationId", 'ORG_ADMIN'));

-- ====================================================================
-- 6. POLICIES: GSTR1Record
-- ====================================================================

CREATE POLICY "gstr1_record_select"
  ON public."GSTR1Record"
  FOR SELECT
  TO authenticated, anon
  USING (public.has_gst_connection_access("gstConnectionId", "clientId", "organizationId", 'READ_ONLY'));

CREATE POLICY "gstr1_record_insert"
  ON public."GSTR1Record"
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (public.has_gst_connection_access("gstConnectionId", "clientId", "organizationId", 'FINANCE_MANAGER'));

CREATE POLICY "gstr1_record_update"
  ON public."GSTR1Record"
  FOR UPDATE
  TO authenticated, anon
  USING (public.has_gst_connection_access("gstConnectionId", "clientId", "organizationId", 'FINANCE_MANAGER'))
  WITH CHECK (public.has_gst_connection_access("gstConnectionId", "clientId", "organizationId", 'FINANCE_MANAGER'));

CREATE POLICY "gstr1_record_delete"
  ON public."GSTR1Record"
  FOR DELETE
  TO authenticated, anon
  USING (public.has_gst_connection_access("gstConnectionId", "clientId", "organizationId", 'ORG_ADMIN'));

-- ====================================================================
-- 7. POLICIES: GSTR2BRecord
-- ====================================================================

CREATE POLICY "gstr2b_record_select"
  ON public."GSTR2BRecord"
  FOR SELECT
  TO authenticated, anon
  USING (public.has_gst_connection_access("gstConnectionId", "clientId", "organizationId", 'READ_ONLY'));

CREATE POLICY "gstr2b_record_insert"
  ON public."GSTR2BRecord"
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (public.has_gst_connection_access("gstConnectionId", "clientId", "organizationId", 'FINANCE_MANAGER'));

CREATE POLICY "gstr2b_record_update"
  ON public."GSTR2BRecord"
  FOR UPDATE
  TO authenticated, anon
  USING (public.has_gst_connection_access("gstConnectionId", "clientId", "organizationId", 'FINANCE_MANAGER'))
  WITH CHECK (public.has_gst_connection_access("gstConnectionId", "clientId", "organizationId", 'FINANCE_MANAGER'));

CREATE POLICY "gstr2b_record_delete"
  ON public."GSTR2BRecord"
  FOR DELETE
  TO authenticated, anon
  USING (public.has_gst_connection_access("gstConnectionId", "clientId", "organizationId", 'ORG_ADMIN'));

-- ====================================================================
-- 8. POLICIES: GSTR3BRecord
-- ====================================================================

CREATE POLICY "gstr3b_record_select"
  ON public."GSTR3BRecord"
  FOR SELECT
  TO authenticated, anon
  USING (public.has_gst_connection_access("gstConnectionId", "clientId", "organizationId", 'READ_ONLY'));

CREATE POLICY "gstr3b_record_insert"
  ON public."GSTR3BRecord"
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (public.has_gst_connection_access("gstConnectionId", "clientId", "organizationId", 'FINANCE_MANAGER'));

CREATE POLICY "gstr3b_record_update"
  ON public."GSTR3BRecord"
  FOR UPDATE
  TO authenticated, anon
  USING (public.has_gst_connection_access("gstConnectionId", "clientId", "organizationId", 'FINANCE_MANAGER'))
  WITH CHECK (public.has_gst_connection_access("gstConnectionId", "clientId", "organizationId", 'FINANCE_MANAGER'));

CREATE POLICY "gstr3b_record_delete"
  ON public."GSTR3BRecord"
  FOR DELETE
  TO authenticated, anon
  USING (public.has_gst_connection_access("gstConnectionId", "clientId", "organizationId", 'ORG_ADMIN'));

-- ====================================================================
-- 9. POLICIES: GSTReturnStatus
-- ====================================================================

CREATE POLICY "gst_return_status_select"
  ON public."GSTReturnStatus"
  FOR SELECT
  TO authenticated, anon
  USING (public.has_gst_connection_access("gstConnectionId", "clientId", "organizationId", 'READ_ONLY'));

CREATE POLICY "gst_return_status_insert"
  ON public."GSTReturnStatus"
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (public.has_gst_connection_access("gstConnectionId", "clientId", "organizationId", 'FINANCE_MANAGER'));

CREATE POLICY "gst_return_status_update"
  ON public."GSTReturnStatus"
  FOR UPDATE
  TO authenticated, anon
  USING (public.has_gst_connection_access("gstConnectionId", "clientId", "organizationId", 'FINANCE_MANAGER'))
  WITH CHECK (public.has_gst_connection_access("gstConnectionId", "clientId", "organizationId", 'FINANCE_MANAGER'));

CREATE POLICY "gst_return_status_delete"
  ON public."GSTReturnStatus"
  FOR DELETE
  TO authenticated, anon
  USING (public.has_gst_connection_access("gstConnectionId", "clientId", "organizationId", 'ORG_ADMIN'));

-- ====================================================================
-- 10. POLICIES: GSTAuditLog (Immutable: no UPDATE or DELETE policies)
-- ====================================================================

CREATE POLICY "gst_audit_log_select"
  ON public."GSTAuditLog"
  FOR SELECT
  TO authenticated, anon
  USING (public.has_client_access("clientId", "organizationId", 'FINANCE_MANAGER'));

CREATE POLICY "gst_audit_log_insert"
  ON public."GSTAuditLog"
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (public.has_client_access("clientId", "organizationId", 'READ_ONLY'));

-- Note: No UPDATE or DELETE policies on GSTAuditLog. Default is DENY for non-superusers.
