import { NextResponse } from "next/server";

export async function POST(req: Request) {
  // TODO: Verify webhook signature
  const body = await req.text();
  const event = req.headers.get("x-github-event");

  console.log(`Received GitHub webhook: ${event}`);

  return NextResponse.json({ received: true });
}
