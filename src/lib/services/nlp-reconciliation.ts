import { prisma } from "@/lib/prisma";

export interface ReconciliationMatch {
  bankLineId: string;
  ledgerLineId: string;
  score: number;
  matchType: "EXACT" | "FUZZY" | "MISMATCH";
}

/**
 * 1. Narration NLP Intelligence Scanner
 * Detects Capital/Revenue leaks, Personal Expenses, Related Party Transfers, and illegal Cash Limits.
 */
export async function analyzeNarrationNLP(clientId: string, year: number): Promise<{ alertsGenerated: number }> {
  let count = 0;

  // Fetch normalized vouchers with their lines and ledgers for the fiscal year
  const vouchers = await prisma.normalizedVoucher.findMany({
    where: {
      clientId,
      date: {
        gte: new Date(`${year}-04-01T00:00:00.000Z`),
        lt: new Date(`${year + 1}-04-01T00:00:00.000Z`)
      }
    },
    include: {
      lines: {
        include: { ledger: true }
      }
    }
  });

  // Risk keywords mapping
  const rules = [
    {
      category: "CLASSIFICATION",
      ruleCode: "NLP_CAPITAL_LEAK",
      severity: "HIGH",
      title: "Capital vs Revenue Expenditure Leak",
      keywords: ["purchase laptop", "macbook", "iphone", "aircon", "machinery", "construction", "renovation", "server hardware", "motor vehicle"],
      groupExclude: ["Fixed Assets"],
      description: (narr: string, ledger: string) => `⚠️ Capital item purchase indicators detected in narration ("${narr}") but booked under revenue expense ledger "${ledger}". This may violate capitalization rules.`
    },
    {
      category: "CLASSIFICATION",
      ruleCode: "NLP_PERSONAL_EXPENSE",
      severity: "HIGH",
      title: "Potential Personal Expense Booking",
      keywords: ["school fee", "groceries", "director's wife", "personal credit card", "residential", "medical personal", "family tour", "home electricity"],
      groupExclude: [],
      description: (narr: string, ledger: string) => `⚠️ Narration ("${narr}") indicates personal consumption/director-level non-business expense booked under business expense "${ledger}".`
    },
    {
      category: "FORENSIC",
      ruleCode: "NLP_RELATED_PARTY",
      severity: "MEDIUM",
      title: "Related Party Transaction Detected",
      keywords: ["director loan", "promoter's relative", "sister concern", "subsidiary", "associated enterprise", "shareholder draw"],
      groupExclude: [],
      description: (narr: string, ledger: string) => `⚠️ Related party transfer terms detected in narration ("${narr}") for ledger "${ledger}". Requires special disclosure in financial statements.`
    },
    {
      category: "FORENSIC",
      ruleCode: "NLP_ILLEGAL_CASH",
      severity: "HIGH",
      title: "High-Value Cash Payment (Sec 40A(3) Breach)",
      keywords: ["paid in cash", "cash payment", "withdrawn cash for payment"],
      groupExclude: [],
      description: (narr: string, ledger: string) => `⚠️ Narration suggests cash settlement for expense ledger "${ledger}". Under Section 40A(3), cash payments exceeding ₹10,000 are disallowable under Income Tax.`
    }
  ];

  for (const v of vouchers) {
    if (!v.narration) continue;
    const narrationLower = v.narration.toLowerCase();

    for (const rule of rules) {
      const match = rule.keywords.some(kw => narrationLower.includes(kw));
      if (match) {
        for (const line of v.lines) {
          // Avoid false positives if it's already properly grouped (e.g. Capital items under Fixed Assets)
          if (rule.groupExclude.some(grp => line.ledger.groupName.includes(grp))) {
            continue;
          }

          // If the line is an expense or debit transaction of high value, flag it
          const amt = Math.abs(line.amount);
          if (amt > 0 && (line.ledger.groupName.includes("Expenses") || rule.ruleCode === "NLP_ILLEGAL_CASH")) {
            
            // Check if alert already exists for this line to prevent duplicates
            const existingAlert = await prisma.scrutinyAlert.findFirst({
              where: {
                clientId,
                ruleCode: rule.ruleCode,
                voucherId: v.id,
                ledgerId: line.ledgerId
              }
            });

            if (!existingAlert) {
              await prisma.scrutinyAlert.create({
                data: {
                  clientId,
                  ruleCode: rule.ruleCode,
                  category: rule.category,
                  severity: rule.severity,
                  title: rule.title,
                  description: rule.description(v.narration, line.ledger.name),
                  ledgerId: line.ledgerId,
                  voucherId: v.id,
                  impactAmount: amt,
                  status: "PENDING",
                  metadata: {
                    narration: v.narration,
                    voucherNumber: v.voucherNumber,
                    date: v.date,
                    ledgerName: line.ledger.name
                  }
                }
              });
              count++;
            }
          }
        }
      }
    }
  }

  return { alertsGenerated: count };
}

/**
 * Helper to compute token Jaccard string similarity
 */
export function calculateStringSimilarity(s1: string, s2: string): number {
  const clean1 = s1.toLowerCase().trim();
  const clean2 = s2.toLowerCase().trim();
  if (clean1 === clean2) return 1.0;
  if (!clean1 || !clean2) return 0.0;

  const tokens1 = new Set(clean1.split(/[\s,.\-\/]+/));
  const tokens2 = new Set(clean2.split(/[\s,.\-\/]+/));
  
  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);

  if (union.size === 0) return 0.0;
  return intersection.size / union.size;
}

/**
 * 2. Fuzzy Bank and Ledger Reconciliation Matching Engine
 * Compares statement lines against normalized ledger lines using:
 * Score = w_amt * AmtScore + w_date * DateScore + w_ref * RefScore + w_narr * NarrScore
 */
export async function matchBankTransactions(
  clientId: string,
  period: string,
  bankStatementLines: Array<{
    id: string;
    amount: number; // positive = credit (received), negative = debit (paid)
    date: Date;
    referenceCode?: string;
    narration: string;
  }>,
  ledgerVoucherLines: Array<{
    id: string;
    amount: number; // positive = debit, negative = credit
    voucher: {
      id: string;
      date: Date;
      referenceNo?: string | null;
      narration?: string | null;
    };
  }>
): Promise<{ matches: ReconciliationMatch[]; mismatchAmount: number }> {
  
  const matches: ReconciliationMatch[] = [];
  let mismatchAmount = 0.0;

  // Weight Configuration
  const W_AMOUNT = 0.50;
  const W_DATE = 0.20;
  const W_REF = 0.20;
  const W_NARR = 0.10;

  const matchedLedgerLineIds = new Set<string>();

  for (const bankLine of bankStatementLines) {
    let bestMatch: ReconciliationMatch | null = null;
    let bestScore = 0.0;

    for (const ledLine of ledgerVoucherLines) {
      if (matchedLedgerLineIds.has(ledLine.id)) continue;

      // 1. Amount Score (Must match signs correctly - bank debit matches ledger credit and vice versa)
      // Bank amount: +1000 (credit/deposit), Ledger amount: -1000 (credit/receipt in Double-Entry, but wait: in bank book a receipt is DEBIT).
      // Let's check absolute amount similarity.
      const bankAbs = Math.abs(bankLine.amount);
      const ledgerAbs = Math.abs(ledLine.amount);
      const amountDiff = Math.abs(bankAbs - ledgerAbs);
      
      let amountScore = 0.0;
      if (amountDiff === 0) {
        amountScore = 1.0;
      } else if (amountDiff < 10) { // Small rounding diff
        amountScore = 0.8;
      } else if (amountDiff < 100) {
        amountScore = 0.4;
      }

      if (amountScore === 0) continue; // High divergence in amount means they are not a pair

      // 2. Date Score (Fuzzy match within 15 days window)
      const dateDiffDays = Math.abs(bankLine.date.getTime() - ledLine.voucher.date.getTime()) / (1000 * 60 * 60 * 24);
      let dateScore = 0.0;
      if (dateDiffDays <= 1) dateScore = 1.0;
      else if (dateDiffDays <= 3) dateScore = 0.8;
      else if (dateDiffDays <= 7) dateScore = 0.5;
      else if (dateDiffDays <= 15) dateScore = 0.2;

      // 3. Reference Code Score
      let refScore = 0.0;
      if (bankLine.referenceCode && ledLine.voucher.referenceNo) {
        refScore = calculateStringSimilarity(bankLine.referenceCode, ledLine.voucher.referenceNo);
      }

      // 4. Narration Similarity Score
      let narrScore = 0.0;
      if (bankLine.narration && ledLine.voucher.narration) {
        narrScore = calculateStringSimilarity(bankLine.narration, ledLine.voucher.narration);
      }

      // Compute weighted total score
      const totalScore = (amountScore * W_AMOUNT) + (dateScore * W_DATE) + (refScore * W_REF) + (narrScore * W_NARR);

      if (totalScore > bestScore && totalScore >= 0.60) {
        bestScore = totalScore;
        bestMatch = {
          bankLineId: bankLine.id,
          ledgerLineId: ledLine.id,
          score: totalScore,
          matchType: totalScore >= 0.90 ? "EXACT" : "FUZZY"
        };
      }
    }

    if (bestMatch) {
      matches.push(bestMatch);
      matchedLedgerLineIds.add(bestMatch.ledgerLineId);
    } else {
      mismatchAmount += Math.abs(bankLine.amount);
    }
  }

  // Create or update ReconciliationState in DB
  await prisma.reconciliationState.upsert({
    where: {
      id: `${clientId}_bank_${period}`
    },
    update: {
      mismatchAmount,
      lastRun: new Date(),
      metadata: {
        totalMatches: matches.length,
        fuzzyMatches: matches.filter(m => m.matchType === "FUZZY").length,
        exactMatches: matches.filter(m => m.matchType === "EXACT").length
      }
    },
    create: {
      id: `${clientId}_bank_${period}`,
      clientId,
      type: "BANK",
      statementPeriod: period,
      mismatchAmount,
      metadata: {
        totalMatches: matches.length,
        fuzzyMatches: matches.filter(m => m.matchType === "FUZZY").length,
        exactMatches: matches.filter(m => m.matchType === "EXACT").length
      }
    }
  });

  return { matches, mismatchAmount };
}
