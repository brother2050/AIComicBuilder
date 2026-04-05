import { db } from "@/lib/db";
import { moodBoardImages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const { imageId } = await params;
  await db.delete(moodBoardImages).where(eq(moodBoardImages.id, imageId));
  return NextResponse.json({ ok: true });
}
