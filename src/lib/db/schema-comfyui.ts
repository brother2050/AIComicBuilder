import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * ComfyUI 工作流存储表
 * 存储用户创建或导入的 ComfyUI 工作流配置
 */
export const comfyuiWorkflows = sqliteTable("comfyui_workflows", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default(""),
  name: text("name").notNull(),
  description: text("description").default(""),
  /** ComfyUI 工作流 JSON 数据 */
  workflowJson: text("workflow_json").notNull(),
  /** 关联的 ComfyUI Provider ID */
  providerId: text("provider_id").notNull(),
  /** 工作流类型: image, video, custom */
  workflowType: text("workflow_type", {
    enum: ["image", "video", "custom"],
  }).notNull().default("custom"),
  /** 输入字段定义 (JSON schema) */
  inputSchema: text("input_schema").default("{}"),
  /** 输出字段定义 (JSON schema) */
  outputSchema: text("output_schema").default("{}"),
  /** 是否为默认工作流 */
  isDefault: integer("is_default").notNull().default(0),
  /** 使用次数统计 */
  usageCount: integer("usage_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * ComfyUI 生成历史记录表
 * 记录每次使用工作流生成的资产
 */
export const comfyuiGenerations = sqliteTable("comfyui_generations", {
  id: text("id").primaryKey(),
  workflowId: text("workflow_id")
    .notNull()
    .references(() => comfyuiWorkflows.id, { onDelete: "cascade" }),
  /** 关联的 shot asset ID (可选) */
  shotAssetId: text("shot_asset_id"),
  /** 关联的项目 ID (可选) */
  projectId: text("project_id"),
  /** 关联的 shot ID (可选) */
  shotId: text("shot_id"),
  /** 输入参数 (JSON) */
  inputParams: text("input_params").notNull().default("{}"),
  /** 生成的输出文件 URL */
  outputUrls: text("output_urls").notNull().default("[]"),
  /** ComfyUI 任务 ID */
  comfyuiTaskId: text("comfyui_task_id"),
  /** 生成状态 */
  status: text("status", {
    enum: ["pending", "queued", "running", "completed", "failed"],
  }).notNull().default("pending"),
  /** 错误信息 */
  error: text("error"),
  /** 生成耗时 (秒) */
  duration: integer("duration"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

/**
 * ComfyUI Provider 配置表
 * 存储连接到 ComfyUI 实例的配置信息
 */
export const comfyuiProviders = sqliteTable("comfyui_providers", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().default(""),
  name: text("name").notNull(),
  /** ComfyUI 服务器地址 */
  baseUrl: text("base_url").notNull(),
  /** API Key (可选) */
  apiKey: text("api_key").default(""),
  /** 默认工作流 ID */
  defaultWorkflowId: text("default_workflow_id"),
  /** 是否启用 */
  isEnabled: integer("is_enabled").notNull().default(1),
  /** 上次同步时间 */
  lastSyncAt: integer("last_sync_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
