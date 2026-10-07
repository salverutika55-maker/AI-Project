import { GSTProviderAdapter, GSTProviderType } from "../types";

export abstract class BaseGSTProviderAdapter implements GSTProviderAdapter {
  abstract providerName: GSTProviderType;
  
  protected apiKey?: string;
  protected clientId?: string;
  protected clientSecret?: string;
  protected baseUrl?: string;

  constructor() {
    this.apiKey = process.env.GST_API_KEY;
    this.clientId = process.env.GST_CLIENT_ID;
    this.clientSecret = process.env.GST_CLIENT_SECRET;
    this.baseUrl = process.env.GST_API_BASE_URL;
  }

  abstract authenticate(gstin: string, credentials?: Record<string, any>): Promise<import("../types").GSTAuthResult>;
  abstract validateGSTIN(gstin: string): Promise<{ valid: boolean; profile?: import("../types").GSTProfileDTO; message?: string }>;
  abstract fetchProfile(gstin: string, authToken?: string): Promise<import("../types").GSTProfileDTO | null>;
  abstract fetchReturnStatus(gstin: string, financialYear: string, authToken?: string): Promise<import("../types").GSTReturnStatusDTO[]>;
  abstract fetchGSTR1(gstin: string, period: string, authToken?: string): Promise<import("../types").GSTR1LineDTO[]>;
  abstract fetchGSTR2B(gstin: string, period: string, authToken?: string): Promise<import("../types").GSTR2BLineDTO[]>;
  abstract fetchGSTR3B(gstin: string, period: string, authToken?: string): Promise<import("../types").GSTR3BDTO | null>;

  /**
   * Standard GSTIN format validation (15-character alphanumeric format)
   * 2 digits state code + 10 alphanumeric PAN + 1 entity code + 1 'Z' + 1 checksum char
   */
  public static isValidGstinFormat(gstin: string): boolean {
    if (!gstin || typeof gstin !== "string") return false;
    const clean = gstin.trim().toUpperCase();
    const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return regex.test(clean);
  }
}
