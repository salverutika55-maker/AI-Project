export interface FinancialMonthOption {
  periodKey: string; // e.g. "2026-03"
  monthName: string; // e.g. "Mar"
  monthNumber: number; // 1..12
  calendarYear: number; // e.g. 2026
  label: string; // e.g. "Mar 2026"
  monthIndex: number; // 0..11 in FY sequence
}

export interface CanonicalFinancialPeriod {
  financialYear: string; // e.g. "2025-26" or "2025"
  fyStartYear: number; // e.g. 2025
  fyEndYear: number; // e.g. 2026 for APR_MAR
  fyStartMonth: number; // 1..12 (4 for APR_MAR, 1 for JAN_DEC)
  isJanDec: boolean;
  monthIndexInFy: number; // 0..11
  monthNumber: number; // 1..12
  monthName: string; // "Apr", "May", ... "Mar"
  calendarYear: number; // e.g. 2026
  periodKey: string; // "2026-03"
  label: string; // "Mar 2026"
  periodStart: string; // "2026-03-01"
  periodEnd: string; // "2026-03-31"
  periodStartUtc: Date;
  periodEndUtc: Date; // Start of next month (exclusive UTC)
  daysInPeriod: number;

  previousMonth: {
    monthNumber: number;
    monthName: string;
    calendarYear: number;
    periodKey: string;
    label: string;
    periodStart: string;
    periodEnd: string;
    periodStartUtc: Date;
    periodEndUtc: Date;
    daysInPeriod: number;
  };

  cumulativePeriod: {
    periodStart: string; // "2025-04-01"
    periodEnd: string; // "2026-03-31"
    periodStartUtc: Date;
    periodEndUtc: Date;
    label: string;
    monthsCount: number;
    isFullYear: boolean;
    daysInPeriod: number;
  };

  comparablePriorCumulativePeriod: {
    periodStart: string; // "2024-04-01"
    periodEnd: string; // "2025-03-31"
    periodStartUtc: Date;
    periodEndUtc: Date;
    label: string;
    daysInPeriod: number;
  };

  priorYearSameMonth: {
    periodKey: string;
    label: string;
    periodStart: string;
    periodEnd: string;
    periodStartUtc: Date;
    periodEndUtc: Date;
  };
}

const MONTH_NAMES_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function padZero(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function formatDateIso(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function getLastDayOfMonth(year: number, month1Indexed: number): number {
  return new Date(Date.UTC(year, month1Indexed, 0)).getUTCDate();
}

/**
 * Returns the ordered list of 12 months for a given financial year and FY configuration.
 * For FY 2025-26 (Apr-Mar):
 *   Apr 2025, May 2025, ..., Dec 2025, Jan 2026, Feb 2026, Mar 2026
 */
export function getFinancialYearMonths(
  fyStartYear: number,
  fyType: "APR_MAR" | "JAN_DEC" | string = "APR_MAR",
  customFyStartMonth?: number
): FinancialMonthOption[] {
  const startMonth = customFyStartMonth || (fyType === "JAN_DEC" ? 1 : 4);
  const isJanDec = startMonth === 1;

  const result: FinancialMonthOption[] = [];

  for (let i = 0; i < 12; i++) {
    const rawMonth = startMonth + i;
    const monthNumber = rawMonth > 12 ? rawMonth - 12 : rawMonth;
    const calendarYear = rawMonth > 12 ? fyStartYear + 1 : fyStartYear;
    const monthName = MONTH_NAMES_SHORT[monthNumber - 1];
    const periodKey = `${calendarYear}-${padZero(monthNumber)}`;
    const label = `${monthName} ${calendarYear}`;

    result.push({
      periodKey,
      monthName,
      monthNumber,
      calendarYear,
      label,
      monthIndex: i
    });
  }

  return result;
}

/**
 * Canonical period resolver that takes (fyStartYear, selectedMonthParam, fyType, customFyStartMonth)
 * and produces a fully resolved, unambiguous CanonicalFinancialPeriod.
 */
export function resolveCanonicalFinancialPeriod(
  fyStartYearInput: number | string,
  selectedMonthParam: string = "Apr",
  fyType: "APR_MAR" | "JAN_DEC" | string = "APR_MAR",
  customFyStartMonth?: number
): CanonicalFinancialPeriod {
  const fyStartYear = typeof fyStartYearInput === "string" ? parseInt(fyStartYearInput, 10) : fyStartYearInput;
  const startMonth = customFyStartMonth || (fyType === "JAN_DEC" ? 1 : 4);
  const isJanDec = startMonth === 1;
  const fyEndYear = isJanDec ? fyStartYear : fyStartYear + 1;
  const fyString = isJanDec ? `${fyStartYear}` : `${fyStartYear}-${(fyStartYear + 1).toString().slice(2)}`;

  const monthsList = getFinancialYearMonths(fyStartYear, fyType, customFyStartMonth);

  // Parse selectedMonthParam: could be "2026-03", "Mar", "3", "03", "Mar 2026", etc.
  const cleanParam = selectedMonthParam.trim();
  let matchedOption: FinancialMonthOption | undefined;

  // 1. Direct periodKey match (e.g. "2026-03")
  if (/^\d{4}-\d{1,2}$/.test(cleanParam)) {
    const [yStr, mStr] = cleanParam.split("-");
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const normalizedKey = `${y}-${padZero(m)}`;
    matchedOption = monthsList.find(opt => opt.periodKey === normalizedKey);
    
    // If user passed a period key where year doesn't match this FY, check if month matches
    if (!matchedOption) {
      matchedOption = monthsList.find(opt => opt.monthNumber === m);
    }
  }

  // 2. Month name match (e.g. "Mar", "March", "Mar 2026")
  if (!matchedOption) {
    matchedOption = monthsList.find(opt => 
      cleanParam.toLowerCase().startsWith(opt.monthName.toLowerCase()) ||
      opt.monthName.toLowerCase() === cleanParam.toLowerCase()
    );
  }

  // 3. Numeric month index (1..12)
  if (!matchedOption) {
    const num = parseInt(cleanParam, 10);
    if (!isNaN(num) && num >= 1 && num <= 12) {
      matchedOption = monthsList.find(opt => opt.monthNumber === num);
    }
  }

  // Fallback to first month of FY if still unmatched
  if (!matchedOption) {
    matchedOption = monthsList[0];
  }

  const { monthIndex, monthNumber, monthName, calendarYear, periodKey, label } = matchedOption;

  // Exact period dates
  const lastDay = getLastDayOfMonth(calendarYear, monthNumber);
  const periodStart = `${calendarYear}-${padZero(monthNumber)}-01`;
  const periodEnd = `${calendarYear}-${padZero(monthNumber)}-${padZero(lastDay)}`;
  const periodStartUtc = new Date(Date.UTC(calendarYear, monthNumber - 1, 1, 0, 0, 0, 0));
  
  const nextMonthNum = monthNumber === 12 ? 1 : monthNumber + 1;
  const nextYearNum = monthNumber === 12 ? calendarYear + 1 : calendarYear;
  const periodEndUtc = new Date(Date.UTC(nextYearNum, nextMonthNum - 1, 1, 0, 0, 0, 0));

  // Previous Month
  const prevMonthNum = monthNumber === 1 ? 12 : monthNumber - 1;
  const prevYearNum = monthNumber === 1 ? calendarYear - 1 : calendarYear;
  const prevMonthName = MONTH_NAMES_SHORT[prevMonthNum - 1];
  const prevLastDay = getLastDayOfMonth(prevYearNum, prevMonthNum);
  const prevPeriodKey = `${prevYearNum}-${padZero(prevMonthNum)}`;
  const prevLabel = `${prevMonthName} ${prevYearNum}`;
  const prevPeriodStart = `${prevYearNum}-${padZero(prevMonthNum)}-01`;
  const prevPeriodEnd = `${prevYearNum}-${padZero(prevMonthNum)}-${padZero(prevLastDay)}`;
  const prevPeriodStartUtc = new Date(Date.UTC(prevYearNum, prevMonthNum - 1, 1, 0, 0, 0, 0));
  const prevPeriodEndUtc = periodStartUtc;

  // Cumulative Period
  const fyStartMonthPadded = padZero(startMonth);
  const cumulativeStart = `${fyStartYear}-${fyStartMonthPadded}-01`;
  const cumulativeEnd = periodEnd;
  const cumulativeStartUtc = new Date(Date.UTC(fyStartYear, startMonth - 1, 1, 0, 0, 0, 0));
  const cumulativeEndUtc = periodEndUtc;
  const monthsCount = monthIndex + 1;
  const isFullYear = monthIndex === 11;
  const cumulativeLabel = isFullYear
    ? `FY ${fyString} Full-Year`
    : `FY ${fyString} YTD (${monthsList[0].monthName} ${monthsList[0].calendarYear} → ${monthName} ${calendarYear})`;

  // Comparable Prior Year Cumulative Period
  const priorFyStartYear = fyStartYear - 1;
  const priorFyString = isJanDec ? `${priorFyStartYear}` : `${priorFyStartYear}-${fyStartYear.toString().slice(2)}`;
  const priorCumulativeStart = `${priorFyStartYear}-${fyStartMonthPadded}-01`;
  const priorEndCalYear = calendarYear - 1;
  const priorCumulativeEnd = `${priorEndCalYear}-${padZero(monthNumber)}-${padZero(getLastDayOfMonth(priorEndCalYear, monthNumber))}`;
  const priorCumulativeStartUtc = new Date(Date.UTC(priorFyStartYear, startMonth - 1, 1, 0, 0, 0, 0));
  const priorNextMonthNum = nextMonthNum;
  const priorNextYearNum = nextYearNum - 1;
  const priorCumulativeEndUtc = new Date(Date.UTC(priorNextYearNum, priorNextMonthNum - 1, 1, 0, 0, 0, 0));
  const priorCumulativeLabel = isFullYear
    ? `FY ${priorFyString} Full-Year`
    : `FY ${priorFyString} Comparable Period (${monthsList[0].monthName} ${priorFyStartYear} → ${monthName} ${priorEndCalYear})`;

  // Prior Year Same Month
  const priorYearSameMonthStart = `${calendarYear - 1}-${padZero(monthNumber)}-01`;
  const priorYearSameMonthEnd = `${calendarYear - 1}-${padZero(monthNumber)}-${padZero(getLastDayOfMonth(calendarYear - 1, monthNumber))}`;
  const priorYearSameMonthStartUtc = new Date(Date.UTC(calendarYear - 1, monthNumber - 1, 1, 0, 0, 0, 0));
  const priorYearSameMonthEndUtc = new Date(Date.UTC(nextYearNum - 1, nextMonthNum - 1, 1, 0, 0, 0, 0));
  const priorYearSameMonthKey = `${calendarYear - 1}-${padZero(monthNumber)}`;
  const priorYearSameMonthLabel = `${monthName} ${calendarYear - 1}`;

  return {
    financialYear: fyString,
    fyStartYear,
    fyEndYear,
    fyStartMonth: startMonth,
    isJanDec,
    monthIndexInFy: monthIndex,
    monthNumber,
    monthName,
    calendarYear,
    periodKey,
    label,
    periodStart,
    periodEnd,
    periodStartUtc,
    periodEndUtc,
    daysInPeriod: Math.round((periodEndUtc.getTime() - periodStartUtc.getTime()) / (1000 * 3600 * 24)),

    previousMonth: {
      monthNumber: prevMonthNum,
      monthName: prevMonthName,
      calendarYear: prevYearNum,
      periodKey: prevPeriodKey,
      label: prevLabel,
      periodStart: prevPeriodStart,
      periodEnd: prevPeriodEnd,
      periodStartUtc: prevPeriodStartUtc,
      periodEndUtc: prevPeriodEndUtc,
      daysInPeriod: Math.round((prevPeriodEndUtc.getTime() - prevPeriodStartUtc.getTime()) / (1000 * 3600 * 24))
    },

    cumulativePeriod: {
      periodStart: cumulativeStart,
      periodEnd: cumulativeEnd,
      periodStartUtc: cumulativeStartUtc,
      periodEndUtc: cumulativeEndUtc,
      label: cumulativeLabel,
      monthsCount,
      isFullYear,
      daysInPeriod: Math.round((cumulativeEndUtc.getTime() - cumulativeStartUtc.getTime()) / (1000 * 3600 * 24))
    },

    comparablePriorCumulativePeriod: {
      periodStart: priorCumulativeStart,
      periodEnd: priorCumulativeEnd,
      periodStartUtc: priorCumulativeStartUtc,
      periodEndUtc: priorCumulativeEndUtc,
      label: priorCumulativeLabel,
      daysInPeriod: Math.round((priorCumulativeEndUtc.getTime() - priorCumulativeStartUtc.getTime()) / (1000 * 3600 * 24))
    },

    priorYearSameMonth: {
      periodKey: priorYearSameMonthKey,
      label: priorYearSameMonthLabel,
      periodStart: priorYearSameMonthStart,
      periodEnd: priorYearSameMonthEnd,
      periodStartUtc: priorYearSameMonthStartUtc,
      periodEndUtc: priorYearSameMonthEndUtc
    }
  };
}
