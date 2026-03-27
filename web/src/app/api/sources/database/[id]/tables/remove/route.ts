import { NextRequest, NextResponse } from "next/server";

const AGENT_SERVICE_URL =
  process.env.AGENT_SERVICE_URL || "http://localhost:8010";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const res = await fetch(
      `${AGENT_SERVICE_URL}/api/sources/database/${id}/tables/remove`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to remove tables" },
      { status: 500 }
    );
  }
}
