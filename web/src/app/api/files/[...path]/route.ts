import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:8010";

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const filePath = params.path.join("/");

  // Block path traversal at proxy level too
  if (filePath.includes("..")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const upstream = await fetch(`${BACKEND}/api/files/${filePath}`);

    if (!upstream.ok) {
      return NextResponse.json(
        { error: upstream.statusText },
        { status: upstream.status }
      );
    }

    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";
    const body = await upstream.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch file from backend" },
      { status: 502 }
    );
  }
}
