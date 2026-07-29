import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeClientAction } from "@/lib/rbac";
import { recalculatePNLValues } from "@/lib/services/recalculate-statements";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; provisionId: string }> }
) {
  const { id, provisionId } = await params;

  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Restrict posting to qualified roles
    await authorizeClientAction(user.id, id, "FINANCE_MANAGER");

    const body = await req.json();
    const { reversalDate, reversalReason } = body;

    if (!reversalReason) {
      return NextResponse.json({ error: "Reversal reason is required" }, { status: 400 });
    }

    // 1. Fetch provision
    const provision = await prisma.provision.findFirst({
      where: { id: provisionId, clientId: id }
    });

    if (!provision) {
      return NextResponse.json({ error: "Provision not found" }, { status: 404 });
    }

    if (provision.status !== "POSTED") {
      return NextResponse.json({ error: `Provision cannot be reversed (current status: ${provision.status})` }, { status: 400 });
    }

    const revDate = reversalDate ? new Date(reversalDate) : new Date();
    const revVoucherNumber = `REV-${provision.provisionNumber}`;

    // 2. Post reversing double-entry journal voucher
    // Reversal debit ledger = original credit ledger
    // Reversal credit ledger = original debit ledger
    const reversalVoucher = await prisma.normalizedVoucher.create({
      data: {
        clientId: id,
        voucherNumber: revVoucherNumber,
        date: revDate,
        type: "JOURNAL",
        narration: `Reversal of provision ${provision.provisionNumber}. Reason: ${reversalReason}`,
        totalAmount: provision.amount,
        isManual: true,
        lines: {
          create: [
            {
              ledgerId: provision.creditLedgerId, // Debit original credit ledger
              amount: provision.amount,
              entryType: "DEBIT"
            },
            {
              ledgerId: provision.debitLedgerId, // Credit original debit ledger
              amount: -provision.amount,
              entryType: "CREDIT"
            }
          ]
        }
      }
    });

    // 3. Update Provision record
    const updatedProvision = await prisma.provision.update({
      where: { id: provisionId },
      data: {
        status: "REVERSED",
        reversalVoucherId: reversalVoucher.id,
        reversalDate: revDate,
        reversalReason: reversalReason,
        reversedById: user.id
      }
    });

    // 4. Recalculate cached P&L statements so changes appear immediately
    await recalculatePNLValues(id, provision.financialYear);

    return NextResponse.json(updatedProvision);
  } catch (error: any) {
    console.error("Reversal API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
