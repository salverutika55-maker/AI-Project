import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LoginPeriod, csvEscape, getPeriodStart, parseUserAgent } from "@/lib/loginRegister";

const VALID_PERIODS: LoginPeriod[] = ["today", "7d", "30d", "year", "all"];

function parsePeriod(input: string | null): LoginPeriod {
  if (!input) return "all";
  return VALID_PERIODS.includes(input as LoginPeriod) ? (input as LoginPeriod) : "all";
}

function parsePositiveInt(input: string | null, fallback: number, max: number) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string } | undefined)?.role !== "ADMIN") {
    return new NextResponse(JSON.stringify({ message: "Unauthorized" }), { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const period = parsePeriod(searchParams.get("period"));
  const search = (searchParams.get("search") || "").trim();
  const userId = searchParams.get("userId") || undefined;
  const page = parsePositiveInt(searchParams.get("page"), 1, 100000);
  const pageSize = parsePositiveInt(searchParams.get("pageSize"), 50, 500);
  const format = (searchParams.get("format") || "json").toLowerCase();

  const periodStart = getPeriodStart(period);

  const where: Prisma.UserLoginActivityWhereInput = {
    ...(periodStart ? { loginTime: { gte: periodStart } } : {}),
    ...(search
      ? {
          email: {
            contains: search,
            mode: "insensitive",
          },
        }
      : {}),
    ...(userId ? { userId } : {}),
  };

  if (format === "csv") {
    const exportRows = await prisma.userLoginActivity.findMany({
      where,
      orderBy: { loginTime: "desc" },
      take: 10000,
    });

    const csvHeader = [
      "Login Time",
      "User Email",
      "Role",
      "IP Address",
      "Browser",
      "Device",
      "Status",
      "User Agent",
    ].join(",");

    const csvRows = exportRows.map((row) => {
      const parsed = parseUserAgent(row.userAgent);
      return [
        csvEscape(row.loginTime.toISOString()),
        csvEscape(row.email),
        csvEscape(row.userRole || "USER"),
        csvEscape(row.ipAddress || "-"),
        csvEscape(parsed.browser),
        csvEscape(`${parsed.device}${parsed.os !== "Unknown" ? ` (${parsed.os})` : ""}`),
        csvEscape(parsed.status),
        csvEscape(row.userAgent || "-"),
      ].join(",");
    });

    const csvBody = `${csvHeader}\n${csvRows.join("\n")}`;
    return new NextResponse(csvBody, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=login-register-${period}.csv`,
        "Cache-Control": "no-store",
      },
    });
  }

  const [total, records, todayCount, last7Count, last30Count, thisYearCount, allTimeCount] = await Promise.all([
    prisma.userLoginActivity.count({ where }),
    prisma.userLoginActivity.findMany({
      where,
      orderBy: { loginTime: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.userLoginActivity.count({ where: { loginTime: { gte: getPeriodStart("today")! } } }),
    prisma.userLoginActivity.count({ where: { loginTime: { gte: getPeriodStart("7d")! } } }),
    prisma.userLoginActivity.count({ where: { loginTime: { gte: getPeriodStart("30d")! } } }),
    prisma.userLoginActivity.count({ where: { loginTime: { gte: getPeriodStart("year")! } } }),
    prisma.userLoginActivity.count(),
  ]);

  const payload = records.map((row) => {
    const parsed = parseUserAgent(row.userAgent);
    return {
      id: row.id,
      userId: row.userId,
      loginTime: row.loginTime.toISOString(),
      email: row.email,
      role: row.userRole || "USER",
      ipAddress: row.ipAddress || "-",
      browser: parsed.browser,
      device: `${parsed.device}${parsed.os !== "Unknown" ? ` (${parsed.os})` : ""}`,
      status: parsed.status,
      userAgent: row.userAgent || "-",
    };
  });

  return NextResponse.json(
    {
      filters: {
        period,
        search,
        userId: userId || null,
        page,
        pageSize,
      },
      summary: {
        today: todayCount,
        last7Days: last7Count,
        last30Days: last30Count,
        thisYear: thisYearCount,
        allTime: allTimeCount,
      },
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      records: payload,
      fetchedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
