import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/get-user-id";
import { db } from "@/lib/db";
import { comfyuiProviders } from "@/lib/db/schema-comfyui";
import { eq, and } from "drizzle-orm";
import { createLogger } from "@/lib/logger";

const logger = createLogger("comfyui:providers:id");

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/comfyui/providers/[id]
 * 获取单个 Provider 配置
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = await getUserIdFromRequest(request);

    const [provider] = await db
      .select()
      .from(comfyuiProviders)
      .where(and(eq(comfyuiProviders.id, id), eq(comfyuiProviders.userId, userId)));

    if (!provider) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    return NextResponse.json({ provider });
  } catch (error) {
    logger.error("[comfyui/providers/[id]] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch provider" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/comfyui/providers/[id]
 * 更新 Provider 配置
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = await getUserIdFromRequest(request);
    const body = await request.json();

    const [existing] = await db
      .select()
      .from(comfyuiProviders)
      .where(and(eq(comfyuiProviders.id, id), eq(comfyuiProviders.userId, userId)));

    if (!existing) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) updates.name = body.name;
    if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl;
    if (body.apiKey !== undefined) updates.apiKey = body.apiKey;
    if (body.isEnabled !== undefined) updates.isEnabled = body.isEnabled ? 1 : 0;
    if (body.defaultWorkflowId !== undefined) updates.defaultWorkflowId = body.defaultWorkflowId;

    await db
      .update(comfyuiProviders)
      .set(updates)
      .where(and(eq(comfyuiProviders.id, id), eq(comfyuiProviders.userId, userId)));

    const [provider] = await db
      .select()
      .from(comfyuiProviders)
      .where(eq(comfyuiProviders.id, id));

    return NextResponse.json({ provider });
  } catch (error) {
    logger.error("[comfyui/providers/[id]] PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update provider" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/comfyui/providers/[id]
 * 删除 Provider 配置
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = await getUserIdFromRequest(request);

    const [existing] = await db
      .select()
      .from(comfyuiProviders)
      .where(and(eq(comfyuiProviders.id, id), eq(comfyuiProviders.userId, userId)));

    if (!existing) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    await db
      .delete(comfyuiProviders)
      .where(and(eq(comfyuiProviders.id, id), eq(comfyuiProviders.userId, userId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[comfyui/providers/[id]] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete provider" },
      { status: 500 }
    );
  }
}
