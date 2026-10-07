import { prisma } from "@/lib/prisma";
import { GSTProviderFactory } from "../providers/GSTProviderFactory";
import { decryptGstToken } from "../crypto";
import { GSTSyncDataType } from "../types";

export class GSTSyncService {
  /**
   * Synchronize GST data for a specific client and period
   */
  public static async sync(
    clientId: string,
    params: {
      period: string; // "YYYY-MM" e.g. "2026-03"
      dataType?: GSTSyncDataType; // "GSTR1", "GSTR2B", "GSTR3B", "ALL"
      financialYear?: string; // "2025-26"
    },
    userId?: string,
    ipAddress?: string
  ) {
    const { period, dataType = "ALL", financialYear } = params;

    // 1. Fetch GST connection
    const connection = await prisma.gSTConnection.findUnique({
      where: { clientId }
    });

    if (!connection || connection.status !== "CONNECTED") {
      throw new Error("GST account not connected. Please connect GSTIN first.");
    }

    // 2. Check for active running sync lock
    const activeSync = await prisma.gSTSyncRun.findFirst({
      where: {
        clientId,
        status: "RUNNING",
        startedAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } // lock expires after 5 mins
      }
    });

    if (activeSync) {
      throw new Error("GST sync already in progress. Please wait for the current synchronization to finish.");
    }

    // 3. Resolve Period Dates
    const [yearStr, monthStr] = period.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    // 4. Create Sync Run record
    const syncRun = await prisma.gSTSyncRun.create({
      data: {
        organizationId: connection.organizationId,
        clientId,
        gstConnectionId: connection.id,
        returnPeriod: period,
        periodStart,
        periodEnd,
        dataType,
        status: "RUNNING",
        startedAt: new Date()
      }
    });

    // Update connection status
    await prisma.gSTConnection.update({
      where: { id: connection.id },
      data: {
        lastSyncAttempt: new Date(),
        lastSyncStatus: "SYNCING"
      }
    });

    const provider = GSTProviderFactory.getProvider(connection.provider as any);
    const authToken = connection.encryptedAuthToken ? decryptGstToken(connection.encryptedAuthToken) : undefined;

    let recordsFetched = 0;
    let recordsCreated = 0;
    let recordsUpdated = 0;
    let recordsFailed = 0;
    const errors: string[] = [];

    try {
      // 5. Fetch & Upsert GSTR-1 Records
      if (dataType === "GSTR1" || dataType === "ALL") {
        try {
          const gstr1Lines = await provider.fetchGSTR1(connection.gstin, period, authToken);
          recordsFetched += gstr1Lines.length;

          for (const line of gstr1Lines) {
            try {
              const res = await prisma.gSTR1Record.upsert({
                where: {
                  clientId_gstin_returnPeriod_documentNumber_documentType: {
                    clientId,
                    gstin: connection.gstin,
                    returnPeriod: period,
                    documentNumber: line.documentNumber,
                    documentType: line.documentType || "INV"
                  }
                },
                create: {
                  organizationId: connection.organizationId,
                  clientId,
                  gstConnectionId: connection.id,
                  gstin: connection.gstin,
                  returnPeriod: period,
                  documentNumber: line.documentNumber,
                  documentDate: line.documentDate,
                  documentType: line.documentType || "INV",
                  customerGSTIN: line.customerGSTIN,
                  customerName: line.customerName,
                  pos: line.pos,
                  reverseCharge: line.reverseCharge || false,
                  taxableValue: line.taxableValue,
                  igst: line.igst,
                  cgst: line.cgst,
                  sgst: line.sgst,
                  cess: line.cess || 0,
                  totalValue: line.totalValue,
                  sourceReference: line.sourceReference,
                  sourceProvider: provider.providerName
                },
                update: {
                  documentDate: line.documentDate,
                  customerGSTIN: line.customerGSTIN,
                  customerName: line.customerName,
                  pos: line.pos,
                  reverseCharge: line.reverseCharge || false,
                  taxableValue: line.taxableValue,
                  igst: line.igst,
                  cgst: line.cgst,
                  sgst: line.sgst,
                  cess: line.cess || 0,
                  totalValue: line.totalValue,
                  sourceReference: line.sourceReference,
                  sourceProvider: provider.providerName
                }
              });
              if (res.createdAt.getTime() === res.updatedAt.getTime()) {
                recordsCreated++;
              } else {
                recordsUpdated++;
              }
            } catch (err: any) {
              recordsFailed++;
              errors.push(`GSTR1 Line ${line.documentNumber}: ${err?.message}`);
            }
          }
        } catch (err: any) {
          errors.push(`GSTR1 Fetch Error: ${err?.message}`);
        }
      }

      // 6. Fetch & Upsert GSTR-2B Records
      if (dataType === "GSTR2B" || dataType === "ALL") {
        try {
          const gstr2bLines = await provider.fetchGSTR2B(connection.gstin, period, authToken);
          recordsFetched += gstr2bLines.length;

          for (const line of gstr2bLines) {
            try {
              const res = await prisma.gSTR2BRecord.upsert({
                where: {
                  clientId_gstin_returnPeriod_supplierGSTIN_invoiceNumber_invoiceType: {
                    clientId,
                    gstin: connection.gstin,
                    returnPeriod: period,
                    supplierGSTIN: line.supplierGSTIN,
                    invoiceNumber: line.invoiceNumber,
                    invoiceType: line.invoiceType || "INV"
                  }
                },
                create: {
                  organizationId: connection.organizationId,
                  clientId,
                  gstConnectionId: connection.id,
                  gstin: connection.gstin,
                  returnPeriod: period,
                  supplierGSTIN: line.supplierGSTIN,
                  supplierName: line.supplierName,
                  invoiceNumber: line.invoiceNumber,
                  invoiceDate: line.invoiceDate,
                  invoiceType: line.invoiceType || "INV",
                  pos: line.pos,
                  reverseCharge: line.reverseCharge || false,
                  itcAvailable: line.itcAvailable,
                  itcReason: line.itcReason,
                  taxableValue: line.taxableValue,
                  igst: line.igst,
                  cgst: line.cgst,
                  sgst: line.sgst,
                  cess: line.cess || 0,
                  totalValue: line.totalValue,
                  gstr1FilingDate: line.gstr1FilingDate,
                  sourceReference: line.sourceReference
                },
                update: {
                  supplierName: line.supplierName,
                  invoiceDate: line.invoiceDate,
                  pos: line.pos,
                  reverseCharge: line.reverseCharge || false,
                  itcAvailable: line.itcAvailable,
                  itcReason: line.itcReason,
                  taxableValue: line.taxableValue,
                  igst: line.igst,
                  cgst: line.cgst,
                  sgst: line.sgst,
                  cess: line.cess || 0,
                  totalValue: line.totalValue,
                  gstr1FilingDate: line.gstr1FilingDate,
                  sourceReference: line.sourceReference
                }
              });
              if (res.createdAt.getTime() === res.updatedAt.getTime()) {
                recordsCreated++;
              } else {
                recordsUpdated++;
              }
            } catch (err: any) {
              recordsFailed++;
              errors.push(`GSTR2B Line ${line.invoiceNumber}: ${err?.message}`);
            }
          }
        } catch (err: any) {
          errors.push(`GSTR2B Fetch Error: ${err?.message}`);
        }
      }

      // 7. Fetch & Upsert GSTR-3B Record
      if (dataType === "GSTR3B" || dataType === "ALL") {
        try {
          const gstr3b = await provider.fetchGSTR3B(connection.gstin, period, authToken);
          if (gstr3b) {
            recordsFetched += 1;
            const res = await prisma.gSTR3BRecord.upsert({
              where: {
                clientId_gstin_returnPeriod: {
                  clientId,
                  gstin: connection.gstin,
                  returnPeriod: period
                }
              },
              create: {
                organizationId: connection.organizationId,
                clientId,
                gstConnectionId: connection.id,
                gstin: connection.gstin,
                returnPeriod: period,
                outwardTaxableSupplies: gstr3b.outwardTaxableSupplies,
                outwardIgst: gstr3b.outwardIgst,
                outwardCgst: gstr3b.outwardCgst,
                outwardSgst: gstr3b.outwardSgst,
                outwardCess: gstr3b.outwardCess,
                outwardInterStateUnreg: gstr3b.outwardInterStateUnreg,
                outwardZeroRated: gstr3b.outwardZeroRated,
                outwardNilExempt: gstr3b.outwardNilExempt,
                inwardReverseCharge: gstr3b.inwardReverseCharge,
                itcIgst: gstr3b.itcIgst,
                itcCgst: gstr3b.itcCgst,
                itcSgst: gstr3b.itcSgst,
                itcCess: gstr3b.itcCess,
                inwardExemptNilNonGst: gstr3b.inwardExemptNilNonGst,
                taxPaidIgst: gstr3b.taxPaidIgst,
                taxPaidCgst: gstr3b.taxPaidCgst,
                taxPaidSgst: gstr3b.taxPaidSgst,
                taxPaidCess: gstr3b.taxPaidCess,
                interestPaid: gstr3b.interestPaid,
                lateFeePaid: gstr3b.lateFeePaid,
                filingDate: gstr3b.filingDate,
                arn: gstr3b.arn,
                sourceReference: gstr3b.sourceReference
              },
              update: {
                outwardTaxableSupplies: gstr3b.outwardTaxableSupplies,
                outwardIgst: gstr3b.outwardIgst,
                outwardCgst: gstr3b.outwardCgst,
                outwardSgst: gstr3b.outwardSgst,
                outwardCess: gstr3b.outwardCess,
                outwardInterStateUnreg: gstr3b.outwardInterStateUnreg,
                outwardZeroRated: gstr3b.outwardZeroRated,
                outwardNilExempt: gstr3b.outwardNilExempt,
                inwardReverseCharge: gstr3b.inwardReverseCharge,
                itcIgst: gstr3b.itcIgst,
                itcCgst: gstr3b.itcCgst,
                itcSgst: gstr3b.itcSgst,
                itcCess: gstr3b.itcCess,
                inwardExemptNilNonGst: gstr3b.inwardExemptNilNonGst,
                taxPaidIgst: gstr3b.taxPaidIgst,
                taxPaidCgst: gstr3b.taxPaidCgst,
                taxPaidSgst: gstr3b.taxPaidSgst,
                taxPaidCess: gstr3b.taxPaidCess,
                interestPaid: gstr3b.interestPaid,
                lateFeePaid: gstr3b.lateFeePaid,
                filingDate: gstr3b.filingDate,
                arn: gstr3b.arn,
                sourceReference: gstr3b.sourceReference
              }
            });
            if (res.createdAt.getTime() === res.updatedAt.getTime()) {
              recordsCreated++;
            } else {
              recordsUpdated++;
            }
          }
        } catch (err: any) {
          errors.push(`GSTR3B Fetch Error: ${err?.message}`);
        }
      }

      // 8. Fetch & Upsert Return Statuses
      const fyToFetch = financialYear || `${year}-${(year + 1).toString().slice(-2)}`;
      try {
        const statuses = await provider.fetchReturnStatus(connection.gstin, fyToFetch, authToken);
        for (const st of statuses) {
          await prisma.gSTReturnStatus.upsert({
            where: {
              clientId_gstin_returnType_returnPeriod: {
                clientId,
                gstin: connection.gstin,
                returnType: st.returnType,
                returnPeriod: st.returnPeriod
              }
            },
            create: {
              organizationId: connection.organizationId,
              clientId,
              gstConnectionId: connection.id,
              gstin: connection.gstin,
              returnType: st.returnType,
              returnPeriod: st.returnPeriod,
              status: st.status,
              filingDate: st.filingDate,
              arn: st.arn,
              sourceReference: st.sourceReference
            },
            update: {
              status: st.status,
              filingDate: st.filingDate,
              arn: st.arn,
              sourceReference: st.sourceReference
            }
          });
        }
      } catch (err: any) {
        errors.push(`Return Status Fetch Error: ${err?.message}`);
      }

      const finalStatus = errors.length > 0 && recordsCreated === 0 && recordsUpdated === 0 
        ? "FAILED" 
        : errors.length > 0 
          ? "PARTIALLY_SYNCED" 
          : "COMPLETED";

      // 9. Update SyncRun record
      await prisma.gSTSyncRun.update({
        where: { id: syncRun.id },
        data: {
          status: finalStatus,
          completedAt: new Date(),
          recordsFetched,
          recordsCreated,
          recordsUpdated,
          recordsFailed,
          errorSummary: errors.length > 0 ? errors.slice(0, 10).join("; ") : null
        }
      });

      // 10. Update GSTConnection metadata
      await prisma.gSTConnection.update({
        where: { id: connection.id },
        data: {
          lastSuccessfulSync: finalStatus !== "FAILED" ? new Date() : connection.lastSuccessfulSync,
          lastSyncStatus: finalStatus,
          lastSyncError: errors.length > 0 ? errors[0] : null
        }
      });

      // 11. Create Audit Log
      await prisma.gSTAuditLog.create({
        data: {
          organizationId: connection.organizationId,
          clientId,
          gstConnectionId: connection.id,
          action: finalStatus === "COMPLETED" ? "SYNC_COMPLETED" : "SYNC_FAILED",
          performedByUserId: userId,
          ipAddress,
          details: `Synchronized ${recordsFetched} GST records for period ${period} (Status: ${finalStatus})`
        }
      });

      return {
        success: finalStatus !== "FAILED",
        status: finalStatus,
        period,
        recordsFetched,
        recordsCreated,
        recordsUpdated,
        recordsFailed,
        errors: errors.slice(0, 5)
      };
    } catch (err: any) {
      // Catch-all failure handling
      await prisma.gSTSyncRun.update({
        where: { id: syncRun.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorSummary: err?.message || "Unhandled error during GST sync."
        }
      });

      await prisma.gSTConnection.update({
        where: { id: connection.id },
        data: {
          lastSyncStatus: "FAILED",
          lastSyncError: err?.message || "Sync execution error."
        }
      });

      await prisma.gSTAuditLog.create({
        data: {
          organizationId: connection.organizationId,
          clientId,
          gstConnectionId: connection.id,
          action: "SYNC_FAILED",
          performedByUserId: userId,
          ipAddress,
          details: `GST sync failed for ${period}: ${err?.message}`
        }
      });

      throw new Error(`GST sync failed: ${err?.message}`);
    }
  }

  /**
   * Get sync runs history
   */
  public static async getSyncHistory(clientId: string, limit: number = 10) {
    return await prisma.gSTSyncRun.findMany({
      where: { clientId },
      orderBy: { startedAt: "desc" },
      take: limit
    });
  }
}
