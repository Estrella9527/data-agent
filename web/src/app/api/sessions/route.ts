import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const sessions = await prisma.session.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, role: true },
        },
        dataContexts: {
          select: { dataSourceId: true },
        },
      },
    });

    const data = sessions.map((s) => ({
      ...s,
      dataSourceIds: s.dataContexts.map((dc) => dc.dataSourceId),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Failed to fetch sessions:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to fetch sessions" } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const dataSourceIds: string[] = body.dataSourceIds || [];

    const session = await prisma.session.create({
      data: {
        title: body.title || null,
        state: "IDLE",
        ...(dataSourceIds.length > 0
          ? {
              dataContexts: {
                create: dataSourceIds.map((dsId: string) => ({
                  dataSourceId: dsId,
                })),
              },
            }
          : {}),
      },
      include: {
        dataContexts: { select: { dataSourceId: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...session,
        dataSourceIds: session.dataContexts.map((dc) => dc.dataSourceId),
      },
    });
  } catch (error) {
    console.error("Failed to create session:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to create session" } },
      { status: 500 }
    );
  }
}
