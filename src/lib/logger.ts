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
  try {
    const { ipAddress, userAgent } = extractRequestMeta(req);

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

    // If there are repeated login failures, generate a security alert
    if (action === "LOGIN_FAILED") {
      try {
        // Use rate limiter to track failed attempts per IP for a 15 minute window
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
  } catch (error) {
    console.error("Failed to log security event:", error);
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
