import { NextResponse } from "next/server";
import { getAllBountyMetadata, insertBountyMetadata } from "@/lib/db";

export async function GET() {
  const metadata = getAllBountyMetadata();
  return NextResponse.json(metadata);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { bountyId, title, description, category } = body;

  if (!title || !description || bountyId === undefined) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  try {
    insertBountyMetadata(bountyId, title, description, category || "Other");
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
