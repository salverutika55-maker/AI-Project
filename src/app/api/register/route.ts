import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { email, password, orgName, orgRole } = await req.json();

    if (!email || !password || !orgName) {
      return NextResponse.json({ message: "Missing fields" }, { status: 400 });
    }

    const emailNormalized = email.trim().toLowerCase();
    const orgNameTrimmed = orgName.trim();

    // 1. Find or create the organization (case-insensitive lookup)
    let organization = await prisma.organization.findFirst({
      where: {
        name: {
          equals: orgNameTrimmed,
          mode: "insensitive"
        }
      }
    });

    let isNewOrg = false;
    if (!organization) {
      organization = await prisma.organization.create({
        data: { name: orgNameTrimmed }
      });
      isNewOrg = true;
    }

    const validRoles = ["SUPER_ADMIN", "ORG_ADMIN", "FINANCE_MANAGER", "ACCOUNTANT", "STAFF", "READ_ONLY"];
    let finalOrgRole = validRoles.includes(orgRole) ? orgRole : "STAFF";
    let finalStatus = isNewOrg ? "APPROVED" : "PENDING";
    if (isNewOrg) {
      finalOrgRole = "SUPER_ADMIN";
    }

    // 2. Check if the user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: emailNormalized },
    });

    if (existingUser) {
      // Verify existing user password to prevent security bypasses
      const isPasswordValid = await bcrypt.compare(password, existingUser.password);
      if (!isPasswordValid) {
        return NextResponse.json({ message: "Invalid credentials" }, { status: 401 });
      }

      // Check if they already have a membership in this organization
      const existingMembership = await prisma.organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: existingUser.id,
            organizationId: organization.id
          }
        }
      });

      if (existingMembership) {
        if (existingMembership.status === "APPROVED") {
          return NextResponse.json({ message: "Your access has been approved." }, { status: 200 });
        }
        if (existingMembership.status === "PENDING") {
          return NextResponse.json({ message: "Your access request is pending approval." }, { status: 400 });
        }
        if (existingMembership.status === "REJECTED") {
          // If rejected, resubmit request
          await prisma.organizationMembership.update({
            where: { id: existingMembership.id },
            data: {
              status: "PENDING",
              role: finalOrgRole as any,
              rejectedAt: null,
              rejectionReason: null,
              rejectedByUserIds: null,
              approvedAt: null,
              approvedByUserId: null,
              notificationStatus: "SENT",
              createdAt: new Date()
            }
          });
          return NextResponse.json({ message: "Company already exists. Your access request has been sent to the administrators." }, { status: 201 });
        }
      }

      // No membership exists, create access request PENDING
      await prisma.organizationMembership.create({
        data: {
          userId: existingUser.id,
          organizationId: organization.id,
          role: finalOrgRole as any,
          status: finalStatus,
        }
      });

      if (isNewOrg) {
        return NextResponse.json({ message: "User and Organization created" }, { status: 201 });
      } else {
        return NextResponse.json({ message: "Company already exists. Your access request has been sent to the administrators." }, { status: 201 });
      }
    }

    // 3. Register a completely new user
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Auto-assign global Admin role to specified email
    const globalRole = emailNormalized === "salverutika55@gmail.com" ? "ADMIN" : "USER";

    const user = await prisma.user.create({
      data: {
        email: emailNormalized,
        password: hashedPassword,
        role: globalRole,
      },
    });

    await prisma.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        role: finalOrgRole as any,
        status: finalStatus,
      }
    });

    if (isNewOrg) {
      return NextResponse.json({ message: "User and Organization created" }, { status: 201 });
    } else {
      return NextResponse.json({ message: "Company already exists. Your access request has been sent to the administrators." }, { status: 201 });
    }

  } catch (error: any) {
    console.error("Registration Error:", error);
    return NextResponse.json({ message: "Internal Error" }, { status: 500 });
  }
}
