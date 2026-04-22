import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { name } = await req.json();

    if (!name || name.trim() === "") {
      return NextResponse.json({ message: "Client Name is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const newClient = await prisma.client.create({
      data: {
        name: name.trim(),
        userId: user.id,
      },
    });

    return NextResponse.json({ message: "Client created", client: newClient }, { status: 201 });

  } catch (error) {
    console.error("Client Creation Error:", error);
    return NextResponse.json({ message: "Internal Error" }, { status: 500 });
  }
}
