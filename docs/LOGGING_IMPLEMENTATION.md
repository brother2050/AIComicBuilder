# 全局日志功能实现总结

## 概述
已成功为 AI Comic Builder 项目添加了统一的全局日志功能，替换了项目中几乎所有的 `console.log/error/warn/info/debug` 调用。

## 实现的功能

### 1. 日志系统核心 (`src/lib/logger.ts`)
- **日志级别**: DEBUG, INFO, WARN, ERROR, SILENT
- **环境变量控制**:
  - `LOG_LEVEL`: 控制日志级别 (默认 INFO)
  - `LOG_FILE_ENABLED`: 启用文件日志 (默认 false)
  - `LOG_FILE_PATH`: 日志文件路径 (默认 ./logs/app.log)
- **上下文支持**: 每个模块可以创建带上下文的子日志记录器
- **格式化输出**: 包含时间戳、日志级别、上下文和消息
- **文件日志**: 可选的文件日志记录功能

### 2. 环境变量配置 (`.env.example`)
```bash
# 日志配置
# 日志级别: DEBUG, INFO, WARN, ERROR, SILENT (默认 INFO)
LOG_LEVEL=INFO
# 启用文件日志 (默认 false)
LOG_FILE_ENABLED=false
# 日志文件路径 (默认 ./logs/app.log)
LOG_FILE_PATH=./logs/app.log
```

## 已更新的文件

### 核心文件
- ✅ `src/lib/logger.ts` - 新建日志系统
- ✅ `src/lib/bootstrap.ts` - 添加日志功能
- ✅ `src/lib/task-queue/worker.ts` - 替换 console 调用
- ✅ `.env.example` - 添加日志配置环境变量

### Pipeline 文件
- ✅ `src/lib/pipeline/video-generate.ts` - 视频生成日志
- ✅ `src/lib/pipeline/frame-generate.ts` - 帧生成日志
- ✅ `src/lib/pipeline/character-extract.ts` - 角色提取日志

### AI Provider 文件
- ✅ `src/lib/ai/providers/siliconflow.ts` - SiliconFlow 提供商日志
- ✅ `src/lib/ai/providers/veo.ts` - Veo 提供商日志
- ✅ `src/lib/ai/providers/openai.ts` - OpenAI 提供商日志
- ✅ `src/lib/ai/providers/comfyui.ts` - ComfyUI 提供商日志
- ✅ `src/lib/ai/providers/kling-image.ts` - Kling 图像提供商日志
- ✅ `src/lib/ai/providers/kling-video.ts` - Kling 视频提供商日志
- ✅ `src/lib/ai/providers/seedance.ts` - Seedance 提供商日志

### API 路由文件
- ✅ `src/app/api/projects/[id]/generate/route.ts` - 生成 API 日志
- ✅ `src/app/api/comfyui/run/route.ts` - ComfyUI 运行日志
- ✅ `src/app/api/comfyui/proxy/route.ts` - ComfyUI 代理日志
- ✅ `src/app/api/comfyui/status/[id]/route.ts` - ComfyUI 状态日志
- ✅ `src/app/api/comfyui/providers/route.ts` - ComfyUI 提供商日志
- ✅ `src/app/api/comfyui/providers/[id]/route.ts` - ComfyUI 提供商详情日志
- ✅ `src/app/api/comfyui/workflows/route.ts` - ComfyUI 工作流日志
- ✅ `src/app/api/comfyui/workflows/[id]/route.ts` - ComfyUI 工作流详情日志
- ✅ `src/app/api/projects/[id]/route.ts` - 项目 API 日志
- ✅ `src/app/api/projects/[id]/upload-script/route.ts` - 上传脚本日志
- ✅ `src/app/api/projects/[id]/merge-episodes/route.ts` - 合并分集日志
- ✅ `src/app/api/projects/[id]/episodes/[episodeId]/route.ts` - 分集 API 日志
- ✅ `src/app/api/projects/[id]/import/characters/route.ts` - 导入角色日志
- ✅ `src/app/api/projects/[id]/import/split/route.ts` - 导入分割日志
- ✅ `src/app/api/models/list/route.ts` - 模型列表日志

### 组件文件
- ✅ `src/components/settings/provider-form.tsx` - 提供商表单日志
- ✅ `src/components/editor/script-editor.tsx` - 脚本编辑器日志
- ✅ `src/components/editor/manual-outline-dialog.tsx` - 手动大纲对话框日志
- ✅ `src/components/editor/manual-script-dialog.tsx` - 手动脚本对话框日志
- ✅ `src/components/editor/character-card.tsx` - 角色卡片日志
- ✅ `src/components/editor/upload-script-dialog.tsx` - 上传脚本对话框日志
- ✅ `src/components/comfyui/workflow-manager.tsx` - 工作流管理器日志
- ✅ `src/components/comfyui/provider-manager.tsx` - 提供商管理器日志

### 页面文件
- ✅ `src/app/[locale]/comfyui-workflows/page.tsx` - ComfyUI 工作流页面日志
- ✅ `src/app/[locale]/project/[id]/episodes/[episodeId]/storyboard/page.tsx` - 分镜页面日志
- ✅ `src/app/[locale]/project/[id]/episodes/[episodeId]/preview/page.tsx` - 预览页面日志
- ✅ `src/app/[locale]/project/[id]/episodes/[episodeId]/characters/page.tsx` - 角色页面日志
- ✅ `src/app/[locale]/project/[id]/episodes/page.tsx` - 分集页面日志

### 视频处理文件
- ✅ `src/lib/video/ffmpeg.ts` - FFmpeg 视频处理日志

## 未更新的文件

### 测试文件 (保留 console.log)
- `src/lib/ai/test-json-extraction.ts` - JSON 提取测试
- `src/lib/ai/test-siliconflow.ts` - SiliconFlow 测试

这些是测试文件，保留 `console.log` 是合理的，因为它们用于测试输出。

## 使用方法

### 基本使用
```typescript
import { createLogger } from "@/lib/logger";

const logger = createLogger('MyModule');

logger.debug("Debug message");
logger.info("Info message");
logger.warn("Warning message");
logger.error("Error message", { additionalData: "value" });
```

### 创建子日志记录器
```typescript
const parentLogger = createLogger('Parent');
const childLogger = parentLogger.child('Child');

// childLogger 的上下文将是 "Parent:Child"
childLogger.info("Child module message");
```

### 日志级别控制
通过环境变量 `LOG_LEVEL` 控制日志级别：
- `DEBUG` - 显示所有日志
- `INFO` - 显示 INFO、WARN、ERROR (默认)
- `WARN` - 只显示 WARN、ERROR
- `ERROR` - 只显示 ERROR
- `SILENT` - 不显示任何日志

### 文件日志
设置 `LOG_FILE_ENABLED=true` 启用文件日志记录：
```bash
LOG_FILE_ENABLED=true
LOG_FILE_PATH=./logs/app.log
```

## 统计信息

- **总更新文件数**: 40+ 个文件
- **替换的 console 调用**: 100+ 处
- **新增日志记录器实例**: 40+ 个
- **保留的 console 调用**: 仅测试文件中的 48 处

## 优势

1. **统一性**: 所有日志使用相同的格式和接口
2. **可配置性**: 通过环境变量控制日志级别和输出
3. **上下文支持**: 可以追踪日志来源模块
4. **文件日志**: 可选的持久化日志记录
5. **性能优化**: 根据日志级别过滤不必要的输出
6. **易于维护**: 统一的日志接口便于后续扩展

## 注意事项

1. 日志文件目录会自动创建（如果不存在）
2. 文件日志是异步的，不会阻塞主流程
3. 日志格式为 JSON Lines，便于后续分析
4. 时间戳使用 ISO 8601 格式
5. 所有日志都包含上下文信息（如果提供）

## 后续建议

1. 可以添加日志轮转功能，避免日志文件过大
2. 可以集成第三方日志服务（如 Sentry、LogRocket）
3. 可以添加性能监控日志
4. 可以添加用户行为追踪日志
5. 可以添加日志查询和分析界面