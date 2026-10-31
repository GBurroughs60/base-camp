import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { logEmailFailure } from "@/lib/approvalEmail";

// Resend posts here whenever something goes wrong with a *delivered*
// email that the SDK's own send() call never sees -- it reports success
// the moment Resend accepts the message, not once it actually lands. A
// bounce, a spam complaint, or a delayed delivery all surface later,
// asynchronously, only through this webhook. Without it, "email isn't on
// file" (handled by the per-notification fallback-to-Greg already in
// approvalEmail.ts) and "the send call itself failed" (handled by
// logEmailFailure/alertGregOfEmailFailure) were covered, but "it was
// accepted and then silently bounced" was not -- this route closes that
// gap. Logs to the same email_notification_failures table as every other
// notification failure, via logEmailFailure's same alert path (see below).
//
// Resend signs webhook payloads the Svix way (svix-id/svix-timestamp/
// svix-signature headers, HMAC-SHA256 over "id.timestamp.body"). Verified
// with the svix SDK rather than a hand-rolled HMAC check -- same reasoning
// as using a real library for anything signature/crypto-shaped.
//
// One-time setup Greg needs to do, outside this repo: in the Resend
// dashboard, add a webhook endpoint pointing at
// https://base-camp-lovat.vercel.app/api/webhooks/resend, subscribed to at
// least email.bounced (email.complained and email.delivery_delayed are
// also handled here if enabled), then copy the signing secret it gives
// you into this project's RESEND_WEBHOOK_SECRET env var on Vercel.

const HANDLED_TYPES = new Set(["email.bounced", "email.complained", "email.delivery_delayed"]);

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed, same spirit as isAuthorized on the cron routes -- an
    // unconfigured secret means we can't verify authenticity, so don't
    // trust the payload at all rather than silently accepting it.
    console.error("Resend webhook: RESEND_WEBHOOK_SECRET is not set -- rejecting.");
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const rawBody = await req.text();

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    const wh = new Webhook(secret);
    event = wh.verify(rawBody, {
      "svix-id": req.headers.get("svix-id") ?? "",
      "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
      "svix-signature": req.headers.get("svix-signature") ?? "",
    }) as { type?: string; data?: Record<string, unknown> };
  } catch (err) {
    console.error("Resend webhook: signature verification failed", err);
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // Not an error -- Resend sends many event types (email.sent,
  // email.delivered, etc.) to the same endpoint. 200 and move on for
  // anything that isn't one of the three we act on.
  if (!event.type || !HANDLED_TYPES.has(event.type)) {
    return NextResponse.json({ ok: true, note: "unhandled event type" });
  }

  const data = event.data ?? {};
  const to = Array.isArray(data.to) ? (data.to as string[]).join(", ") : String(data.to ?? "unknown");

  // Reuses logEmailFailure (same table, same best-effort direct alert to
  // Greg) rather than a parallel path -- this is still fundamentally "a
  // notification didn't reach anyone," just discovered later than a send
  // error would have been.
  console.warn(`Resend webhook: ${event.type} for ${to}`);
  await logEmailFailure(
    "email_bounce",
    to,
    { resendEventType: event.type, data },
    `Resend reported ${event.type} for ${to}`
  );

  return NextResponse.json({ ok: true });
}
