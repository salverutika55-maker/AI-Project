import * as XLSX from 'xlsx';

export interface RawLedger {
  ledgerName: string;
  groupName?: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface DetectionResult {
  ledgerIdx: number;
  debitIdx: number;
  creditIdx: number;
  balanceIdx: number;
  groupIdx: number;
  headerRow: number;
}

/**
 * Intelligent Trial Balance Parser
 * Handles messy Excel files, detects columns, and normalizes data.
 */
export async function parseTrialBalance(buffer: Buffer): Promise<RawLedger[]> {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  if (data.length === 0) throw new Error("Excel file is empty");

  const detection = detectStructure(data);
  const normalizedData: RawLedger[] = [];

  // Start from row after header
  for (let i = detection.headerRow + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const name = String(row[detection.ledgerIdx] || "").trim();
    
    // Skip empty names, total rows, or summary rows
    if (!name || isTotalRow(name)) continue;

    let dr = parseNumber(row[detection.debitIdx]);
    let cr = parseNumber(row[detection.creditIdx]);
    let bal = parseNumber(row[detection.balanceIdx]);

    // Handle single column balance (negative = credit)
    if (detection.debitIdx === detection.creditIdx && bal !== 0) {
      if (bal > 0) dr = bal;
      else cr = Math.abs(bal);
    }

    normalizedData.push({
      ledgerName: name,
      groupName: detection.groupIdx !== -1 ? String(row[detection.groupIdx] || "").trim() : undefined,
      debit: dr,
      credit: cr,
      balance: bal || (dr - cr)
    });
  }

  return normalizedData;
}

function detectStructure(data: any[][]): DetectionResult {
  let result: DetectionResult = {
    ledgerIdx: -1,
    debitIdx: -1,
    creditIdx: -1,
    balanceIdx: -1,
    groupIdx: -1,
    headerRow: -1
  };

  // Scan first 20 rows for headers
  for (let r = 0; r < Math.min(20, data.length); r++) {
    const row = data[r];
    if (!row) continue;

    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] || "").toLowerCase();
      
      if (result.ledgerIdx === -1 && /ledger|particular|account|head/i.test(cell)) {
        result.ledgerIdx = c;
        result.headerRow = r;
      }
      if (result.debitIdx === -1 && /debit|dr|payment/i.test(cell)) result.debitIdx = c;
      if (result.creditIdx === -1 && /credit|cr|receipt/i.test(cell)) result.creditIdx = c;
      if (result.balanceIdx === -1 && /balance|closing|net/i.test(cell)) result.balanceIdx = c;
      if (result.groupIdx === -1 && /group|parent|category/i.test(cell)) result.groupIdx = c;
    }

    if (result.ledgerIdx !== -1) break;
  }

  // Fallback defaults if detection fails
  if (result.ledgerIdx === -1) result.ledgerIdx = 0;
  if (result.debitIdx === -1) result.debitIdx = 1;
  if (result.creditIdx === -1) result.creditIdx = 2;
  if (result.headerRow === -1) result.headerRow = 0;

  return result;
}

function parseNumber(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[, ]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function isTotalRow(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("total") || n.includes("grand total") || n.includes("brought forward");
}
