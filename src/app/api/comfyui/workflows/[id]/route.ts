import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/get-user-id";
import { db } from "@/lib/db";
import { comfyuiWorkflows, comfyuiGenerations } from "@/lib/db/schema-comfyui";
import { eq, and } from "drizzle-orm";
import { createLogger } from "@/lib/logger";

const logger = createLogger("comfyui:workflows:id");

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/comfyui/workflows/[id]
 * 获取单个工作流详情
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = await getUserIdFromRequest(request);

    const [workflow] = await db
      .select()
      .from(comfyuiWorkflows)
      .where(and(eq(comfyuiWorkflows.id, id), eq(comfyuiWorkflows.userId, userId)));

    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    return NextResponse.json({ workflow });
  } catch (error) {
    logger.error("[comfyui/workflows/[id]] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch workflow" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/comfyui/workflows/[id]
 * 更新工作流
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = await getUserIdFromRequest(request);
    const body = await request.json();

    // 检查工作流是否存在且属于当前用户
    const [existing] = await db
      .select()
      .from(comfyuiWorkflows)
      .where(and(eq(comfyuiWorkflows.id, id), eq(comfyuiWorkflows.userId, userId)));

    if (!existing) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.workflowJson !== undefined) {
      updates.workflowJson = typeof body.workflowJson === "string"
        ? body.workflowJson
        : JSON.stringify(body.workflowJson);
    }
    if (body.providerId !== undefined) updates.providerId = body.providerId;
    if (body.workflowType !== undefined) updates.workflowType = body.workflowType;
    if (body.inputSchema !== undefined) updates.inputSchema = JSON.stringify(body.inputSchema);
    if (body.outputSchema !== undefined) updates.outputSchema = JSON.stringify(body.outputSchema);
    if (body.isDefault !== undefined) updates.isDefault = body.isDefault ? 1 : 0;

    await db
      .update(comfyuiWorkflows)
      .set(updates)
      .where(and(eq(comfyuiWorkflows.id, id), eq(comfyuiWorkflows.userId, userId)));

    const [workflow] = await db
      .select()
      .from(comfyuiWorkflows)
      .where(eq(comfyuiWorkflows.id, id));

    return NextResponse.json({ workflow });
  } catch (error) {
    logger.error("[comfyui/workflows/[id]] PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update workflow" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/comfyui/workflows/[id]
 * 删除工作流
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = await getUserIdFromRequest(request);

    const [existing] = await db
      .select()
      .from(comfyuiWorkflows)
      .where(and(eq(comfyuiWorkflows.id, id), eq(comfyuiWorkflows.userId, userId)));

    if (!existing) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    await db
      .delete(comfyuiWorkflows)
      .where(and(eq(comfyuiWorkflows.id, id), eq(comfyuiWorkflows.userId, userId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[comfyui/workflows/[id]] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete workflow" },
      { status: 500 }
    );
  }
}
