import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await prisma.session.findUnique({
      where: { id: params.id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        dataContexts: { select: { dataSourceId: true } },
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: { message: "Session not found" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...session,
        dataSourceIds: session.dataContexts.map((dc) => dc.dataSourceId),
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: { message: "Failed to fetch session" } },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const updateData: Record<string, unknown> = {};

    if (body.title !== undefined) updateData.title = body.title;
    if (body.state !== undefined) updateData.state = body.state;
    if (body.mode !== undefined) updateData.mode = body.mode;
    if (body.pinnedAt !== undefined) updateData.pinnedAt = body.pinnedAt ? new Date(body.pinnedAt) : null;

    // Handle adding data sources to session
    if (body.addDataSourceIds && Array.isArray(body.addDataSourceIds)) {
      for (const dsId of body.addDataSourceIds) {
        await prisma.sessionDataContext.upsert({
          where: {
            sessionId_dataSourceId: {
              sessionId: params.id,
              dataSourceId: dsId,
            },
          },
          create: { sessionId: params.id, dataSourceId: dsId },
          update: {},
        });
      }
    }

    // Handle removing data sources
    if (body.removeDataSourceIds && Array.isArray(body.removeDataSourceIds)) {
      await prisma.sessionDataContext.deleteMany({
        where: {
          sessionId: params.id,
          dataSourceId: { in: body.removeDataSourceIds },
        },
      });
    }

    const session = await prisma.session.update({
      where: { id: params.id },
      data: updateData,
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
  } catch {
    return NextResponse.json(
      { success: false, error: { message: "Failed to update session" } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.session.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, error: { message: "Failed to delete session" } },
      { status: 500 }
    );
  }
}
