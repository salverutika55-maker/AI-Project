import { NextResponse } from 'next/server';

export async function GET() {
  try {
    console.log("Enterprise RBAC Data Migration already complete.");
    return NextResponse.json({ success: true, message: "Enterprise RBAC Data Migration already complete." });
  } catch (error: any) {
    console.error("Migration Error:", error);
    return NextResponse.json({ message: "Internal Error" }, { status: 500 });
  }
}
