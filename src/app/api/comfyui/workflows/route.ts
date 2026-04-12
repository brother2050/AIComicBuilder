import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/get-user-id";
import { id as genId } from "@/lib/id";
import { db } from "@/lib/db";
import { comfyuiWorkflows } from "@/lib/db/schema-comfyui";
import { eq, and } from "drizzle-orm";

/**
 * GET /api/comfyui/workflows
 * 获取用户的所有工作流
 */
export async function GET(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);

    const workflows = await db
      .select()
      .from(comfyuiWorkflows)
      .where(eq(comfyuiWorkflows.userId, userId))
      .orderBy(comfyuiWorkflows.createdAt);

    return NextResponse.json({ workflows });
  } catch (error) {
    console.error("[comfyui/workflows] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch workflows" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/comfyui/workflows
 * 创建新工作流
 */
export async function POST(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    const body = await request.json();

    const { name, description, workflowJson, providerId, workflowType, inputSchema, outputSchema } = body;

    if (!name || !workflowJson || !providerId) {
      return NextResponse.json(
        { error: "Missing required fields: name, workflowJson, providerId" },
        { status: 400 }
      );
    }

    const id = genId();
    const now = new Date();

    await db.insert(comfyuiWorkflows).values({
      id,
      userId,
      name,
      description: description || "",
      workflowJson: typeof workflowJson === "string" ? workflowJson : JSON.stringify(workflowJson),
      providerId,
      workflowType: workflowType || "custom",
      inputSchema: inputSchema ? JSON.stringify(inputSchema) : "{}",
      outputSchema: outputSchema ? JSON.stringify(outputSchema) : "{}",
      createdAt: now,
      updatedAt: now,
    });

    const [workflow] = await db
      .select()
      .from(comfyuiWorkflows)
      .where(eq(comfyuiWorkflows.id, id));

    return NextResponse.json({ workflow }, { status: 201 });
  } catch (error) {
    console.error("[comfyui/workflows] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create workflow" },
      { status: 500 }
    );
  }
}
