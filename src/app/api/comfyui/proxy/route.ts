import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";

const logger = createLogger("comfyui:proxy");

interface ProxyRequest {
  baseUrl: string;
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * POST /api/comfyui/proxy
 * 代理 ComfyUI API 请求，解决 CORS 问题
 */
export async function POST(request: Request) {
  try {
    const { baseUrl, path, method = "GET", headers = {}, body }: ProxyRequest =
      await request.json();

    // 构建目标 URL
    const targetUrl = `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

    // 转发请求到 ComfyUI
    const response = await fetch(targetUrl, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    // 获取响应数据
    const data = await response.text();

    // 返回响应给前端
    return new NextResponse(data, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (error) {
    logger.error("[comfyui/proxy] Error:", error);
    return NextResponse.json(
      { error: "Proxy request failed" },
      { status: 500 }
    );
  }
}
