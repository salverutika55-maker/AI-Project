import { prisma } from "./prisma";

export function extractRequestMeta(req?: { headers?: any }) {
  const headersObj = req?.headers ?? {};
  const ipAddress = typeof headersObj.get === "function"
    ? headersObj.get("x-forwarded-for") ?? "unknown"
    : headersObj["x-forwarded-for"] ?? headersObj["X-Forwarded-For"] ?? "unknown";
  const userAgent = typeof headersObj.get === "function"
    ? headersObj.get("user-agent") ?? "unknown"
    : headersObj["user-agent"] ?? headersObj["User-Agent"] ?? "unknown";

  return { ipAddress, userAgent };
}

export async function logSecurityEvent(
  userId: string | null,
  action: string,
  entityId?: string,
  details?: string,
  req?: { headers?: any }
) {
  const { ipAddress, userAgent } = extractRequestMeta(req);

  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entityId,
        details,
        ipAddress,
        userAgent,
      },
    });
  } catch (error) {
    // If audit logging fails, create a SecurityAlert entry and surface the error
    console.error("Failed to write AuditLog record:", error);
    try {
      await prisma.securityAlert.create({
        data: {
          userId,
          action: "AUDIT_LOG_WRITE_FAILURE",
          severity: "CRITICAL",
          ipAddress,
          userAgent,
          details: `Failed to write audit log for action=${action}: ${String(error)}`,
        },
      });
    } catch (innerErr) {
      // Last-resort: log to console so it appears in deployment logs
      console.error("Failed to write SecurityAlert after audit write failure:", innerErr);
    }
  }

  // If there are repeated login failures, generate a security alert (separate path)
  if (action === "LOGIN_FAILED") {
    try {
      const key = `FAIL_LOGIN:${ipAddress}`;
      const rate = await checkRateLimit(key, 5, 15 * 60 * 1000);
      if (!rate.success) {
        await prisma.securityAlert.create({
          data: {
            userId,
            action: "BRUTE_FORCE_LOGIN",
            severity: "HIGH",
            ipAddress,
            userAgent,
            details: details ?? `Exceeded failed login attempts from ${ipAddress}`,
          },
        });
      }
    } catch (alertErr) {
      console.error("Failed to create security alert:", alertErr);
    }
  }
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ success: boolean; remaining: number }> {
  const now = new Date();
  
  try {
    const rateLimit = await prisma.rateLimit.findUnique({
      where: { key }
    });

    if (!rateLimit || now > rateLimit.resetAt) {
      // Create new window
      await prisma.rateLimit.upsert({
        where: { key },
        update: {
          count: 1,
          resetAt: new Date(now.getTime() + windowMs)
        },
        create: {
          key,
          count: 1,
          resetAt: new Date(now.getTime() + windowMs)
        }
      });
      return { success: true, remaining: limit - 1 };
    }

    if (rateLimit.count >= limit) {
      return { success: false, remaining: 0 };
    }

    // Increment count
    await prisma.rateLimit.update({
      where: { key },
      data: { count: { increment: 1 } }
    });

    return { success: true, remaining: limit - rateLimit.count - 1 };
  } catch (error) {
    console.error("Rate limiting error:", error);
    return { success: true, remaining: 1 }; // Default to allow on DB error
  }
}
