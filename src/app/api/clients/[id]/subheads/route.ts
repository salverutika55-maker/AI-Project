import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  
  try {
    const subheads = await prisma.customSubHead.findMany({
      where: { clientId },
      orderBy: { order: "asc" }
    });
    return NextResponse.json(subheads);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch subheads" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const { name, headName } = await req.json();

  if (!name || !headName) {
    return NextResponse.json({ error: "Name and Head Name are required" }, { status: 400 });
  }

  try {
    const subhead = await prisma.customSubHead.create({
      data: {
        clientId,
        name,
        headName,
      }
    });
    return NextResponse.json(subhead);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: "This item already exists under this head" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create subhead" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const { searchParams } = new URL(req.url);
  const subheadId = searchParams.get("id");

  if (!subheadId) {
    return NextResponse.json({ error: "Subhead ID is required" }, { status: 400 });
  }

  try {
    // 1. Fetch the subhead to know its name
    const subhead = await prisma.customSubHead.findUnique({
      where: { id: subheadId }
    });

    if (!subhead) {
      return NextResponse.json({ error: "Subhead not found" }, { status: 404 });
    }

    // 2. Delete the subhead
    await prisma.customSubHead.delete({
      where: { id: subheadId }
    });

    // 3. Clean up related mappings and values to prevent ghost data
    // We only delete if the name matches exactly the sectorHead/headName
    await prisma.pNLMapping.deleteMany({
      where: { clientId, sectorHead: subhead.name }
    });

    await prisma.pNLValue.deleteMany({
      where: { clientId, headName: subhead.name }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete Error:", error);
    return NextResponse.json({ error: "Failed to delete subhead" }, { status: 500 });
  }
}
