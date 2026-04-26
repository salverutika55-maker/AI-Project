import { NextResponse } from "next/server";
import { OAUTH_CONFIGS } from "@/lib/oauth-configs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider: providerParam } = await params;
    const { searchParams, host, protocol } = new URL(req.url);
    const internalClientId = searchParams.get("clientId");
    const provider = providerParam.toUpperCase();

    const config = OAUTH_CONFIGS[provider];

    if (!config) {
      return NextResponse.json({ error: `Provider ${provider} not supported` }, { status: 400 });
    }

    if (!config.clientId || !config.clientSecret) {
       // Debugging info: Check if env vars are present
       return NextResponse.json({ 
         error: `Environment variables for ${provider} are missing on the server.`,
         details: "Ensure QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET are set in Vercel."
       }, { status: 500 });
    }

    if (!internalClientId) {
      return NextResponse.json({ error: "Missing internal clientId" }, { status: 400 });
    }

    // Dynamically determine the base URL (handles Vercel and local)
    const baseUrl = process.env.NEXTAUTH_URL || `${protocol}//${host}`;
    const redirectUri = `${baseUrl}/api/oauth/${params.provider}/callback`;
    
    const authUrl = new URL(config.authUrl);
    authUrl.searchParams.append("client_id", config.clientId);
    authUrl.searchParams.append("redirect_uri", redirectUri);
    authUrl.searchParams.append("response_type", "code");
    authUrl.searchParams.append("scope", config.scopes.join(" "));
    authUrl.searchParams.append("state", internalClientId);

    if (provider === "ZOHO") {
      authUrl.searchParams.append("access_type", "offline");
      authUrl.searchParams.append("prompt", "consent");
    }

    return NextResponse.redirect(authUrl.toString());
  } catch (error: any) {
    console.error("OAuth Initiation Error:", error);
    return NextResponse.json({ 
      error: "Internal Server Error during OAuth initiation", 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}
