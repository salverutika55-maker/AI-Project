import { prisma } from "@/lib/prisma";
import { GSTProviderFactory } from "../providers/GSTProviderFactory";
import { encryptGstToken, decryptGstToken } from "../crypto";
import { BaseGSTProviderAdapter } from "../providers/BaseGSTProviderAdapter";

export class GSTConnectionService {
  /**
   * Validate GSTIN format and query registered status from provider
   */
  public static async validateGSTIN(gstin: string) {
    if (!BaseGSTProviderAdapter.isValidGstinFormat(gstin)) {
      return { valid: false, message: "Invalid GSTIN format. Must be 15 characters (e.g. 27AAAAA0000A1Z5)." };
    }
    const provider = GSTProviderFactory.getProvider();
    return await provider.validateGSTIN(gstin);
  }

  /**
   * Connect a client to their GSTIN through compliant GSP/GSTN provider
   */
  public static async connect(
    clientId: string,
    gstin: string,
    credentials?: { username?: string; otpToken?: string },
    userId?: string,
    ipAddress?: string
  ) {
    const cleanGstin = gstin.trim().toUpperCase();

    // 1. Verify Client existence and fetch organization context
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, organizationId: true, name: true }
    });

    if (!client) {
      throw new Error("Client not found.");
    }

    // 2. Validate GSTIN
    const validation = await this.validateGSTIN(cleanGstin);
    if (!validation.valid) {
      throw new Error(validation.message || "Invalid GSTIN");
    }

    // 3. Authenticate with provider
    const provider = GSTProviderFactory.getProvider();
    const authResult = await provider.authenticate(cleanGstin, credentials);
    if (!authResult.success) {
      throw new Error(authResult.errorMessage || "GST authorization failed with provider.");
    }

    const profile = authResult.profile || validation.profile;
    const encryptedToken = authResult.authToken ? encryptGstToken(authResult.authToken) : null;
    const tokenExpiry = authResult.expiresInSeconds
      ? new Date(Date.now() + authResult.expiresInSeconds * 1000)
      : new Date(Date.now() + 86400 * 30 * 1000);

    // 4. Save/Upsert GSTConnection record
    const connection = await prisma.gSTConnection.upsert({
      where: { clientId },
      create: {
        clientId,
        organizationId: client.organizationId,
        gstin: cleanGstin,
        provider: provider.providerName,
        status: "CONNECTED",
        legalName: profile?.legalName || client.name,
        tradeName: profile?.tradeName || profile?.legalName || client.name,
        stateCode: profile?.stateCode || cleanGstin.substring(0, 2),
        registrationStatus: profile?.registrationStatus || "Active",
        registrationDate: profile?.registrationDate || new Date(),
        taxpayerType: profile?.taxpayerType || "Regular",
        encryptedAuthToken: encryptedToken,
        encryptedTokenExpiry: tokenExpiry,
        lastSyncStatus: "READY",
        lastSuccessfulSync: null
      },
      update: {
        gstin: cleanGstin,
        provider: provider.providerName,
        status: "CONNECTED",
        legalName: profile?.legalName || client.name,
        tradeName: profile?.tradeName || profile?.legalName || client.name,
        stateCode: profile?.stateCode || cleanGstin.substring(0, 2),
        registrationStatus: profile?.registrationStatus || "Active",
        registrationDate: profile?.registrationDate || new Date(),
        taxpayerType: profile?.taxpayerType || "Regular",
        encryptedAuthToken: encryptedToken,
        encryptedTokenExpiry: tokenExpiry,
        lastSyncError: null
      }
    });

    // 5. Create audit log
    await prisma.gSTAuditLog.create({
      data: {
        organizationId: client.organizationId,
        clientId,
        gstConnectionId: connection.id,
        action: "CONNECTED",
        performedByUserId: userId,
        ipAddress,
        details: `Connected GSTIN ${cleanGstin} for client ${client.name} via ${provider.providerName}`
      }
    });

    return {
      success: true,
      connection: {
        id: connection.id,
        gstin: connection.gstin,
        status: connection.status,
        legalName: connection.legalName,
        tradeName: connection.tradeName,
        stateCode: connection.stateCode,
        registrationStatus: connection.registrationStatus,
        taxpayerType: connection.taxpayerType,
        provider: connection.provider,
        lastSuccessfulSync: connection.lastSuccessfulSync
      }
    };
  }

  /**
   * Disconnect GST integration safely
   */
  public static async disconnect(clientId: string, userId?: string, ipAddress?: string) {
    const connection = await prisma.gSTConnection.findUnique({
      where: { clientId }
    });

    if (!connection) {
      throw new Error("No active GST connection found for this client.");
    }

    await prisma.gSTConnection.update({
      where: { clientId },
      data: {
        status: "DISCONNECTED",
        encryptedAuthToken: null,
        encryptedTokenExpiry: null,
        lastSyncStatus: "DISCONNECTED"
      }
    });

    await prisma.gSTAuditLog.create({
      data: {
        organizationId: connection.organizationId,
        clientId,
        gstConnectionId: connection.id,
        action: "DISCONNECTED",
        performedByUserId: userId,
        ipAddress,
        details: `Disconnected GSTIN ${connection.gstin}`
      }
    });

    return { success: true, message: "GST account disconnected successfully." };
  }

  /**
   * Get safe GST connection status for frontend
   */
  public static async getConnectionStatus(clientId: string) {
    const connection = await prisma.gSTConnection.findUnique({
      where: { clientId },
      include: {
        _count: {
          select: {
            gstr1Records: true,
            gstr2bRecords: true,
            gstr3bRecords: true,
            syncRuns: true
          }
        }
      }
    });

    if (!connection) {
      return {
        isConnected: false,
        status: "NOT_CONNECTED",
        message: "GST account not connected."
      };
    }

    return {
      isConnected: connection.status === "CONNECTED",
      status: connection.status,
      gstin: connection.gstin,
      legalName: connection.legalName,
      tradeName: connection.tradeName,
      stateCode: connection.stateCode,
      registrationStatus: connection.registrationStatus,
      taxpayerType: connection.taxpayerType,
      provider: connection.provider,
      lastSuccessfulSync: connection.lastSuccessfulSync,
      lastSyncAttempt: connection.lastSyncAttempt,
      lastSyncStatus: connection.lastSyncStatus,
      lastSyncError: connection.lastSyncError,
      recordsCount: {
        gstr1: connection._count.gstr1Records,
        gstr2b: connection._count.gstr2bRecords,
        gstr3b: connection._count.gstr3bRecords,
        syncRuns: connection._count.syncRuns
      }
    };
  }
}
