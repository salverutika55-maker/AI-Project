import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { decrypt } from "@/lib/encryption";
import { logSecurityEvent } from "@/lib/logger";
import { authorizeClientAction } from "@/lib/rbac";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || "2026");
  const fyType = searchParams.get("fyType") || "APR_MAR";

  // 1. Secure Session Check
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // 2. Authorization & Ownership Check
    await authorizeClientAction(user.id, id, "READ_ONLY");

    // Determine the exact years to query based on Fiscal Year type
    const queryYears = fyType === "APR_MAR" ? [year, year + 1] : [year];

    // 3. Fetch and DECRYPT actual values
    const encryptedValues = await prisma.pNLValue.findMany({
      where: { clientId: id, year: { in: queryYears } }
    });

    // 4. Fetch and DECRYPT budget values
    const encryptedBudgets = await prisma.budgetValue.findMany({
      where: { clientId: id, year: { in: queryYears } }
    });

    const decryptValue = (amountStr: string) => {
      let decryptedAmount = 0;
      try {
        const decrypted = decrypt(amountStr);
        decryptedAmount = parseFloat(decrypted);
      } catch (e) {
        decryptedAmount = parseFloat(amountStr);
      }
      return isNaN(decryptedAmount) ? 0 : decryptedAmount;
    };

    // Filter values strictly to the selected Fiscal Year
    const filterByFy = (v: any) => {
      if (fyType === "APR_MAR") {
        if (["Jan", "Feb", "Mar"].includes(v.month)) return v.year === year + 1;
        return v.year === year;
      }
      return v.year === year;
    };

    const values = encryptedValues.filter(filterByFy).map(v => ({
      ...v,
      amount: decryptValue(v.amount)
    }));

    const budgetValues = encryptedBudgets.filter(filterByFy).map(v => ({
      ...v,
      amount: decryptValue(v.amount)
    }));

    return NextResponse.json({ 
      values, 
      budgetValues,
      debug: {
        clientId: id,
        year,
        fyType,
        count: values.length,
        queryYears
      }
    });
  } catch (error: any) {
    console.error("Values Fetch Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
