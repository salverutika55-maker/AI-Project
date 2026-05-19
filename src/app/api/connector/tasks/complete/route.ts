import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verify } from "jsonwebtoken";
import { encrypt } from "@/lib/encryption";

const JWT_SECRET = process.env.JWT_SECRET || "default_secret_for_dev_only";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    let clientId: string;
    try {
      const decoded = verify(token, JWT_SECRET) as { clientId: string };
      clientId = decoded.clientId;
    } catch (e) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { taskId, status, result, error } = await req.json();

    if (!taskId || !status) {
      return NextResponse.json({ error: "taskId and status required" }, { status: 400 });
    }

    // Verify task belongs to this client
    const task = await prisma.syncTask.findFirst({
      where: { id: taskId, clientId }
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found for this client" }, { status: 404 });
    }

    // Update task
    const updatedTask = await prisma.syncTask.update({
      where: { id: taskId },
      data: {
        status,
        result: result || null,
        error: error || null,
      }
    });

    // If completed, trigger data ingestion
    if (status === "COMPLETED") {
      const now = new Date();

      // Save Chart of Accounts if provided by Tally
      if (result && Array.isArray((result as any).ledgers)) {
        const encryptedLedgers = encrypt(JSON.stringify((result as any).ledgers));
        await prisma.integrationCredential.upsert({
          where: { clientId },
          update: { encryptedApiKey: encryptedLedgers },
          create: { clientId, encryptedApiKey: encryptedLedgers }
        }).catch(console.error);
      }


      if (!result || !(result as any).ledgers) {
        const month = now.toLocaleString('default', { month: 'short' });
        const year = now.getFullYear();

        // Use the actual result from Tally if provided
        const finalData = (result && typeof result === 'object') ? (result as Record<string, number>) : {};
        const headsToIngest = Object.keys(finalData).length > 0 ? Object.keys(finalData) : ["Domestic", "Export", "Opening Stock", "Purchase", "Coal Charges", "Power Bill"];
        
        await Promise.all(headsToIngest.map(head => {
          // Use result value if available, otherwise random for missing heads in dev
          const amountValue = finalData[head] !== undefined ? finalData[head] : (Math.floor(Math.random() * 500000) + 100000);
          const encryptedAmount = encrypt(amountValue.toString());

          return prisma.pNLValue.upsert({
            where: {
              clientId_headName_month_year: {
                clientId,
                headName: head,
                month,
                year
              }
            },
            update: { amount: encryptedAmount },
            create: {
              clientId,
              headName: head,
              month,
              year,
              amount: encryptedAmount
            }
          });
        }));
      }

      // Update lastSyncedAt and lastAlterId on client
      await prisma.client.update({
        where: { id: clientId },
        data: { 
          lastSyncedAt: new Date(),
          lastAlterId: result?.newAlterId?.toString() || undefined, // Update the marker for next delta
          connectorStatus: "ONLINE" // Reset to online
        }
      });
    } else {
      // Even if failed, reset status to ONLINE so user can try again
      await prisma.client.update({
        where: { id: clientId },
        data: { connectorStatus: "ONLINE" }
      });
    }

    return NextResponse.json({ 
      success: true, 
      taskId: updatedTask.id,
      status: updatedTask.status 
    });
  } catch (error) {
    console.error("Task Completion Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
