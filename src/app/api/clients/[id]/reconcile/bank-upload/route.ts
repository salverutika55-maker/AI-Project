import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { authorizeClientAction } from "@/lib/rbac";
import { Role } from "@prisma/client";
import * as XLSX from "xlsx";
import { matchBankTransactions } from "@/lib/services/nlp-reconciliation";

interface BankLine {
  id: string;
  date: Date;
  narration: string;
  referenceCode?: string;
  amount: number; // positive = credit (deposit), negative = debit (withdrawal)
}

function parseExcelDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === "number") {
    // XLSX serial date code
    return new Date(Math.round((val - 25569) * 86400 * 1000));
  }
  const str = String(val).trim();
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  
  // Try parsing common formats like DD-MM-YYYY, DD/MM/YYYY
  const parts = str.split(/[-/]/);
  if (parts.length === 3) {
    const p0 = parseInt(parts[0]);
    const p1 = parseInt(parts[1]);
    const p2 = parseInt(parts[2]);
    if (p2 > 1000) {
      // Assuming DD-MM-YYYY or MM-DD-YYYY
      // Let's assume standard Indian layout DD-MM-YYYY
      const dIndia = new Date(p2, p1 - 1, p0);
      if (!isNaN(dIndia.getTime())) return dIndia;
    }
  }
  return null;
}

function parseAmount(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return val;
  const cleaned = String(val).replace(/[, ]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Intelligent Bank Statement Column Detector
 */
function detectBankColumns(data: any[][]): {
  dateIdx: number;
  narrIdx: number;
  refIdx: number;
  debitIdx: number;
  creditIdx: number;
  amountIdx: number;
  headerRow: number;
} {
  let result = {
    dateIdx: -1,
    narrIdx: -1,
    refIdx: -1,
    debitIdx: -1,
    creditIdx: -1,
    amountIdx: -1,
    headerRow: -1
  };

  for (let r = 0; r < Math.min(30, data.length); r++) {
    const row = data[r];
    if (!row) continue;

    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] || "").toLowerCase();

      if (result.dateIdx === -1 && /date/i.test(cell)) {
        result.dateIdx = c;
        result.headerRow = r;
      }
      if (result.narrIdx === -1 && /particular|description|narration|remarks/i.test(cell)) {
        result.narrIdx = c;
      }
      if (result.refIdx === -1 && /ref|chq|cheque|instrument|document/i.test(cell)) {
        result.refIdx = c;
      }
      if (result.debitIdx === -1 && /debit|withdrawal|payment|dr/i.test(cell)) {
        result.debitIdx = c;
      }
      if (result.creditIdx === -1 && /credit|deposit|receipt|cr/i.test(cell)) {
        result.creditIdx = c;
      }
      if (result.amountIdx === -1 && /amount|value/i.test(cell) && !/debit|credit/i.test(cell)) {
        result.amountIdx = c;
      }
    }
    if (result.dateIdx !== -1 && (result.narrIdx !== -1 || result.amountIdx !== -1 || result.debitIdx !== -1)) {
      break;
    }
  }

  // Fallbacks
  if (result.dateIdx === -1) result.dateIdx = 0;
  if (result.narrIdx === -1) result.narrIdx = 1;
  if (result.amountIdx === -1 && result.debitIdx === -1) result.amountIdx = 2;
  if (result.headerRow === -1) result.headerRow = 0;

  return result;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params;
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // RBAC Authorization check
    try {
      if (user.role !== "ADMIN") {
        await authorizeClientAction(user.id, clientId, Role.ACCOUNTANT);
      }
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const period = formData.get("period") as string; // e.g. "2026-05"

    if (!file || !period) {
      return NextResponse.json({ error: "Missing statement file or period" }, { status: 400 });
    }

    // 1. Process Bank Statement File
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    if (rawData.length === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    const detection = detectBankColumns(rawData);
    const parsedBankLines: BankLine[] = [];

    for (let i = detection.headerRow + 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.length === 0) continue;

      const date = parseExcelDate(row[detection.dateIdx]);
      if (!date) continue; // Skip rows that don't look like dates

      const narration = String(row[detection.narrIdx] || "").trim();
      const ref = detection.refIdx !== -1 ? String(row[detection.refIdx] || "").trim() : "";
      
      let amount = 0;
      if (detection.debitIdx !== -1 && detection.creditIdx !== -1) {
        const debit = parseAmount(row[detection.debitIdx]);
        const credit = parseAmount(row[detection.creditIdx]);
        // Bank received deposits are credit (+), withdrawals are debit (-)
        amount = credit - debit;
      } else {
        amount = parseAmount(row[detection.amountIdx]);
      }

      parsedBankLines.push({
        id: `${clientId}_bank_stmt_${i}`,
        date,
        narration: narration || "Bank Transaction",
        referenceCode: ref,
        amount
      });
    }

    if (parsedBankLines.length === 0) {
      return NextResponse.json({ error: "No valid bank statement transactions found in file" }, { status: 400 });
    }

    // 2. Fetch Books Voucher Lines
    const [year, month] = period.split("-").map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    // Fetch cash/bank book ledger entries in books
    const bookLedgerLines = await prisma.normalizedVoucherLine.findMany({
      where: {
        voucher: {
          clientId,
          date: {
            gte: startDate,
            lt: endDate
          }
        },
        ledger: {
          OR: [
            { groupName: { contains: "Bank Accounts" } },
            { groupName: { contains: "Bank OD Accounts" } },
            { groupName: { contains: "Cash-in-hand" } },
            { name: { contains: "Bank", mode: "insensitive" } },
            { name: { contains: "ICICI", mode: "insensitive" } },
            { name: { contains: "HDFC", mode: "insensitive" } },
            { name: { contains: "SBI", mode: "insensitive" } }
          ]
        }
      },
      include: {
        voucher: true,
        ledger: true
      }
    });

    const formattedLedgerLines = bookLedgerLines.map(l => ({
      id: l.id,
      amount: l.amount, // debit = positive, credit = negative
      voucher: {
        id: l.voucherId,
        date: l.voucher.date,
        referenceNo: l.voucher.referenceNo,
        narration: l.voucher.narration
      },
      ledgerName: l.ledger.name,
      ledgerGroup: l.ledger.groupName
    }));

    // 3. Execute Match Engine
    const { matches, mismatchAmount } = await matchBankTransactions(
      clientId,
      period,
      parsedBankLines,
      formattedLedgerLines
    );

    // 4. Group matches into structural results for high-fidelity rendering
    const matchedBankIds = new Set(matches.map(m => m.bankLineId));
    const matchedLedgerIds = new Set(matches.map(m => m.ledgerLineId));

    const finalMatches = matches.map(m => {
      const bankLine = parsedBankLines.find(bl => bl.id === m.bankLineId)!;
      const ledLine = formattedLedgerLines.find(ll => ll.id === m.ledgerLineId)!;
      return {
        bankLineId: m.bankLineId,
        ledgerLineId: m.ledgerLineId,
        score: m.score,
        matchType: m.matchType,
        
        bankDate: bankLine.date.toISOString().split("T")[0],
        bankNarration: bankLine.narration,
        bankRef: bankLine.referenceCode,
        bankAmount: bankLine.amount,

        booksDate: ledLine.voucher.date.toISOString().split("T")[0],
        booksNarration: ledLine.voucher.narration || "",
        booksRef: ledLine.voucher.referenceNo || "",
        booksAmount: ledLine.amount,
        booksLedger: ledLine.ledgerName
      };
    });

    const unmatchedBank = parsedBankLines
      .filter(bl => !matchedBankIds.has(bl.id))
      .map(bl => ({
        id: bl.id,
        date: bl.date.toISOString().split("T")[0],
        narration: bl.narration,
        reference: bl.referenceCode,
        amount: bl.amount
      }));

    const unmatchedBooks = formattedLedgerLines
      .filter(ll => !matchedLedgerIds.has(ll.id))
      .map(ll => ({
        id: ll.id,
        date: ll.voucher.date.toISOString().split("T")[0],
        narration: ll.voucher.narration || "",
        reference: ll.voucher.referenceNo || "",
        amount: ll.amount,
        ledgerName: ll.ledgerName
      }));

    return NextResponse.json({
      success: true,
      matches: finalMatches,
      unmatchedBank,
      unmatchedBooks,
      mismatchAmount,
      summary: {
        exactMatchesCount: matches.filter(m => m.matchType === "EXACT").length,
        fuzzyMatchesCount: matches.filter(m => m.matchType === "FUZZY").length,
        unmatchedBankCount: unmatchedBank.length,
        unmatchedBooksCount: unmatchedBooks.length
      }
    });

  } catch (error: any) {
    console.error("Bank statement upload error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
