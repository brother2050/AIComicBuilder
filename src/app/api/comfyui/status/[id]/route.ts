import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/get-user-id";
import { db } from "@/lib/db";
import { comfyuiGenerations } from "@/lib/db/schema-comfyui";
import { eq, and } from "drizzle-orm";
import { createLogger } from "@/lib/logger";

const logger = createLogger("comfyui:status:id");

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/comfyui/status/[id]
 * 获取生成任务状态
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = await getUserIdFromRequest(request);

    const [generation] = await db
      .select()
      .from(comfyuiGenerations)
      .where(eq(comfyuiGenerations.id, id));

    if (!generation) {
      return NextResponse.json({ error: "Generation not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: generation.id,
      status: generation.status,
      outputUrls: JSON.parse(generation.outputUrls || "[]"),
      error: generation.error,
      duration: generation.duration,
      createdAt: generation.createdAt,
      completedAt: generation.completedAt,
    });
  } catch (error) {
    logger.error("[comfyui/status/[id]] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch status" },
      { status: 500 }
    );
  }
}
