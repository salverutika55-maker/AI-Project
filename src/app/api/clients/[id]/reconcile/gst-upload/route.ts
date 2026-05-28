import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { authorizeClientAction } from "@/lib/rbac";
import { Role } from "@prisma/client";
import * as XLSX from "xlsx";
import { reconcileGSTData } from "@/lib/services/gst-reconciliation";

interface GSTR2BInput {
  id: string;
  gstin: string;
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: Date;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  itcAvailable: boolean;
}

function parseExcelDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === "number") {
    return new Date(Math.round((val - 25569) * 86400 * 1000));
  }
  const str = String(val).trim();
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  
  // Handle standard Indian date formats DD-MM-YYYY or DD/MM/YYYY
  const parts = str.split(/[-/]/);
  if (parts.length === 3) {
    const p0 = parseInt(parts[0]);
    const p1 = parseInt(parts[1]);
    const p2 = parseInt(parts[2]);
    if (p2 > 1000) {
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
 * Intelligent GSTR-2B Column Detector
 */
function detectGSTColumns(data: any[][]): {
  gstinIdx: number;
  nameIdx: number;
  invIdx: number;
  dateIdx: number;
  valIdx: number;
  cgstIdx: number;
  sgstIdx: number;
  igstIdx: number;
  itcIdx: number;
  headerRow: number;
} {
  let result = {
    gstinIdx: -1,
    nameIdx: -1,
    invIdx: -1,
    dateIdx: -1,
    valIdx: -1,
    cgstIdx: -1,
    sgstIdx: -1,
    igstIdx: -1,
    itcIdx: -1,
    headerRow: -1
  };

  for (let r = 0; r < Math.min(30, data.length); r++) {
    const row = data[r];
    if (!row) continue;

    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] || "").toLowerCase();

      if (result.gstinIdx === -1 && /gstin|gst/i.test(cell)) {
        result.gstinIdx = c;
        result.headerRow = r;
      }
      if (result.nameIdx === -1 && /trade|legal|vendor|supplier|name/i.test(cell)) {
        result.nameIdx = c;
      }
      if (result.invIdx === -1 && /inv|invoice|bill\s*no|bill\s*number/i.test(cell)) {
        result.invIdx = c;
      }
      if (result.dateIdx === -1 && /date/i.test(cell)) {
        result.dateIdx = c;
      }
      if (result.valIdx === -1 && /taxable|value|val/i.test(cell)) {
        result.valIdx = c;
      }
      if (result.cgstIdx === -1 && /cgst|central\s*tax/i.test(cell)) {
        result.cgstIdx = c;
      }
      if (result.sgstIdx === -1 && /sgst|state\s*tax/i.test(cell)) {
        result.sgstIdx = c;
      }
      if (result.igstIdx === -1 && /igst|integrated\s*tax/i.test(cell)) {
        result.igstIdx = c;
      }
      if (result.itcIdx === -1 && /itc|eligible|available/i.test(cell)) {
        result.itcIdx = c;
      }
    }

    if (result.gstinIdx !== -1 && result.invIdx !== -1 && result.dateIdx !== -1) {
      break;
    }
  }

  // Fallbacks
  if (result.gstinIdx === -1) result.gstinIdx = 0;
  if (result.nameIdx === -1) result.nameIdx = 1;
  if (result.invIdx === -1) result.invIdx = 2;
  if (result.dateIdx === -1) result.dateIdx = 3;
  if (result.valIdx === -1) result.valIdx = 4;
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
      return NextResponse.json({ error: "Missing GSTR-2B file or period" }, { status: 400 });
    }

    // 1. Process GSTR-2B File
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    if (rawData.length === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    const detection = detectGSTColumns(rawData);
    const parsedGSTLines: GSTR2BInput[] = [];

    for (let i = detection.headerRow + 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.length === 0) continue;

      const gstin = String(row[detection.gstinIdx] || "").trim();
      if (!gstin || gstin.length < 5) continue; // Skip lines with invalid GSTINs (or totals)

      const vendorName = String(row[detection.nameIdx] || "Unknown Supplier").trim();
      const invoiceNumber = String(row[detection.invIdx] || "").trim();
      const invoiceDate = parseExcelDate(row[detection.dateIdx]);
      if (!invoiceDate || !invoiceNumber) continue;

      const taxableValue = parseAmount(row[detection.valIdx]);
      const cgst = detection.cgstIdx !== -1 ? parseAmount(row[detection.cgstIdx]) : 0;
      const sgst = detection.sgstIdx !== -1 ? parseAmount(row[detection.sgstIdx]) : 0;
      const igst = detection.igstIdx !== -1 ? parseAmount(row[detection.igstIdx]) : 0;
      
      let itcAvailable = true;
      if (detection.itcIdx !== -1) {
        const itcText = String(row[detection.itcIdx]).toLowerCase();
        if (itcText.includes("no") || itcText.includes("ineligible") || itcText.includes("false")) {
          itcAvailable = false;
        }
      }

      parsedGSTLines.push({
        id: `${clientId}_gst_2b_${i}`,
        gstin,
        vendorName,
        invoiceNumber,
        invoiceDate,
        taxableValue,
        cgst,
        sgst,
        igst,
        itcAvailable
      });
    }

    if (parsedGSTLines.length === 0) {
      return NextResponse.json({ error: "No valid GSTR-2B invoices found in file" }, { status: 400 });
    }

    // 2. Execute GST Match Engine
    const { matches, summary } = await reconcileGSTData(
      clientId,
      period,
      parsedGSTLines
    );

    return NextResponse.json({
      success: true,
      matches,
      summary
    });

  } catch (error: any) {
    console.error("GST reconciliation upload error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
