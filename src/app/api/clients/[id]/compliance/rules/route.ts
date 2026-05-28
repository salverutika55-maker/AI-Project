import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeClientAction } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const DEFAULT_RULES = [
  {
    category: "TDS",
    ruleCode: "TDS_RATE_CHECK",
    name: "TDS Deduction Rate Compliance",
    description: "Verify that professional fees (10%), rent (10%), and contractor payments (2%) match their statutory deduction sections and rates.",
    config: {
      mappings: {
        professional: { section: "194J", rate: 0.10, keywords: ["professional", "consulting", "audit", "legal"] },
        rent: { section: "194I", rate: 0.10, keywords: ["rent", "lease", "rental"] },
        contractor: { section: "194C", rate: 0.02, keywords: ["contractor", "jobwork", "security", "labour", "maintenance"] }
      }
    }
  },
  {
    category: "TDS",
    ruleCode: "TDS_INTEREST_FLOW",
    name: "TDS on Interest Sequential Audit",
    description: "Enforces sequential booking (Interest Expense -> TDS Payable) and detects direct bank payments without liability recognition.",
    config: {
      interestKeywords: ["interest", "finance cost"],
      tdsLedgerKeywords: ["tds on interest", "tds payable"]
    }
  },
  {
    category: "DEPRECIATION",
    ruleCode: "DEP_MONTHLY_CHECK",
    name: "Month-on-Month Depreciation Check",
    description: "Verifies that depreciation is booked consistently every single month and alerts when irregular skips occur.",
    config: {
      depreciationKeywords: ["depreciation", "amortisation"],
      fixedAssetKeywords: ["fixed asset", "plant", "machinery", "furniture", "building", "land", "computers", "equipment"]
    }
  },
  {
    category: "PREPAID",
    ruleCode: "PREPAID_AMORTIZATION_CHECK",
    name: "Prepaid Expense Allocation Audit",
    description: "Detects deferred accounts and tracks whether their allocations are correctly amortized month-on-month.",
    config: {
      prepaidKeywords: ["prepaid", "advance", "insurance", "amc", "subscription"]
    }
  }
];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await authorizeClientAction(user.id, id, "READ_ONLY");

    let rules = await prisma.complianceRule.findMany({
      where: { clientId: id },
      orderBy: { category: "asc" }
    });

    if (rules.length === 0) {
      // Auto seed rules for new clients
      const seedData = DEFAULT_RULES.map(r => ({
        clientId: id,
        category: r.category,
        ruleCode: r.ruleCode,
        name: r.name,
        description: r.description,
        config: r.config,
        isActive: true
      }));

      await prisma.complianceRule.createMany({ data: seedData });
      rules = await prisma.complianceRule.findMany({
        where: { clientId: id },
        orderBy: { category: "asc" }
      });
    }

    return NextResponse.json({ success: true, data: rules });
  } catch (error: any) {
    console.error("Compliance Rules Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Only allow editors or admins to toggle rules
    await authorizeClientAction(user.id, id, "FINANCE_MANAGER");

    const body = await req.json();
    const { ruleId, isActive, config } = body;

    const updated = await prisma.complianceRule.update({
      where: { id: ruleId },
      data: {
        ...(isActive !== undefined ? { isActive } : {}),
        ...(config !== undefined ? { config } : {})
      }
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error("Compliance Rule Update Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
