import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { validateStepUp } from "@core-plugins/security/step-up";
import { auditLog } from "@core-plugins/logging";
import { resolveUserId } from "@core/auth/resolve-user";
import { withIpGuard, extractIp } from "@core-plugins/security/ip-guard";

/**
 * POST /api/admin/auth/step-up
 *
 * Accepts { password } and returns { stepUpAt } on success. The client
 * stores stepUpAt in memory and sends it with subsequent requests that
 * require step-up auth. The step-up timestamp is valid for 5 minutes.
 *
 * This route is IP-guarded and requires an active session.
 */
async function handler(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const password = body.password;
  if (typeof password !== "string" || !password) {
    return NextResponse.json({ error: "Password is required" }, { status: 400 });
  }

  const actorId = await resolveUserId(db(), session.user);

  const stepUpAt = await validateStepUp(db(), session.user.id, password);
  if (!stepUpAt) {
    try {
      await auditLog(db(), {
        actorUserId: actorId,
        action: "auth.step_up.failed",
        targetType: "user",
        targetId: actorId,
        ipAddress: extractIp(req),
        userAgent: req.headers.get("user-agent")
      });
    } catch {
      // Audit failures must not break the auth path.
    }
    return NextResponse.json({ error: "Invalid password" }, { status: 403 });
  }

  try {
    await auditLog(db(), {
      actorUserId: actorId,
      action: "auth.step_up.success",
      targetType: "user",
      targetId: actorId,
      ipAddress: extractIp(req),
      userAgent: req.headers.get("user-agent")
    });
  } catch {
    // Audit failures must not break the auth path.
  }

  return NextResponse.json({ stepUpAt });
}

export const POST = withIpGuard(handler);
