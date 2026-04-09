import { NextResponse } from "next/server";
import { getApplications, insertApplication } from "@/lib/db";
import { verifyMessage } from "viem";

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
  const bountyId = Number(id);
  const body = await request.json();
  const { address, message, signature } = body;

  if (!address || !message || !signature) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  if (message.length > 2000) {
    return NextResponse.json(
      { error: "Message too long (max 2000 characters)" },
      { status: 400 }
    );
  }

  // Verify the signature matches the claimed address
  const expectedMessage = `Apply to bounty #${bountyId}\n\n${message}`;
  try {
    const valid = await verifyMessage({
      address: address as `0x${string}`,
      message: expectedMessage,
      signature: signature as `0x${string}`,
    });
    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    insertApplication(bountyId, address, message);
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}
