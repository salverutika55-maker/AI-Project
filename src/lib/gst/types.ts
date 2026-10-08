export type GSTProviderType = "GSTN_SANDBOX" | "CLEAR_TAX" | "MASTERS_INDIA" | "CYGNET" | "MOCK_GSP";

export type GSTConnectionStatus = "CONNECTED" | "DISCONNECTED" | "ERROR" | "PENDING_AUTH";

export type GSTSyncDataType = "GSTR1" | "GSTR2B" | "GSTR3B" | "RETURN_STATUS" | "PROFILE" | "ALL";

export type GSTSyncStatus = "RUNNING" | "COMPLETED" | "FAILED" | "PARTIALLY_SYNCED";

export type GSTMatchStatus = 
  | "MATCHED" 
  | "VALUE_MISMATCH" 
  | "TAX_MISMATCH" 
  | "MISSING_IN_GST" 
  | "MISSING_IN_BOOKS" 
  | "DATE_MISMATCH" 
  | "DUPLICATE" 
  | "CREDIT_DEBIT_NOTE_DIFF" 
  | "TIMING_DIFFERENCE" 
  | "REVIEW_REQUIRED";

export type GSTComplianceSeverity = "HIGH" | "MEDIUM" | "LOW" | "INFO";

export interface GSTProfileDTO {
  gstin: string;
  legalName: string;
  tradeName?: string;
  stateCode: string;
  registrationStatus: string;
  registrationDate?: Date;
  taxpayerType: string;
  address?: string;
}

export interface GSTR1LineDTO {
  documentNumber: string;
  documentDate: Date;
  documentType: "INV" | "CRN" | "DBN" | "EXP" | "AT";
  customerGSTIN?: string;
  customerName?: string;
  pos?: string;
  reverseCharge?: boolean;
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  totalValue: number;
  sourceReference?: string;
}

export interface GSTR2BLineDTO {
  supplierGSTIN: string;
  supplierName?: string;
  invoiceNumber: string;
  invoiceDate: Date;
  invoiceType: "INV" | "CRN" | "DBN";
  pos?: string;
  reverseCharge?: boolean;
  itcAvailable: boolean;
  itcReason?: string;
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  totalValue: number;
  gstr1FilingDate?: Date;
  sourceReference?: string;
}

export interface GSTR3BDTO {
  returnPeriod: string;
  outwardTaxableSupplies: number;
  outwardIgst: number;
  outwardCgst: number;
  outwardSgst: number;
  outwardCess: number;
  outwardInterStateUnreg: number;
  outwardZeroRated: number;
  outwardNilExempt: number;
  inwardReverseCharge: number;
  itcIgst: number;
  itcCgst: number;
  itcSgst: number;
  itcCess: number;
  inwardExemptNilNonGst: number;
  taxPaidIgst: number;
  taxPaidCgst: number;
  taxPaidSgst: number;
  taxPaidCess: number;
  interestPaid: number;
  lateFeePaid: number;
  filingDate?: Date;
  arn?: string;
  sourceReference?: string;
}

export interface GSTReturnStatusDTO {
  returnType: "GSTR1" | "GSTR2B" | "GSTR3B" | "GSTR9" | "GSTR9C";
  returnPeriod: string;
  status: "FILED" | "NOT_FILED" | "PENDING" | "SUBMITTED";
  filingDate?: Date;
  arn?: string;
  sourceReference?: string;
}

export interface GSTAuthResult {
  success: boolean;
  authToken?: string;
  expiresInSeconds?: number;
  profile?: GSTProfileDTO;
  errorMessage?: string;
}

export interface GSTSyncFilter {
  period: string; // "YYYY-MM" e.g. "2026-03"
  dataType?: GSTSyncDataType;
}

export interface GSTProviderAdapter {
  providerName: GSTProviderType;
  authenticate(gstin: string, credentials?: Record<string, any>): Promise<GSTAuthResult>;
  validateGSTIN(gstin: string): Promise<{ valid: boolean; profile?: GSTProfileDTO; message?: string }>;
  fetchProfile(gstin: string, authToken?: string): Promise<GSTProfileDTO | null>;
  fetchReturnStatus(gstin: string, financialYear: string, authToken?: string): Promise<GSTReturnStatusDTO[]>;
  fetchGSTR1(gstin: string, period: string, authToken?: string): Promise<GSTR1LineDTO[]>;
  fetchGSTR2B(gstin: string, period: string, authToken?: string): Promise<GSTR2BLineDTO[]>;
  fetchGSTR3B(gstin: string, period: string, authToken?: string): Promise<GSTR3BDTO | null>;
}

export interface GSTSalesReconItem {
  id: string;
  documentNumber: string;
  documentDate: string;
  customerGSTIN?: string;
  customerName?: string;
  
  // Books values
  booksTaxable: number;
  booksIgst: number;
  booksCgst: number;
  booksSgst: number;
  booksTotal: number;
  booksVoucherId?: string;
  booksVoucherType?: string;
  
  // GST values
  gstTaxable: number;
  gstIgst: number;
  gstCgst: number;
  gstSgst: number;
  gstTotal: number;
  gstRecordId?: string;
  
  taxableDiff: number;
  taxDiff: number;
  status: GSTMatchStatus;
  matchScore: number;
  explanation: string;
}

export interface GSTPurchaseITCReconItem {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  supplierGSTIN: string;
  supplierName?: string;
  
  // Books values
  booksTaxable: number;
  booksIgst: number;
  booksCgst: number;
  booksSgst: number;
  booksTotalITC: number;
  booksVoucherId?: string;
  
  // GSTR-2B values
  gst2bTaxable: number;
  gst2bIgst: number;
  gst2bCgst: number;
  gst2bSgst: number;
  gst2bTotalITC: number;
  itcAvailable: boolean;
  itcReason?: string;
  gstRecordId?: string;
  
  itcDiff: number;
  status: GSTMatchStatus;
  matchScore: number;
  explanation: string;
}

export interface GSTR3BReconSummary {
  period: string;
  filingStatus: string;
  filingDate?: string;
  arn?: string;
  
  // Outward Supplies Comparison
  booksOutwardTaxable: number;
  gstr1OutwardTaxable: number;
  gstr3bOutwardTaxable: number;
  outwardTaxableVariance: number;
  
  // Output Tax Comparison
  booksOutputTax: number;
  gstr1OutputTax: number;
  gstr3bOutputTax: number;
  outputTaxVariance: number;
  
  // ITC Claimed Comparison
  booksItcTotal: number;
  gstr2bItcTotal: number;
  gstr3bItcClaimed: number;
  itcVariance: number;
  
  // Status flags
  isOutwardBalanced: boolean;
  isItcBalanced: boolean;
  riskSummary: string;
}

export interface GSTComplianceFinding {
  ruleCode: string;
  title: string;
  category: "FILING" | "OUTWARD_MISMATCH" | "ITC_EXPOSURE" | "TAX_RATE" | "GSTIN_INTEGRITY";
  severity: GSTComplianceSeverity;
  description: string;
  impactAmount: number;
  suggestedAction: string;
  affectedCount: number;
}

export interface GSTCFOInsight {
  id: string;
  title: string;
  category: "REVENUE_RECON" | "ITC_LEAKAGE" | "STATUTORY_EXPOSURE" | "VENDOR_COMPLIANCE";
  severity: GSTComplianceSeverity;
  observation: string;
  driver: string;
  financialImpact: string;
  risk: string;
  managementAction: string;
  cfoQuestion: string;
  metricValue: string;
}
