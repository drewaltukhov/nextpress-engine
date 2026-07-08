import { NextResponse } from "next/server";
import { ENGINE_VERSION } from "@core/version";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    engine: "nextpress",
    version: ENGINE_VERSION,
    timestamp: new Date().toISOString()
  });
}
