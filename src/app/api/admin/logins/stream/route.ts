import { NextResponse } from "next/server";

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const interval = setInterval(() => {
        controller.enqueue(encoder.encode(`event: ping\ndata: {}\n\n`));
      }, 15000);

      const drainEvent = (event: any) => {
        controller.enqueue(encoder.encode(`event: login\ndata: ${JSON.stringify(event)}\n\n`));
      };

      const { loginActivityEmitter } = await import("@/lib/loginStream");
      loginActivityEmitter.on("login", drainEvent);

      const close = () => {
        clearInterval(interval);
        loginActivityEmitter.off("login", drainEvent);
        controller.close();
      };

      (globalThis as any).__adminLoginStream = {
        close,
      };
    },
    cancel() {
      const globalStream = (globalThis as any).__adminLoginStream;
      if (globalStream?.close) globalStream.close();
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      "Connection": "keep-alive",
    },
  });
}
