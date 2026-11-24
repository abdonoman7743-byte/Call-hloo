import { db } from "@/db";
import { signalingEvents, users } from "@/db/schema";
import { authenticateRequest } from "@/lib/auth";
import { and, asc, eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await authenticateRequest(req);
  if (!auth) {
    return new Response(
      JSON.stringify({ error: "Unauthorized JWT handshake" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (eventName: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`
            )
          );
        } catch {
          closed = true;
        }
      };

      // Refresh lastSeenAt without overwriting user-chosen 'unavailable'/'offline' or active 'in_call'
      try {
        const [me] = await db
          .select({ presenceStatus: users.presenceStatus })
          .from(users)
          .where(eq(users.id, auth.sub))
          .limit(1);

        const keepManual =
          me?.presenceStatus === "unavailable" ||
          me?.presenceStatus === "busy" ||
          me?.presenceStatus === "in_call" ||
          me?.presenceStatus === "offline";

        await db
          .update(users)
          .set({
            ...(keepManual ? {} : { presenceStatus: "online" }),
            lastSeenAt: new Date(),
          })
          .where(eq(users.id, auth.sub));
      } catch {
        // ignore non-fatal update
      }

      sendEvent("connected", {
        userId: auth.sub,
        username: auth.username,
        handshake: "JWT HS256 Verified",
        stunServers: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
        ],
        turnFallbackConfigured: true,
        connectedAt: new Date().toISOString(),
      });

      const startedAt = Date.now();
      const maxDurationMs = 24000;

      const onAbort = () => {
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      req.signal.addEventListener("abort", onAbort);

      while (!closed && Date.now() - startedAt < maxDurationMs) {
        try {
          const pending = await db
            .select()
            .from(signalingEvents)
            .where(
              and(
                eq(signalingEvents.toUserId, auth.sub),
                eq(signalingEvents.delivered, false)
              )
            )
            .orderBy(asc(signalingEvents.createdAt))
            .limit(30);

          if (pending.length > 0) {
            await db
              .update(signalingEvents)
              .set({ delivered: true })
              .where(
                inArray(
                  signalingEvents.id,
                  pending.map((e) => e.id)
                )
              );

            for (const ev of pending) {
              sendEvent("signal", ev);
            }
          }
        } catch {
          // ignore transient poll error
        }

        await new Promise((resolve) => setTimeout(resolve, 600));
      }

      req.signal.removeEventListener("abort", onAbort);
      if (!closed) {
        closed = true;
        try {
          controller.close();
        } catch {
          // ignore
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
