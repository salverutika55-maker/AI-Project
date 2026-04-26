import { NextResponse } from "next/server";
import { OAUTH_CONFIGS } from "@/lib/oauth-configs";

export async function GET(
  req: Request,
  { params }: { params: { provider: string } }
) {
  const { searchParams } = new URL(req.url);
  const internalClientId = searchParams.get("clientId");
  const provider = params.provider.toUpperCase();

  const config = OAUTH_CONFIGS[provider];

  if (!config || !config.clientId) {
    return NextResponse.json({ error: `Provider ${provider} not configured` }, { status: 400 });
  }

  if (!internalClientId) {
    return NextResponse.json({ error: "Missing internal clientId" }, { status: 400 });
  }

  const redirectUri = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/oauth/${params.provider}/callback`;
  
  const authUrl = new URL(config.authUrl);
  authUrl.searchParams.append("client_id", config.clientId);
  authUrl.searchParams.append("redirect_uri", redirectUri);
  authUrl.searchParams.append("response_type", "code");
  authUrl.searchParams.append("scope", config.scopes.join(" "));
  authUrl.searchParams.append("state", internalClientId); // We use state to track which client is connecting

  // Zoho specific: access_type offline for refresh tokens
  if (provider === "ZOHO") {
    authUrl.searchParams.append("access_type", "offline");
    authUrl.searchParams.append("prompt", "consent");
  }

  return NextResponse.redirect(authUrl.toString());
}
