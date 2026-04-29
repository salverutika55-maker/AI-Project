import { prisma } from "./prisma";

export async function logSecurityEvent(
  userId: string | null,
  action: string,
  entityId?: string,
  details?: string,
  req?: Request
) {
  try {
    const ipAddress = req?.headers.get("x-forwarded-for") || "unknown";
    const userAgent = req?.headers.get("user-agent") || "unknown";

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
