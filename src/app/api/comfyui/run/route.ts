import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/get-user-id";
import { id as genId } from "@/lib/id";
import { db } from "@/lib/db";
import { comfyuiWorkflows, comfyuiGenerations, comfyuiProviders } from "@/lib/db/schema-comfyui";
import { eq, and } from "drizzle-orm";
import { ComfyUIProvider } from "@/lib/ai/providers/comfyui";
import fs from "node:fs";
import path from "node:path";

/**
 * POST /api/comfyui/run
 * 运行工作流生成图像
 */
export async function POST(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    const body = await request.json();

    const { workflowId, inputParams, shotAssetId, projectId, shotId } = body;

    if (!workflowId || !inputParams) {
      return NextResponse.json(
        { error: "Missing required fields: workflowId, inputParams" },
        { status: 400 }
      );
    }

    // 获取工作流信息
    const [workflow] = await db
      .select()
      .from(comfyuiWorkflows)
      .where(and(eq(comfyuiWorkflows.id, workflowId), eq(comfyuiWorkflows.userId, userId)));

    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    // 获取 Provider 配置
    const [provider] = await db
      .select()
      .from(comfyuiProviders)
      .where(and(eq(comfyuiProviders.id, workflow.providerId), eq(comfyuiProviders.userId, userId)));

    if (!provider) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    // 创建 ComfyUI Provider 实例
    const comfyProvider = new ComfyUIProvider({
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey || undefined,
      uploadDir: process.env.UPLOAD_DIR || "./uploads",
    });

    // 解析工作流 JSON
    let workflowJson: Record<string, unknown>;
    try {
      workflowJson = typeof workflow.workflowJson === "string"
        ? JSON.parse(workflow.workflowJson)
        : workflow.workflowJson;
    } catch {
      return NextResponse.json({ error: "Invalid workflow JSON" }, { status: 400 });
    }

    // 合并输入参数到工作流
    const mergedWorkflow = mergeInputParams(workflowJson, inputParams);

    // 创建生成记录
    const generationId = genId();
    const now = new Date();

    await db.insert(comfyuiGenerations).values({
      id: generationId,
      workflowId,
      shotAssetId: shotAssetId || null,
      projectId: projectId || null,
      shotId: shotId || null,
      inputParams: JSON.stringify(inputParams),
      outputUrls: "[]",
      status: "queued",
      createdAt: now,
    });

    // 增加使用计数
    await db
      .update(comfyuiWorkflows)
      .set({ usageCount: workflow.usageCount + 1 })
      .where(eq(comfyuiWorkflows.id, workflowId));

    // 在后台执行（不阻塞响应）
    executeWorkflow(generationId, comfyProvider, mergedWorkflow, userId).catch(console.error);

    return NextResponse.json({
      generationId,
      status: "queued",
      message: "Workflow execution started",
    });
  } catch (error) {
    console.error("[comfyui/run] POST error:", error);
    return NextResponse.json(
      { error: "Failed to start workflow" },
      { status: 500 }
    );
  }
}

/**
 * 合并输入参数到工作流
 */
function mergeInputParams(
  workflow: Record<string, unknown>,
  inputParams: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...workflow };

  for (const [key, value] of Object.entries(inputParams)) {
    // 查找对应的节点并更新输入
    for (const [nodeId, nodeData] of Object.entries(merged)) {
      if (typeof nodeData === "object" && nodeData !== null && "inputs" in nodeData) {
        const node = nodeData as { inputs: Record<string, unknown> };
        if (key in node.inputs) {
          node.inputs[key] = value;
        }
      }
    }
  }

  return merged;
}

/**
 * 执行工作流（异步）
 */
async function executeWorkflow(
  generationId: string,
  provider: ComfyUIProvider,
  workflow: Record<string, unknown>,
  userId: string
) {
  const startTime = Date.now();

  try {
    // 更新状态为运行中
    await db
      .update(comfyuiGenerations)
      .set({ status: "running" })
      .where(eq(comfyuiGenerations.id, generationId));

    // 执行工作流
    const result = await provider.runWorkflow({ workflow });

    const duration = Math.round((Date.now() - startTime) / 1000);

    // 更新完成状态
    await db
      .update(comfyuiGenerations)
      .set({
        status: "completed",
        outputUrls: JSON.stringify([result.outputPath]),
        duration,
        completedAt: new Date(),
      })
      .where(eq(comfyuiGenerations.id, generationId));

    console.log(`[comfyui/run] Generation ${generationId} completed in ${duration}s`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await db
      .update(comfyuiGenerations)
      .set({
        status: "failed",
        error: errorMessage,
        completedAt: new Date(),
      })
      .where(eq(comfyuiGenerations.id, generationId));

    console.error(`[comfyui/run] Generation ${generationId} failed:`, errorMessage);
  }
}
