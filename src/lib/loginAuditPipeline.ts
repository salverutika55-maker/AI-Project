import { prisma } from "@/lib/prisma";
import { extractRequestMeta, logSecurityEvent } from "@/lib/logger";

type LoginAuditInput = {
  userId: string;
  email: string;
  userRole?: string | null;
  req?: { headers?: any };
};

function summarizeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

export async function recordSuccessfulLoginAudit(input: LoginAuditInput) {
  const { userId, email, userRole, req } = input;
  const { ipAddress, userAgent } = extractRequestMeta(req);
  const loginTime = new Date();

  const [lastLoginUpdate, loginHistoryWrite, securityAuditWrite, userActivityWrite, sessionAuditWrite] =
    await Promise.allSettled([
      prisma.user.update({
        where: { id: userId },
        data: { lastLogin: loginTime },
      }),
      prisma.userLoginActivity.create({
        data: {
          userId,
          email,
          userRole: userRole ?? null,
          loginTime,
          ipAddress,
          userAgent,
        },
      }),
      logSecurityEvent(userId, "LOGIN_SUCCESS", undefined, `User ${email} logged in successfully`, req),
      prisma.auditLog.create({
        data: {
          userId,
          action: "USER_ACTIVITY_LOGIN",
          details: `User activity recorded for login by ${email}`,
          ipAddress,
          userAgent,
        },
      }),
      prisma.auditLog.create({
        data: {
          userId,
          action: "SESSION_ESTABLISHED",
          details: `Session established for ${email}`,
          ipAddress,
          userAgent,
        },
      }),
    ]);

  const failures: string[] = [];

  if (lastLoginUpdate.status === "rejected") {
    failures.push(`lastLogin update failed: ${summarizeError(lastLoginUpdate.reason)}`);
  }
  if (loginHistoryWrite.status === "rejected") {
    failures.push(`login history write failed: ${summarizeError(loginHistoryWrite.reason)}`);
  }
  if (securityAuditWrite.status === "rejected") {
    failures.push(`security audit write failed: ${summarizeError(securityAuditWrite.reason)}`);
  }
  if (userActivityWrite.status === "rejected") {
    failures.push(`user activity audit write failed: ${summarizeError(userActivityWrite.reason)}`);
  }
  if (sessionAuditWrite.status === "rejected") {
    failures.push(`session audit write failed: ${summarizeError(sessionAuditWrite.reason)}`);
  }

  if (failures.length > 0) {
    try {
      await prisma.securityAlert.create({
        data: {
          userId,
          action: "LOGIN_AUDIT_PIPELINE_FAILURE",
          severity: "CRITICAL",
          ipAddress,
          userAgent,
          details: failures.join(" | "),
        },
      });
    } catch (alertError) {
      // Final fallback only for observability when DB writes partially fail.
      console.error("Failed to write LOGIN_AUDIT_PIPELINE_FAILURE alert", alertError);
    }
  }

  return {
    loginActivity: loginHistoryWrite.status === "fulfilled" ? loginHistoryWrite.value : null,
    failures,
  };
}
