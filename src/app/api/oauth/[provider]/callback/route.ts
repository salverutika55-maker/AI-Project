import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OAUTH_CONFIGS } from "@/lib/oauth-configs";

export async function GET(
  req: Request,
  { params }: { params: { provider: string } }
) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const internalClientId = searchParams.get("state");
  const provider = params.provider.toUpperCase();

  if (!code || !internalClientId) {
    return NextResponse.json({ error: "Authorization failed" }, { status: 400 });
  }

  const config = OAUTH_CONFIGS[provider];
  const redirectUri = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/oauth/${params.provider}/callback`;

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      throw new Error(tokens.error_description || tokens.error);
    }

    // Save tokens to database
    await prisma.client.update({
      where: { id: internalClientId },
      data: {
        oauthToken: JSON.stringify(tokens),
      },
    });

    // Redirect back to dashboard with success
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL || "http://localhost:3000"}/dashboard?client=${internalClientId}&sync=success`);

  } catch (error: any) {
    console.error(`OAuth Callback Error (${provider}):`, error);
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL || "http://localhost:3000"}/dashboard?error=${encodeURIComponent(error.message)}`);
  }
}
