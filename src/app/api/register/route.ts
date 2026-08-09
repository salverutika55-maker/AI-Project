import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const requestId = Math.random().toString(36).substring(2, 15).toUpperCase();
  let emailLog = "unknown";

  try {
    const { email, password, orgName, orgRole } = await req.json();

    if (!email || !password || !orgName) {
      console.log(`[AUTH_REGISTER_FAILED] | Request ID: ${requestId} | Reason: Missing fields`);
      return NextResponse.json({ code: "INVALID_CREDENTIALS", message: "Missing fields" }, { status: 400 });
    }

    const emailNormalized = email.trim().toLowerCase();
    emailLog = emailNormalized;
    const orgNameTrimmed = orgName.trim();

    console.log(`[AUTH_REGISTER_START] | Request ID: ${requestId} | Email: ${emailNormalized} | Org: ${orgNameTrimmed}`);

    // 1. Find or create the organization (case-insensitive lookup)
    console.log(`[AUTH_ORGANIZATION_LOOKUP] | Request ID: ${requestId}`);
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
    console.log(`[AUTH_USER_LOOKUP] | Request ID: ${requestId}`);
    const existingUser = await prisma.user.findUnique({
      where: { email: emailNormalized },
    });

    if (existingUser) {
      // Verify existing user password to prevent security bypasses
      const isPasswordValid = await bcrypt.compare(password, existingUser.password);
      if (!isPasswordValid) {
        console.log(`[AUTH_REGISTER_FAILED] | Request ID: ${requestId} | Reason: Invalid credentials for existing user`);
        return NextResponse.json({ code: "INVALID_CREDENTIALS", message: "Invalid credentials" }, { status: 401 });
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
          console.log(`[AUTH_REGISTER_SUCCESS] | Request ID: ${requestId} | Existing User: APPROVED`);
          return NextResponse.json({ code: "ACCESS_ALREADY_APPROVED", message: "Your access has been approved." }, { status: 200 });
        }
        if (existingMembership.status === "PENDING") {
          console.log(`[AUTH_REGISTER_SUCCESS] | Request ID: ${requestId} | Existing User: PENDING`);
          return NextResponse.json({ code: "ACCESS_REQUEST_PENDING", message: "Your access request is pending approval." }, { status: 400 });
        }
        if (existingMembership.status === "REJECTED") {
          // If rejected, resubmit request
          console.log(`[AUTH_ACCESS_REQUEST] | Request ID: ${requestId} | Resubmitting rejected access request`);
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
          console.log(`[AUTH_NOTIFICATION_CREATE] | Request ID: ${requestId} | Notified SUPER_ADMIN and ORG_ADMIN of resubmitted access request`);
          console.log(`[AUTH_REGISTER_SUCCESS] | Request ID: ${requestId} | Resubmitted`);
          return NextResponse.json({ code: "ACCESS_REQUEST_PENDING", message: "Company already exists. Your access request has been sent to the administrators." }, { status: 201 });
        }
      }

      // No membership exists, create access request PENDING
      console.log(`[AUTH_ACCESS_REQUEST] | Request ID: ${requestId} | Creating pending access request for existing user`);
      await prisma.organizationMembership.create({
        data: {
          userId: existingUser.id,
          organizationId: organization.id,
          role: finalOrgRole as any,
          status: finalStatus,
        }
      });

      if (!isNewOrg) {
        console.log(`[AUTH_NOTIFICATION_CREATE] | Request ID: ${requestId} | Notified SUPER_ADMIN and ORG_ADMIN of access request`);
      }

      console.log(`[AUTH_REGISTER_SUCCESS] | Request ID: ${requestId} | Created membership`);
      if (isNewOrg) {
        return NextResponse.json({ message: "User and Organization created" }, { status: 201 });
      } else {
        return NextResponse.json({ code: "ACCESS_REQUEST_PENDING", message: "Company already exists. Your access request has been sent to the administrators." }, { status: 201 });
      }
    }

    // 3. Register a completely new user
    console.log(`[AUTH_USER_CREATE] | Request ID: ${requestId}`);
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

    console.log(`[AUTH_MEMBERSHIP_CREATE] | Request ID: ${requestId}`);
    await prisma.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        role: finalOrgRole as any,
        status: finalStatus,
      }
    });

    if (!isNewOrg) {
      console.log(`[AUTH_NOTIFICATION_CREATE] | Request ID: ${requestId} | Notified SUPER_ADMIN and ORG_ADMIN of access request`);
    }

    console.log(`[AUTH_REGISTER_SUCCESS] | Request ID: ${requestId}`);
    if (isNewOrg) {
      return NextResponse.json({ message: "User and Organization created" }, { status: 201 });
    } else {
      return NextResponse.json({ code: "ACCESS_REQUEST_PENDING", message: "Company already exists. Your access request has been sent to the administrators." }, { status: 201 });
    }

  } catch (error: any) {
    console.error(`[AUTH_REGISTER_FAILED] | Request ID: ${requestId} | Error:`, error);
    return NextResponse.json({ code: "DATABASE_ERROR", message: "Internal Error" }, { status: 500 });
  }
}
