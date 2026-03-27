import { NextRequest, NextResponse } from "next/server";

const AGENT_SERVICE_URL =
  process.env.AGENT_SERVICE_URL || "http://localhost:8010";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; table: string }> }
) {
  try {
    const { id, table } = await params;
    const res = await fetch(
      `${AGENT_SERVICE_URL}/api/sources/database/${id}/tables/${encodeURIComponent(table)}/profile`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to profile table" },
      { status: 500 }
    );
  }
}
