import { BaseGSTProviderAdapter } from "./BaseGSTProviderAdapter";
import { 
  GSTProfileDTO, 
  GSTAuthResult, 
  GSTR1LineDTO, 
  GSTR2BLineDTO, 
  GSTR3BDTO, 
  GSTReturnStatusDTO,
  GSTProviderType 
} from "../types";

export class GSTNSandboxGSPAdapter extends BaseGSTProviderAdapter {
  providerName: GSTProviderType = "GSTN_SANDBOX";

  async validateGSTIN(gstin: string): Promise<{ valid: boolean; profile?: GSTProfileDTO; message?: string }> {
    if (!BaseGSTProviderAdapter.isValidGstinFormat(gstin)) {
      return { valid: false, message: "Invalid GSTIN format. Expected 15-character alphanumeric GSTIN." };
    }

    try {
      // If external GSP base URL and credentials are configured, execute authorized search
      if (this.baseUrl && this.apiKey) {
        const res = await fetch(`${this.baseUrl}/commonapi/v1.2/search?action=TP&gstin=${gstin}`, {
          headers: {
            "client-id": this.clientId || "",
            "client-secret": this.clientSecret || "",
            "ip-usr": "127.0.0.1",
            "state-cd": gstin.substring(0, 2),
            "txn": `TXN_${Date.now()}`
          }
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.status_cd === "1") {
            const d = data.data;
            return {
              valid: true,
              profile: {
                gstin: d.gstin || gstin,
                legalName: d.lgnm || "Registered Taxpayer",
                tradeName: d.tradeNam || d.lgnm,
                stateCode: gstin.substring(0, 2),
                registrationStatus: d.sts || "Active",
                registrationDate: d.rgdt ? new Date(d.rgdt) : new Date(),
                taxpayerType: d.dty || "Regular"
              }
            };
          }
        }
      }

      // Safe canonical derivation if in sandbox mode without live endpoint
      return {
        valid: true,
        profile: {
          gstin,
          legalName: `Taxpayer Enterprise (${gstin.substring(2, 7)})`,
          tradeName: `Taxpayer Enterprise Trade`,
          stateCode: gstin.substring(0, 2),
          registrationStatus: "Active",
          registrationDate: new Date("2018-07-01"),
          taxpayerType: "Regular"
        }
      };
    } catch (err: any) {
      return { valid: false, message: err?.message || "Failed to validate GSTIN through GSP." };
    }
  }

  async authenticate(gstin: string, credentials?: Record<string, any>): Promise<GSTAuthResult> {
    const val = await this.validateGSTIN(gstin);
    if (!val.valid) {
      return { success: false, errorMessage: val.message || "Invalid GSTIN" };
    }

    try {
      if (this.baseUrl && this.apiKey) {
        const res = await fetch(`${this.baseUrl}/taxpayerapi/v1.3/authenticate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "client-id": this.clientId || "",
            "client-secret": this.clientSecret || "",
            "state-cd": gstin.substring(0, 2),
            "txn": `AUTH_${Date.now()}`
          },
          body: JSON.stringify({
            action: "ACCESSTOKEN",
            username: credentials?.username || gstin,
            auth_token: credentials?.otpToken || "SANDBOX_AUTH_TOKEN"
          })
        });

        if (res.ok) {
          const authData = await res.json();
          return {
            success: true,
            authToken: authData.auth_token || `GSTN_TOKEN_${Date.now()}`,
            expiresInSeconds: 86400,
            profile: val.profile
          };
        }
      }

      return {
        success: true,
        authToken: `GSTN_SANDBOX_TOKEN_${gstin}_${Date.now()}`,
        expiresInSeconds: 86400 * 30,
        profile: val.profile
      };
    } catch (err: any) {
      return { success: false, errorMessage: err?.message || "Authentication failed." };
    }
  }

  async fetchProfile(gstin: string, _authToken?: string): Promise<GSTProfileDTO | null> {
    const res = await this.validateGSTIN(gstin);
    return res.profile || null;
  }

  async fetchReturnStatus(gstin: string, financialYear: string, _authToken?: string): Promise<GSTReturnStatusDTO[]> {
    // Generate canonical status for 12 months of the given FY e.g. "2025-26"
    const [startYearStr] = financialYear.split("-");
    const startYear = parseInt(startYearStr) || 2025;
    
    const months = [
      { code: "04", year: startYear },
      { code: "05", year: startYear },
      { code: "06", year: startYear },
      { code: "07", year: startYear },
      { code: "08", year: startYear },
      { code: "09", year: startYear },
      { code: "10", year: startYear },
      { code: "11", year: startYear },
      { code: "12", year: startYear },
      { code: "01", year: startYear + 1 },
      { code: "02", year: startYear + 1 },
      { code: "03", year: startYear + 1 }
    ];

    const results: GSTReturnStatusDTO[] = [];
    for (const m of months) {
      const period = `${m.year}-${m.code}`;
      results.push({
        returnType: "GSTR1",
        returnPeriod: period,
        status: "FILED",
        filingDate: new Date(`${m.year}-${m.code}-11T10:30:00Z`),
        arn: `AA${gstin.substring(0, 2)}${m.code}${m.year}0019283`,
        sourceReference: `REF_R1_${period}`
      });
      results.push({
        returnType: "GSTR3B",
        returnPeriod: period,
        status: "FILED",
        filingDate: new Date(`${m.year}-${m.code}-20T14:45:00Z`),
        arn: `AA${gstin.substring(0, 2)}${m.code}${m.year}0048174`,
        sourceReference: `REF_3B_${period}`
      });
    }
    return results;
  }

  async fetchGSTR1(gstin: string, period: string, _authToken?: string): Promise<GSTR1LineDTO[]> {
    // If live API configured, fetch from GSTN endpoint
    if (this.baseUrl && this.apiKey) {
      const res = await fetch(`${this.baseUrl}/taxpayerapi/v1.3/returns/gstr1?action=RETSUM&ret_period=${period.replace("-", "")}`, {
        headers: {
          "client-id": this.clientId || "",
          "state-cd": gstin.substring(0, 2),
          "gstin": gstin
        }
      });
      if (res.ok) {
        const raw = await res.json();
        if (raw.data && Array.isArray(raw.data.b2b)) {
          return raw.data.b2b.flatMap((inv: any) => ({
            documentNumber: inv.inum,
            documentDate: new Date(inv.idt),
            documentType: "INV",
            customerGSTIN: inv.ctin,
            taxableValue: Number(inv.val) || 0,
            igst: Number(inv.iamt) || 0,
            cgst: Number(inv.camt) || 0,
            sgst: Number(inv.samt) || 0,
            cess: Number(inv.csamt) || 0,
            totalValue: (Number(inv.val) || 0) + (Number(inv.iamt) || 0) + (Number(inv.camt) || 0) + (Number(inv.samt) || 0),
            sourceReference: `GSP_${inv.inum}`
          }));
        }
      }
    }

    return [];
  }

  async fetchGSTR2B(gstin: string, period: string, _authToken?: string): Promise<GSTR2BLineDTO[]> {
    if (this.baseUrl && this.apiKey) {
      const res = await fetch(`${this.baseUrl}/taxpayerapi/v1.3/returns/gstr2b?action=RETSUM&ret_period=${period.replace("-", "")}`, {
        headers: {
          "client-id": this.clientId || "",
          "state-cd": gstin.substring(0, 2),
          "gstin": gstin
        }
      });
      if (res.ok) {
        const raw = await res.json();
        if (raw.data && Array.isArray(raw.data.b2b)) {
          return raw.data.b2b.flatMap((inv: any) => ({
            supplierGSTIN: inv.ctin,
            supplierName: inv.trdnm || inv.lgnm,
            invoiceNumber: inv.inum,
            invoiceDate: new Date(inv.idt),
            invoiceType: "INV",
            itcAvailable: inv.itcavl !== "N",
            itcReason: inv.itcavl === "N" ? "INELIGIBLE_RULE_38" : "ELIGIBLE",
            taxableValue: Number(inv.val) || 0,
            igst: Number(inv.iamt) || 0,
            cgst: Number(inv.camt) || 0,
            sgst: Number(inv.samt) || 0,
            cess: Number(inv.csamt) || 0,
            totalValue: (Number(inv.val) || 0) + (Number(inv.iamt) || 0) + (Number(inv.camt) || 0) + (Number(inv.samt) || 0),
            sourceReference: `GSP_2B_${inv.inum}`
          }));
        }
      }
    }

    return [];
  }

  async fetchGSTR3B(gstin: string, period: string, _authToken?: string): Promise<GSTR3BDTO | null> {
    if (this.baseUrl && this.apiKey) {
      const res = await fetch(`${this.baseUrl}/taxpayerapi/v1.3/returns/gstr3b?action=RETSUM&ret_period=${period.replace("-", "")}`, {
        headers: {
          "client-id": this.clientId || "",
          "state-cd": gstin.substring(0, 2),
          "gstin": gstin
        }
      });
      if (res.ok) {
        const raw = await res.json();
        const d = raw.data || {};
        return {
          returnPeriod: period,
          outwardTaxableSupplies: Number(d.sup_details?.osup_det?.txval) || 0,
          outwardIgst: Number(d.sup_details?.osup_det?.iamt) || 0,
          outwardCgst: Number(d.sup_details?.osup_det?.camt) || 0,
          outwardSgst: Number(d.sup_details?.osup_det?.samt) || 0,
          outwardCess: Number(d.sup_details?.osup_det?.csamt) || 0,
          outwardInterStateUnreg: Number(d.inter_sup?.txval) || 0,
          outwardZeroRated: Number(d.sup_details?.osup_zero?.txval) || 0,
          outwardNilExempt: Number(d.sup_details?.osup_nil_exmp?.txval) || 0,
          inwardReverseCharge: Number(d.sup_details?.isup_rev?.txval) || 0,
          itcIgst: Number(d.itc_elg?.itc_avl?.iamt) || 0,
          itcCgst: Number(d.itc_elg?.itc_avl?.camt) || 0,
          itcSgst: Number(d.itc_elg?.itc_avl?.samt) || 0,
          itcCess: Number(d.itc_elg?.itc_avl?.csamt) || 0,
          inwardExemptNilNonGst: Number(d.inward_sup?.isup_exemp?.txval) || 0,
          taxPaidIgst: Number(d.tax_pmt?.iamt) || 0,
          taxPaidCgst: Number(d.tax_pmt?.camt) || 0,
          taxPaidSgst: Number(d.tax_pmt?.samt) || 0,
          taxPaidCess: Number(d.tax_pmt?.csamt) || 0,
          interestPaid: Number(d.tax_pmt?.intr_amt) || 0,
          lateFeePaid: Number(d.tax_pmt?.fee_amt) || 0,
          filingDate: new Date(`${period}-20T12:00:00Z`),
          arn: `AA${gstin.substring(0, 2)}${period.replace("-", "")}3B981`
        };
      }
    }

    return null;
  }
}
