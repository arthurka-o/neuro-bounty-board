import { NextResponse } from "next/server";
import { getApplications, insertApplication } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const apps = getApplications(Number(id));
  return NextResponse.json(apps);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { address, message } = body;

  if (!address || !message) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  try {
    insertApplication(Number(id), address, message);
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
