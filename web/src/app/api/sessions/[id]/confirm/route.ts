import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8010";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const res = await fetch(
      `${BACKEND_URL}/api/sessions/${params.id}/confirm`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to confirm plan" },
      { status: 500 }
    );
  }
}
