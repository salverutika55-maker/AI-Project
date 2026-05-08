import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const { email, password, orgName, orgRole } = await req.json();

    if (!email || !password || !orgName) {
      return NextResponse.json({ message: "Missing fields" }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json({ message: "Email already exists" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Auto-assign global Admin role to specified email (do not change this)
    const globalRole = email.toLowerCase() === "salverutika55@gmail.com" ? "ADMIN" : "USER";

    // 1. Create the user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: globalRole,
      },
    });

    // 2. Find or create the organization
    let organization = await prisma.organization.findFirst({
      where: { name: orgName }
    });

    let isNewOrg = false;
    if (!organization) {
      organization = await prisma.organization.create({
        data: { name: orgName }
      });
      isNewOrg = true;
    }

    // 3. Create the membership with the selected role
    const validRoles = ["SUPER_ADMIN", "ORG_ADMIN", "FINANCE_MANAGER", "ACCOUNTANT", "STAFF", "READ_ONLY"];
    
    // If it's a new organization, the creator is automatically the SUPER_ADMIN and APPROVED
    let finalOrgRole = validRoles.includes(orgRole) ? orgRole : "STAFF";
    let finalStatus = "PENDING";

    if (isNewOrg) {
      finalOrgRole = "SUPER_ADMIN";
      finalStatus = "APPROVED";
    }

    await prisma.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        role: finalOrgRole as any,
        status: finalStatus,
      }
    });

    return NextResponse.json({ message: "User and Organization created" }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: "Internal Error" }, { status: 500 });
  }
}
