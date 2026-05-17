import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { verify } from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "default_secret_for_dev_only";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Authenticate the connector
        const authHeader = request.headers.get("authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          throw new Error("Authentication required");
        }

        const token = authHeader.split(" ")[1];
        let clientId: string;
        try {
          const decoded = verify(token, JWT_SECRET) as { clientId: string };
          clientId = decoded.clientId;
        } catch (e) {
          throw new Error("Invalid token");
        }

        return {
          allowedContentTypes: ['application/xml', 'text/xml', 'application/json'],
          tokenPayload: JSON.stringify({ clientId }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Trigger Inngest queue processing when upload completes
        const { clientId } = JSON.parse(tokenPayload || '{}');
        
        try {
          // Dynamic import of inngest to prevent client-side circular dependencies
          const { inngest } = await import('@/lib/inngest/client');
          
          await inngest.send({
            name: 'sync/tally.chunk.uploaded',
            data: {
              clientId,
              blobUrl: blob.url,
              alterId: 0, // This should ideally be passed in the metadata or parsed from the blob
            },
          });
          
          console.log(`[UploadCompleted] Fired Inngest event for ${clientId}. Blob: ${blob.url}`);
        } catch (error) {
          console.error("Could not trigger Inngest event", error);
        }
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }, // The webhook will retry 5 times waiting for a 200
    );
  }
}
