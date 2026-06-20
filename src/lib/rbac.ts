import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

/**
 * Enterprise RBAC Utility
 * Validates if a user has the required permission level within an organization.
 */

// Role Hierarchy: Lower index means higher privilege
const ROLE_HIERARCHY: Role[] = [
  Role.SUPER_ADMIN,
  Role.ORG_ADMIN,
  Role.FINANCE_MANAGER,
  Role.ACCOUNTANT,
  Role.STAFF,
  Role.READ_ONLY
];

export async function getUserRoleInOrg(userId: string, organizationId: string): Promise<Role | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      memberships: {
        where: {
          organizationId,
          status: "APPROVED"
        },
        select: { role: true },
        take: 1
      }
    }
  });

  if (!user) return null;
  if (user.role === "ADMIN") return Role.SUPER_ADMIN;

  return user.memberships[0]?.role ?? null;
}

export function hasMinimumRole(userRole: Role, requiredRole: Role): boolean {
  const userRank = ROLE_HIERARCHY.indexOf(userRole);
  const requiredRank = ROLE_HIERARCHY.indexOf(requiredRole);
  
  // If user role is not in hierarchy, deny
  if (userRank === -1) return false;
  
  // Lower rank index means higher privilege (0 is SUPER_ADMIN)
  return userRank <= requiredRank;
}

/**
 * Checks if a user is authorized to perform an action on a client/integration.
 * Returns the Organization ID if authorized, throws an error if not.
 */
export async function authorizeClientAction(userId: string, clientId: string, requiredRole: Role): Promise<{ orgId: string; role: Role }> {
  // 1. Find the client and its organization
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { organizationId: true }
  });

  if (!client) {
    throw new Error("Integration not found");
  }

  // 2. Get user's role in that organization
  const role = await getUserRoleInOrg(userId, client.organizationId);

  if (!role) {
    throw new Error("Access Denied: An approved organization membership is required");
  }

  // 3. Check hierarchy
  if (!hasMinimumRole(role, requiredRole)) {
    throw new Error(`Access Denied: Requires ${requiredRole} level access`);
  }

  return { orgId: client.organizationId, role };
}
