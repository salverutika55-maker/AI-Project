import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { processTallyChunk } from "@/lib/inngest/functions/process-tally";

// Create an API that serves zero-setup background workers
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processTallyChunk,
  ],
});
