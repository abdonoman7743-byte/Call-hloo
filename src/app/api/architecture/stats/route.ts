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
import { count, desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
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

    const recentCalls = await db
      .select()
      .from(calls)
      .orderBy(desc(calls.createdAt))
      .limit(5);

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
