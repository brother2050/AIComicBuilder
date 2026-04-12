import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/get-user-id";
import { id as genId } from "@/lib/id";
import { db } from "@/lib/db";
import { comfyuiProviders } from "@/lib/db/schema-comfyui";
import { eq } from "drizzle-orm";

/**
 * GET /api/comfyui/providers
 * 获取用户的所有 ComfyUI Provider 配置
 */
export async function GET(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);

    const providers = await db
      .select()
      .from(comfyuiProviders)
      .where(eq(comfyuiProviders.userId, userId));

    return NextResponse.json({ providers });
  } catch (error) {
    console.error("[comfyui/providers] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch providers" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/comfyui/providers
 * 创建新的 ComfyUI Provider 配置
 */
export async function POST(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    const body = await request.json();

    const { name, baseUrl, apiKey } = body;

    if (!name || !baseUrl) {
      return NextResponse.json(
        { error: "Missing required fields: name, baseUrl" },
        { status: 400 }
      );
    }

    const id = genId();
    const now = new Date();

    await db.insert(comfyuiProviders).values({
      id,
      userId,
      name,
      baseUrl,
      apiKey: apiKey || "",
      isEnabled: 1,
      createdAt: now,
      updatedAt: now,
    });

    const [provider] = await db
      .select()
      .from(comfyuiProviders)
      .where(eq(comfyuiProviders.id, id));

    return NextResponse.json({ provider }, { status: 201 });
  } catch (error) {
    console.error("[comfyui/providers] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create provider" },
      { status: 500 }
    );
  }
}
