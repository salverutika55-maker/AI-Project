import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { logSecurityEvent } from "@/lib/logger";
import { recordSuccessfulLoginAudit } from "@/lib/loginAuditPipeline";
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req: any) {
        if (!credentials?.email || !credentials?.password) {
          await logSecurityEvent(null, "LOGIN_FAILED", undefined, `Missing credentials for login attempt`, req);
          throw new Error("Missing credentials");
        }
        
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) {
          await logSecurityEvent(null, "LOGIN_FAILED", undefined, `Failed login attempt for ${credentials.email}`, req);
          throw new Error("No user found with this email");
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!isPasswordValid) {
          await logSecurityEvent(user.id, "LOGIN_FAILED", undefined, `Invalid password attempt for ${credentials.email}`, req);
          throw new Error("Invalid password");
        }
        
        const { loginActivity, failures } = await recordSuccessfulLoginAudit({
          userId: user.id,
          email: user.email,
          userRole: user.role,
          req,
        });

        if (failures.length > 0) {
          console.error("Login audit pipeline partial failure", { email: user.email, failures });
        }

        if (loginActivity) {
          try {
            const { loginActivityEmitter } = await import("@/lib/loginStream");
            loginActivityEmitter.emit("login", {
              id: loginActivity.id,
              email: loginActivity.email,
              userRole: loginActivity.userRole,
              loginTime: loginActivity.loginTime.toISOString(),
              ipAddress: loginActivity.ipAddress,
              userAgent: loginActivity.userAgent,
            });
          } catch (emitError) {
            console.error("Failed to emit login activity event:", emitError);
          }
        }

        return {
          id: user.id,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
