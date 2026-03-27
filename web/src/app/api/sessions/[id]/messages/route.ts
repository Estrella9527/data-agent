import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const messages = await prisma.message.findMany({
      where: { sessionId: params.id },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ success: true, data: messages });
  } catch {
    return NextResponse.json(
      { success: false, error: { message: "Failed to fetch messages" } },
      { status: 500 }
    );
  }
}
