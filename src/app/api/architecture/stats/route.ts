import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  calls,
  friends,
  messages,
  signalingEvents,
  users,
} from "@/db/schema";
import { ensureSeeded } from "@/lib/seed";
import { authenticateRequest } from "@/lib/auth";
import { count, desc, eq, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await ensureSeeded();

    const [[uCount], [fCount], [mCount], [cCount], [sCount], [onlineCount]] =
      await Promise.all([
        db.select({ value: count() }).from(users),
        db.select({ value: count() }).from(friends),
        db.select({ value: count() }).from(messages),
        db.select({ value: count() }).from(calls),
        db.select({ value: count() }).from(signalingEvents),
        db
          .select({ value: count() })
          .from(users)
          .where(eq(users.presenceStatus, "online")),
      ]);

    // Call rows carry user ids and WebRTC signaling data, so only the
    // signed-in user's own calls are returned (never other users' calls).
    const auth = await authenticateRequest(req);
    const recentCalls = auth
      ? (
          await db
            .select()
            .from(calls)
            .where(or(eq(calls.callerId, auth.sub), eq(calls.calleeId, auth.sub)))
            .orderBy(desc(calls.createdAt))
            .limit(5)
        ).map(({ signalingJson: _signalingJson, ...rest }) => {
          void _signalingJson;
          return rest;
        })
      : [];

    return NextResponse.json({
      metrics: {
        users: uCount?.value ?? 0,
        friends: fCount?.value ?? 0,
        messages: mCount?.value ?? 0,
        calls: cCount?.value ?? 0,
        signalingPackets: sCount?.value ?? 0,
        onlineUsers: onlineCount?.value ?? 0,
      },
      iceConfig: {
        stun: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
        ],
        turn: "turns:turn.oboud.app:5349?transport=tcp (Coturn TLS Fallback)",
        encryption: "DTLS-SRTP End-to-End Media",
        authHandshake: "JWT HS256 + bcryptjs (cost=10)",
      },
      recentCalls,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("GET /api/architecture/stats error:", error);
    return NextResponse.json(
      { error: "تعذر قراءة مقاييس المعمارية" },
      { status: 500 }
    );
  }
}
