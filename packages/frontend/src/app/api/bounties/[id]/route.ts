import { NextResponse } from "next/server";
import { getBountyMetadata } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const metadata = getBountyMetadata(Number(id));

  if (!metadata) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(metadata);
}
