import { NextRequest, NextResponse } from "next/server";

const AGENT_SERVICE_URL =
  process.env.AGENT_SERVICE_URL || "http://localhost:8010";

export async function GET(req: NextRequest) {
  try {
    const type = req.nextUrl.searchParams.get("type");
    const url = type
      ? `${AGENT_SERVICE_URL}/api/sources?type=${type}`
      : `${AGENT_SERVICE_URL}/api/sources`;

    const res = await fetch(url);
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch sources" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // Forward multipart form data to backend
    const formData = await req.formData();

    const res = await fetch(`${AGENT_SERVICE_URL}/api/sources/file`, {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to upload source" },
      { status: 500 }
    );
  }
}
