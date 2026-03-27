import { NextRequest } from "next/server";

const BACKEND_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8010";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const res = await fetch(
      `${BACKEND_URL}/api/sessions/${params.id}/report`
    );
    const data = await res.json();
    return Response.json(data);
  } catch {
    return Response.json(
      { success: false, error: "Failed to fetch report" },
      { status: 500 }
    );
  }
}
