export type LoginPeriod = "today" | "7d" | "30d" | "year" | "all";

export type ParsedUserAgent = {
  browser: string;
  device: string;
  os: string;
  status: "SUCCESS" | "RECOVERED";
};

export function getPeriodStart(period: LoginPeriod, now = new Date()): Date | null {
  const start = new Date(now);

  if (period === "today") {
    start.setHours(0, 0, 0, 0);
    return start;
  }

  if (period === "7d") {
    start.setDate(start.getDate() - 7);
    return start;
  }

  if (period === "30d") {
    start.setDate(start.getDate() - 30);
    return start;
  }

  if (period === "year") {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  return null;
}

export function parseUserAgent(userAgent?: string | null): ParsedUserAgent {
  if (!userAgent || userAgent === "unknown") {
    return {
      browser: "Unknown",
      device: "Unknown",
      os: "Unknown",
      status: "SUCCESS",
    };
  }

  if (userAgent === "RECOVERED_FROM_USER_LASTLOGIN") {
    return {
      browser: "Recovered",
      device: "Recovered",
      os: "Recovered",
      status: "RECOVERED",
    };
  }

  const agent = userAgent.toLowerCase();

  const browser =
    agent.includes("edg/")
      ? "Edge"
      : agent.includes("chrome/")
        ? "Chrome"
        : agent.includes("safari/") && !agent.includes("chrome/")
          ? "Safari"
          : agent.includes("firefox/")
            ? "Firefox"
            : agent.includes("opr/") || agent.includes("opera")
              ? "Opera"
              : "Other";

  const os =
    agent.includes("windows")
      ? "Windows"
      : agent.includes("android")
        ? "Android"
        : agent.includes("iphone") || agent.includes("ipad") || agent.includes("ios")
          ? "iOS"
          : agent.includes("mac os") || agent.includes("macintosh")
            ? "macOS"
            : agent.includes("linux")
              ? "Linux"
              : "Unknown";

  const device =
    agent.includes("mobile")
      ? "Mobile"
      : agent.includes("tablet") || agent.includes("ipad")
        ? "Tablet"
        : "Desktop";

  return {
    browser,
    device,
    os,
    status: "SUCCESS",
  };
}

export function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text.includes(",") || text.includes("\n") || text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
