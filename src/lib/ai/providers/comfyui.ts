import type { AIProvider, ImageOptions, TextOptions, VideoProvider, VideoGenerateParams, VideoGenerateResult } from "../types";
import fs from "node:fs";
import path from "node:path";
import { id as genId } from "@/lib/id";
import { db } from "@/lib/db";
import { comfyuiWorkflows, comfyuiProviders } from "@/lib/db/schema-comfyui";
import { eq } from "drizzle-orm";
import { createLogger } from "@/lib/logger";

const logger = createLogger(path.basename("src/lib/ai/providers/comfyui.ts", ".ts"));

interface ComfyUIImageResult {
  filePath: string;
  outputPath: string;
}

/**
 * ComfyUI API 响应类型
 */
interface ComfyUIPromptResponse {
  prompt_id: string;
  number: number;
  node_errors?: Record<string, { errors: string[] }>;
}

interface ComfyUIHistoryItem {
  outputs: Record<string, unknown>;
  status: {
    exec_time: number;
    status_str: string;
    errors?: string[];
  };
}

interface ComfyUIHistory {
  [promptId: string]: ComfyUIHistoryItem;
}

/**
 * ComfyUI WebSocket 消息类型
 */
interface ComfyUISocketMessage {
  type: string;
  data?: {
    name?: string;
    filename?: string;
    subfolder?: string;
    type?: string;
    prompt_id?: string;
    node?: string;
    output?: unknown;
  };
  data_i?: number;
  prompt_id?: string;
}

export class ComfyUIProvider implements AIProvider, VideoProvider {
  private baseUrl: string;
  private apiKey: string;
  private uploadDir: string;
  private model: string;
  private workflowId?: string;
  private currentPromptId?: string; // 用于追踪当前执行

  constructor(params?: {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    uploadDir?: string;
    workflowId?: string;
  }) {
    this.baseUrl = (params?.baseUrl || "http://127.0.0.1:8188").replace(/\/+$/, "");
    this.apiKey = params?.apiKey || "";
    this.model = params?.model || "";
    this.uploadDir = params?.uploadDir || process.env.UPLOAD_DIR || "./uploads";
    this.workflowId = params?.workflowId;
  }

  /**
   * 设置工作流 ID
   */
  setWorkflow(workflowId: string) {
    this.workflowId = workflowId;
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async generateText(prompt: string, options?: TextOptions): Promise<string> {
    // ComfyUI 主要用于图像生成，文本生成需要配置 LLM 节点
    // 这里提供一个基础的文本生成接口，实际使用时需要配置相应的工作流
    logger.debug("Text generation not natively supported, use workflow API");
    return prompt;
  }

  async generateImage(
    prompt: string,
    options?: ImageOptions
  ): Promise<string> {
    logger.debug("generateImage called with baseUrl: ${this.baseUrl}, workflowId: ${this.workflowId}");
    const result = await this.runWorkflow({
      prompt,
      model: options?.model || this.model,
      inputImages: options?.referenceImages,
      workflowId: this.workflowId,
    });
    return result.filePath;
  }

  /**
   * Generate video using ComfyUI workflow
   */
  async generateVideo(params: VideoGenerateParams): Promise<VideoGenerateResult> {
    logger.debug("generateVideo called with baseUrl: ${this.baseUrl}, workflowId: ${this.workflowId}");

    const result = await this.runVideoWorkflow({
      prompt: params.prompt,
      initialImage: "initialImage" in params ? params.initialImage : undefined,
      firstFrame: "firstFrame" in params ? params.firstFrame : undefined,
      lastFrame: "lastFrame" in params ? params.lastFrame : undefined,
      workflowId: this.workflowId,
    });

    return {
      filePath: result.filePath,
      lastFrameUrl: result.lastFrameUrl,
    };
  }

  /**
   * 执行 ComfyUI 工作流
   */
  async runWorkflow(params: {
    prompt?: string;
    workflow?: Record<string, unknown>;
    model?: string;
    inputImages?: string[];
    extraData?: Record<string, unknown>;
    workflowId?: string;
  }): Promise<ComfyUIImageResult> {
    const { prompt, workflow, model, inputImages = [], extraData = {}, workflowId } = params;

    logger.debug("runWorkflow: this.baseUrl=${this.baseUrl}, workflowId=${workflowId}");

    // 获取工作流数据：优先使用传入的工作流 > 数据库工作流 > 默认工作流
    let workflowData = workflow;
    let effectiveBaseUrl = this.baseUrl;
    let effectiveApiKey = this.apiKey;
    
    if (!workflowData) {
      if (workflowId) {
        try {
          // 从数据库获取工作流
          const [wf] = await db
            .select()
            .from(comfyuiWorkflows)
            .where(eq(comfyuiWorkflows.id, workflowId));
          
          if (wf) {
            workflowData = JSON.parse(wf.workflowJson);
            // 标准化工作流链接格式（[[node_id, slot_index]] → [node_id, slot_index]）
            workflowData = this.normalizeWorkflowLinks(workflowData!);
            logger.debug(`Loaded workflow "${wf.name}" from DB`);
            
            // 获取关联的 ComfyUI Provider 配置（仅作为备用）
            if (wf.providerId) {
              const [provider] = await db
                .select()
                .from(comfyuiProviders)
                .where(eq(comfyuiProviders.id, wf.providerId));
              if (provider) {
                const providerConfigUrl = provider.baseUrl.replace(/\/+$/, "");
                // 只有当没有显式提供 baseUrl 时，才使用 workflow 关联的 provider
                // 也处理其他常见的本地地址格式
                const isLocalhostUrl = !this.baseUrl || 
                  this.baseUrl === "http://127.0.0.1:8188" ||
                  this.baseUrl === "http://localhost:8188" ||
                  this.baseUrl.startsWith("http://0.0.0.0");
                
                if (isLocalhostUrl) {
                  effectiveBaseUrl = providerConfigUrl;
                  effectiveApiKey = provider.apiKey || this.apiKey;
                  logger.debug(`Using workflow's provider (localhost detected): ${effectiveBaseUrl}`);
                } else {
                  logger.debug(`Using explicit baseUrl: ${this.baseUrl} (ignoring workflow's provider: ${providerConfigUrl})`);
                }
              }
            }
          } else {
            // 工作流不在数据库中，抛出错误而不是使用不兼容的默认工作流
            logger.debug(`Workflow ${workflowId} not found in DB`);
            throw new Error(`Workflow ${workflowId} not found in database. Please select a valid workflow in Settings.`);
          }
        } catch (error) {
          logger.warn("Error fetching workflow from DB:", error);
          throw error; // 重新抛出错误，避免使用不兼容的默认工作流
        }
      } else {
        logger.debug("No workflowId provided, cannot use default workflow for remote ComfyUI");
        throw new Error("No workflowId provided. Please select a ComfyUI workflow in Settings.");
      }
    }

    // 上传输入图片并获取路径（使用 workflow 关联的 provider）
    const uploadedImages: string[] = [];
    for (const imgPath of inputImages) {
      const uploadedPath = await this.uploadImage(imgPath, effectiveBaseUrl, effectiveApiKey);
      uploadedImages.push(uploadedPath);
    }

    // 替换工作流中的占位符（如 prompt）
    if (prompt && workflowData) {
      workflowData = this.replacePromptInWorkflow(workflowData, prompt);
    }

    // 设置随机的 seed，确保每次生成结果不同
    if (workflowData) {
      workflowData = this.setRandomSeedToWorkflow(workflowData);
    }

    // 生成唯一的 filename_prefix 用于追踪输出（在提交前设置）
    const uniquePrefix = `aicb_${genId().slice(0, 12)}`;
    if (workflowData) {
      workflowData = this.setUniqueFilenamePrefix(workflowData, uniquePrefix);
      logger.debug("Set unique filename prefix: ${uniquePrefix}");
    }

    // 添加额外数据
    const promptWithExtras = {
      ...workflowData,
      ...extraData,
    };

    // 创建带有效 API Key 的 headers
    const headers: Record<string, string> = effectiveApiKey ? { Authorization: `Bearer ${effectiveApiKey}` } : {};

    // 提交工作流
    const promptUrl = `${effectiveBaseUrl}/api/prompt`;
    logger.debug("Submitting workflow to ${promptUrl}");
    logger.debug("Request headers:", JSON.stringify(headers));
    
    const promptResponse = await fetch(promptUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt: promptWithExtras,
        extra_data: {
          extra_pnginfo: {
            workflow: workflowData,
          },
        },
      }),
    });

    if (!promptResponse.ok) {
      const errText = await promptResponse.text();
      throw new Error(`ComfyUI prompt failed: ${promptResponse.status} ${errText}`);
    }

    const promptData = (await promptResponse.json()) as ComfyUIPromptResponse;
    if (promptData.node_errors && Object.keys(promptData.node_errors).length > 0) {
      const errors = Object.entries(promptData.node_errors)
        .map(([node, err]) => `${node}: ${(err as { errors: string[] }).errors.join(", ")}`)
        .join("; ");
      throw new Error(`ComfyUI workflow errors: ${errors}`);
    }

    logger.debug("Prompt submitted: ${promptData.prompt_id}");
    this.currentPromptId = promptData.prompt_id;

    // 等待执行完成（使用 workflow 关联的 provider）
    const outputs = await this.waitForCompletion(promptData.prompt_id, 300, 2000, effectiveBaseUrl, effectiveApiKey);

    // 保存输出图片
    const outputDir = path.join(this.uploadDir, "comfyui");
    fs.mkdirSync(outputDir, { recursive: true });

    const resultImages: string[] = [];
    logger.debug("Processing ${Object.keys(outputs).length} output nodes");
    
    // 如果 outputs 为空，尝试从版本历史获取图片
    if (Object.keys(outputs).length === 0) {
      logger.debug("No outputs in history, trying alternative methods...");
      
      // 方法1: 使用 prompt 序号获取历史
      try {
        const historyImages = await this.fetchLatestOutputImages(promptData.number, effectiveBaseUrl, effectiveApiKey);
        if (historyImages.length > 0) {
          logger.debug("Found ${historyImages.length} images from history");
          for (const filename of historyImages) {
            const imageUrl = `${effectiveBaseUrl}/view?filename=${filename}`;
            const savedPath = await this.downloadImage(imageUrl, outputDir, effectiveApiKey);
            resultImages.push(savedPath);
          }
        }
      } catch (e) {
        logger.error("Method 1 (history by number) failed:", e);
      }
      
      // 方法2: 获取所有历史并找到最新的图片
      if (resultImages.length === 0) {
        try {
          const allImages = await this.fetchAllHistoryImages(effectiveBaseUrl, effectiveApiKey);
          if (allImages.length > 0) {
            // 获取最近的图片（假设第一个就是最新的）
            const latestImage = allImages[0];
            logger.debug("Found latest image from history: ${latestImage}");
            const imageUrl = `${effectiveBaseUrl}/view?filename=${latestImage}`;
            const savedPath = await this.downloadImage(imageUrl, outputDir, effectiveApiKey);
            resultImages.push(savedPath);
          }
        } catch (e) {
          logger.error("Method 2 (all history) failed:", e);
        }
      }

      // 方法3: 通过唯一的 filename_prefix 获取图片
      if (resultImages.length === 0) {
        try {
          const prefixImages = await this.fetchImagesByPrefix(uniquePrefix, effectiveBaseUrl, effectiveApiKey);
          if (prefixImages.length > 0) {
            logger.debug(`Found ${prefixImages.length} images by prefix "${uniquePrefix}"`);
            for (const filename of prefixImages) {
              const imageUrl = `${effectiveBaseUrl}/view?filename=${encodeURIComponent(filename)}`;
              const savedPath = await this.downloadImage(imageUrl, outputDir, effectiveApiKey);
              resultImages.push(savedPath);
            }
          }
        } catch (e) {
          logger.error("Method 3 (prefix fetch) failed:", e);
        }
      }

      // 方法4: 直接从 output 文件夹获取最新图片（当 history 完全不可用时）
      if (resultImages.length === 0) {
        try {
          const outputImages = await this.fetchLatestOutputFromFolder(effectiveBaseUrl, effectiveApiKey);
          if (outputImages.length > 0) {
            logger.debug("Found ${outputImages.length} images from output folder");
            for (const filename of outputImages) {
              const imageUrl = `${effectiveBaseUrl}/view?filename=${encodeURIComponent(filename)}`;
              const savedPath = await this.downloadImage(imageUrl, outputDir, effectiveApiKey);
              resultImages.push(savedPath);
            }
          }
        } catch (e) {
          logger.error("Method 4 (output folder) failed:", e);
        }
      }

      }
    
    for (const [nodeId, output] of Object.entries(outputs)) {
      logger.debug("Node ${nodeId} output type: ${typeof output}, keys: ${Object.keys(output as object).join(",")}");
      try {
        if (output && typeof output === "object") {
          // Check for ComfyUI image format: { images: [[filename, subfolder, type], ...] }
          if ("images" in output) {
            const imageData = output as { images: unknown[] };
            logger.debug("Found images array with ${imageData.images.length} items");
            logger.debug("First image raw:", JSON.stringify(imageData.images[0]));
            
            for (const image of imageData.images) {
              logger.debug("Processing image item, type: ${typeof image}, isArray: ${Array.isArray(image)}");
              // Handle different image formats
              if (Array.isArray(image)) {
                logger.debug("Image is array, length: ${image.length}, first element type: ${typeof image[0]}");
                // ComfyUI can return nested arrays [[filename, subfolder, type]] or flat [filename, subfolder, type]
                if (image.length > 0 && Array.isArray(image[0])) {
                  // Nested array format
                  logger.debug("Processing nested array format");
                  for (const nestedImage of image as unknown[]) {
                    if (Array.isArray(nestedImage) && nestedImage.length >= 1) {
                      const [filename, subfolder = "", type = "output"] = nestedImage as string[];
                      const imageUrl = `${effectiveBaseUrl}/view?filename=${filename}&subfolder=${subfolder}&type=${type}`;
                      logger.debug("Downloading nested image: ${filename}");
                      const savedPath = await this.downloadImage(imageUrl, outputDir, effectiveApiKey);
                      resultImages.push(savedPath);
                    }
                  }
                } else if (image.length >= 1) {
                  // Flat array format [filename, subfolder, type]
                  const [filename, subfolder = "", type = "output"] = image as string[];
                  const imageUrl = `${effectiveBaseUrl}/view?filename=${filename}&subfolder=${subfolder}&type=${type}`;
                  logger.debug("Downloading flat image: ${filename}");
                  const savedPath = await this.downloadImage(imageUrl, outputDir, effectiveApiKey);
                  resultImages.push(savedPath);
                }
              } else if (typeof image === "string") {
                // Simple string path
                const imageUrl = `${effectiveBaseUrl}/view?filename=${image}`;
                logger.debug("Downloading image (string): ${image}");
                const savedPath = await this.downloadImage(imageUrl, outputDir, effectiveApiKey);
                resultImages.push(savedPath);
              } else if (typeof image === "object" && image !== null && "filename" in image) {
                // Object format: { filename, subfolder, type }
                const imgObj = image as { filename: string; subfolder?: string; type?: string };
                const imageUrl = `${effectiveBaseUrl}/view?filename=${imgObj.filename}&subfolder=${imgObj.subfolder || ""}&type=${imgObj.type || "output"}`;
                logger.debug("Downloading image (object): ${imgObj.filename}");
                const savedPath = await this.downloadImage(imageUrl, outputDir, effectiveApiKey);
                resultImages.push(savedPath);
              } else {
                logger.debug("Unknown image format:", JSON.stringify(image));
              }
            }
          }
          // Check for direct image path: { image: path }
          else if ("image" in output) {
            const imagePath = (output as { image: string }).image;
            const imageUrl = `${effectiveBaseUrl}/view?filename=${imagePath}`;
            logger.debug("Downloading direct image: ${imagePath}");
            const savedPath = await this.downloadImage(imageUrl, outputDir, effectiveApiKey);
            resultImages.push(savedPath);
          }
        }
      } catch (nodeError) {
        logger.error("Error processing node ${nodeId}:", nodeError);
      }
    }

    if (resultImages.length === 0) {
      // 详细诊断信息
      logger.error("=== DIAGNOSTIC INFO ===");
      logger.error("Workflow completed but no images retrieved.");
      logger.error("This is likely due to ComfyUI server configuration.");
      logger.error("Possible causes:");
      logger.error("1. Server is not saving outputs to history");
      logger.error("2. Check ComfyUI settings -> Settings -> System Stats -> Enable 'Store outputs in History'");
      logger.error("3. Alternatively, check if 'execution_cached' is being used");
      throw new Error("ComfyUI workflow completed but no images were generated. Please check ComfyUI server settings: Enable 'Store outputs in History' in Settings.");
    }

    const outputPath = resultImages[0];
    const filename = path.basename(outputPath);

    return {
      filePath: outputPath,
      outputPath: `/api/uploads/comfyui/${filename}`,
    };
  }

  /**
   * 构建默认的文生图工作流
   */
  private buildDefaultTextToImageWorkflow(
    prompt?: string,
    model?: string
  ): Record<string, unknown> {
    return {
      "3": {
        inputs: {
          text: prompt || "",
          clip: ["4", 0],
        },
        class_type: "CLIPTextEncode",
      },
      "4": {
        inputs: {
          budget: {
            model_name: model || "sd15",
          },
        },
        class_type: "CheckpointLoaderSimple",
      },
      "5": {
        inputs: {
          width: 512,
          height: 512,
          batch_size: 1,
        },
        class_type: "EmptyLatentImage",
      },
      "6": {
        inputs: {
          seed: Math.floor(Math.random() * 0xFFFFFFFFFFFF),
          steps: 20,
          cfg: 7,
          sampler_name: "euler",
          scheduler: "normal",
          positive: ["3", 0],
          negative: "",
          latent_image: ["5", 0],
        },
        class_type: "KSampler",
      },
      "7": {
        inputs: {
          samples: ["6", 0],
          model: ["4", 0],
        },
        class_type: "VAEDecode",
      },
      "8": {
        inputs: {
          filename_prefix: `comfyui_${genId()}`,
          images: ["7", 0],
        },
        class_type: "SaveImage",
      },
    };
  }

  /**
   * 标准化工作流链接格式
   * ComfyUI API 期望链接为 [node_id, slot_index]，但有时存储为 [[node_id, slot_index]]
   */
  private normalizeWorkflowLinks(workflow: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    
    for (const [nodeId, nodeData] of Object.entries(workflow)) {
      if (typeof nodeData === "object" && nodeData !== null && "inputs" in nodeData) {
        const node = nodeData as { inputs?: Record<string, unknown>; class_type?: string };
        const normalizedInputs: Record<string, unknown> = {};
        
        if (node.inputs) {
          for (const [inputName, inputValue] of Object.entries(node.inputs)) {
            // 检查是否是双层嵌套的链接格式 [[...]]
            if (Array.isArray(inputValue) && inputValue.length === 1 && Array.isArray(inputValue[0])) {
              normalizedInputs[inputName] = inputValue[0];
            } else {
              normalizedInputs[inputName] = inputValue;
            }
          }
        }
        
        result[nodeId] = {
          ...node,
          inputs: normalizedInputs,
        };
      } else {
        result[nodeId] = nodeData;
      }
    }
    
    return result;
  }

  /**
   * 设置 KSampler 节点的随机 seed
   * 确保每次生成都使用不同的 seed，避免生成相同的结果
   */
  private setRandomSeedToWorkflow(workflow: Record<string, unknown>): Record<string, unknown> {
    const result = { ...workflow };
    
    // KSampler 相关节点类型
    const ksamplerClassTypes = [
      "KSampler",
      "KSamplerAdvanced",
      "KSampler (Efficient)",
      "KSamplerInpainting",
      "Sampler",
      "EKSampler",
      "SamplerCustom",
      "BasicScheduler",
      "AdvancedScheduler",
      "sampler",
    ];
    
    let seedSetCount = 0;
    
    for (const [nodeId, nodeData] of Object.entries(result)) {
      if (
        typeof nodeData === "object" &&
        nodeData !== null &&
        "class_type" in nodeData
      ) {
        const node = nodeData as { inputs?: Record<string, unknown>; class_type?: string };
        
        if (ksamplerClassTypes.includes(node.class_type || "")) {
          if (node.inputs) {
            // 检查是否有 seed 参数
            if ("seed" in node.inputs) {
              // 生成随机 seed（使用 64 位随机数）
              const randomSeed = Math.floor(Math.random() * 0xFFFFFFFFFFFF);
              node.inputs.seed = randomSeed;
              seedSetCount++;
              logger.debug("Set random seed for node ${nodeId} (${node.class_type}): ${randomSeed}");
            }
          }
        }
      }
    }
    
    if (seedSetCount === 0) {
      logger.debug("No KSampler nodes with seed parameter found in workflow");
    }
    
    return result;
  }

  /**
   * 设置 SaveImage 节点的 filename_prefix 为唯一值
   * 用于后续通过 prefix 追踪输出
   */
  private setUniqueFilenamePrefix(
    workflow: Record<string, unknown>,
    prefix: string
  ): Record<string, unknown> {
    const result = { ...workflow };
    
    // 图片保存节点类型
    const saveImageClassTypes = [
      "SaveImage",
      "SaveImage (UUI)",
      "SaveImageWebsocket",
      "ImageSave",
      "保存图像",
      "图像保存",
    ];
    
    // 视频输出节点类型（也使用 filename_prefix）
    const videoOutputClassTypes = [
      "VHS_VideoCombine",
      "VideoCombine",
      "VideoCombine (Legacy)",
      "VideoSave",
      "VideoSaveV2",
      "视频合成",
      "视频保存",
      "Wan2VideoCombine",
      "AnimateDiffCombine",
    ];
    
    const allOutputClassTypes = [...saveImageClassTypes, ...videoOutputClassTypes];
    
    for (const [nodeId, nodeData] of Object.entries(result)) {
      if (
        typeof nodeData === "object" &&
        nodeData !== null &&
        "class_type" in nodeData
      ) {
        const node = nodeData as { inputs?: Record<string, unknown>; class_type?: string };
        
        if (allOutputClassTypes.includes(node.class_type || "")) {
          if (node.inputs) {
            // 设置唯一的 filename_prefix
            node.inputs.filename_prefix = prefix;
            const isVideo = videoOutputClassTypes.includes(node.class_type || "");
            logger.debug(`Set filename_prefix for node ${nodeId} (${node.class_type}${isVideo ? ", VIDEO" : ""}): ${prefix}`);
          }
        }
      }
    }
    
    return result;
  }

  /**
   * 设置工作流中的输入图片节点
   * 用于视频生成时上传图片并替换到对应的 LoadImage 节点
   * 智能分配 firstFrame 和 lastFrame 到可用的图片输入节点
   */
  private setInputImagesInWorkflow(
    workflow: Record<string, unknown>,
    imagePaths: string[]
  ): Record<string, unknown> {
    const result = { ...workflow };
    
    // 支持更多类型的 LoadImage 节点
    const imageInputNodes = [
      "LoadImage", 
      "LoadImage (path)",
      "LoadImageMasked",
      "LoadImages",
      "LoadImageWebcam",
      "图像",
      "图片",
      "ImageLoad",
      "LoadImageNode",
    ];

    // 收集所有可用的 LoadImage 节点及其当前图片信息
    const loadImageNodes: { nodeId: string; currentImage?: string; classType: string }[] = [];
    
    for (const [nodeId, nodeData] of Object.entries(result)) {
      if (
        typeof nodeData === "object" &&
        nodeData !== null &&
        "class_type" in nodeData
      ) {
        const node = nodeData as { inputs?: Record<string, unknown>; class_type?: string };
        
        if (imageInputNodes.includes(node.class_type || "")) {
          const currentImage = node.inputs?.image as string | undefined;
          loadImageNodes.push({ nodeId, currentImage, classType: node.class_type || "" });
          logger.debug(`Found LoadImage node ${nodeId} (${node.class_type}), current image: ${currentImage || "none"}`);
        }
      }
    }

    logger.debug(`Found ${loadImageNodes.length} LoadImage nodes, ${imagePaths.length} images to assign`);

    if (loadImageNodes.length === 0) {
      logger.warn("WARNING: No LoadImage nodes found in workflow!");
      const availableTypes = [...new Set(Object.values(result).map((n: unknown) => {
        const node = n as { class_type?: string };
        return node.class_type;
      }).filter(Boolean))].slice(0, 20);
      logger.warn("Available node types", availableTypes);
      return result;
    }

    // 智能分配图片
    // 策略：
    // - 第一个 LoadImage 节点 → firstFrame (imagePaths[0])
    // - 第二个 LoadImage 节点 → lastFrame (imagePaths[1])，如果有的话
    // - 如果只有1个节点，使用 firstFrame
    // - 如果有更多节点但只有2张图片，第二张图片分配给最后一个节点
    
    for (let i = 0; i < loadImageNodes.length && i < imagePaths.length; i++) {
      const { nodeId, classType } = loadImageNodes[i];
      const imagePath = imagePaths[i];
      
      const nodeData = result[nodeId] as { inputs?: Record<string, unknown> };
      if (nodeData.inputs) {
        nodeData.inputs.image = imagePath;
        
        // 标记图片用途
        if (i === 0) {
          logger.debug("Set firstFrame for node ${nodeId} (${classType}): ${imagePath}");
        } else if (i === 1 && imagePaths.length >= 2) {
          logger.debug("Set lastFrame for node ${nodeId} (${classType}): ${imagePath}");
        } else {
          logger.debug("Set image ${i + 1} for node ${nodeId} (${classType}): ${imagePath}");
        }
      }
    }

    if (loadImageNodes.length < imagePaths.length) {
      logger.warn("Warning: ${imagePaths.length - loadImageNodes.length} images not assigned (${loadImageNodes.length} nodes, ${imagePaths.length} images)");
    }

    return result;
  }

  /**
   * 从 ComfyUI 下载视频文件
   */
  private async downloadVideo(
    videoUrl: string,
    outputDir: string,
    apiKey?: string
  ): Promise<string> {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(videoUrl, { headers });

    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.status}`);
    }

    const contentDisposition = response.headers.get("content-disposition");
    let filename: string;

    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?(.+?)"?/);
      filename = match ? match[1] : `video_${Date.now()}.mp4`;
    } else {
      const urlPath = new URL(videoUrl).pathname;
      filename = path.basename(urlPath) || `video_${Date.now()}.mp4`;
    }

    const outputPath = path.join(outputDir, filename);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(outputPath, Buffer.from(buffer));

    logger.debug("Video saved to: ${outputPath}");
    return outputPath;
  }

  /**
   * 通过 filename_prefix 获取输出的图片列表
   * ComfyUI 的 `/view` API 支持模糊匹配
   */
  private async fetchImagesByPrefix(
    prefix: string,
    baseUrl: string,
    apiKey?: string
  ): Promise<string[]> {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const images: string[] = [];

    // 方法1: 尝试使用 prefix 直接查询
    try {
      // ComfyUI 的 /view API 支持通过 filename 参数获取
      // 先获取文件列表
      const response = await fetch(`${baseUrl}/api/view?filename=${encodeURIComponent(prefix)}`, {
        headers,
      });
      
      // 如果返回图片，直接使用
      if (response.ok && response.headers.get("content-type")?.includes("image")) {
        const contentType = response.headers.get("content-type");
        let ext = "png";
        if (contentType?.includes("jpeg") || contentType?.includes("jpg")) ext = "jpg";
        if (contentType?.includes("webp")) ext = "webp";
        const filename = `${prefix}.${ext}`;
        logger.debug("Found image by exact prefix match: ${filename}");
        return [filename];
      }
    } catch (e) {
      logger.debug("Exact prefix match failed:", e);
    }

    // 方法2: 尝试获取目录下的文件列表并过滤
    try {
      // ComfyUI 可能有 /api/files 或 /api/folder 接口
      const folders = ["output", "tmp"];
      
      for (const folder of folders) {
        try {
          const listResponse = await fetch(`${baseUrl}/api/folder?path=${folder}`, { headers });
          if (listResponse.ok) {
            const data = await listResponse.json();
            logger.debug("Folder ${folder} response:", JSON.stringify(data).slice(0, 300));
            
            // 解析文件列表
            if (Array.isArray(data)) {
              for (const item of data) {
                const name = item.name || item.filename || item;
                if (typeof name === "string" && name.startsWith(prefix)) {
                  images.push(name);
                }
              }
            } else if (data.files && Array.isArray(data.files)) {
              for (const item of data.files) {
                const name = item.name || item.filename || item;
                if (typeof name === "string" && name.startsWith(prefix)) {
                  images.push(name);
                }
              }
            }
            
            if (images.length > 0) {
              logger.debug(`Found ${images.length} images with prefix "${prefix}" in ${folder}`);
              break;
            }
          }
        } catch (e) {
          logger.debug(`Failed to list folder ${folder}:`, e);
        }
      }
    } catch (e) {
      logger.debug("Folder listing failed:", e);
    }

    // 方法3: 尝试直接访问 /output 目录
    if (images.length === 0) {
      try {
        const outputResponse = await fetch(`${baseUrl}/output/`, { headers });
        if (outputResponse.ok) {
          const html = await outputResponse.text();
          logger.debug(`/output/ response length: ${html.length}`);
          
          // 从 HTML 中提取文件名
          const matches = html.match(/href="([^"]*?)"/g) || [];
          for (const match of matches) {
            const href = match.match(/href="([^"]*?)"/)?.[1] || "";
            if (href && href.startsWith(prefix)) {
              images.push(href);
            }
          }
          
          if (images.length > 0) {
            logger.debug("Found ${images.length} images from /output/ HTML");
          }
        }
      } catch (e) {
        logger.debug("/output/ access failed:", e);
      }
    }

    return images;
  }

  /**
   * 替换工作流中的 prompt 占位符
   * 查找 CLIPTextEncode 节点的 text 输入并替换
   * - 第一个 CLIPTextEncode = 正提示词（用户输入）
   * - 后续 CLIPTextEncode = 负提示词（默认）
   */
  private replacePromptInWorkflow(
    workflow: Record<string, unknown>,
    prompt: string
  ): Record<string, unknown> {
    const result = { ...workflow };
    const defaultNegativePrompt = "text, watermark, low quality, blurry, distorted";
    
    const targetClassTypes = ["CLIPTextEncode", "CLIP Text Encode (Prompt)", "中文CLIPTextEncode"];
    let clipTextEncodeCount = 0;
    // 记录节点和对应的提示词内容
    const replacedNodePrompts: { node: string; prompt: string }[] = [];
    
    for (const [nodeId, nodeData] of Object.entries(result)) {
      if (
        typeof nodeData === "object" &&
        nodeData !== null &&
        "class_type" in nodeData
      ) {
        const node = nodeData as { inputs?: Record<string, unknown>; class_type?: string };
        
        // 检查是否是 CLIPTextEncode 类节点
        if (targetClassTypes.includes(node.class_type || "")) {
          if (node.inputs?.text !== undefined && typeof node.inputs.text === "string") {
            clipTextEncodeCount++;
            if (clipTextEncodeCount === 1) {
              // 第一个 CLIPTextEncode = 正提示词
              node.inputs.text = prompt;
              replacedNodePrompts.push({ node: `${nodeId} (positive)`, prompt });
            } else {
              // 后续 CLIPTextEncode = 负提示词
              node.inputs.text = defaultNegativePrompt;
              replacedNodePrompts.push({ node: `${nodeId} (negative)`, prompt: defaultNegativePrompt });
            }
          }
        }
        
        // 也检查中文版工作流中的 "文本" 字段
        if (node.inputs?.text !== undefined && typeof node.inputs.text === "string") {
          // 对于普通 CLIPTextEncode，检查原始值是否像 prompt
          const isLikelyPrompt = node.inputs.text.length > 10 && 
            !node.inputs.text.includes("watermark") && 
            !node.inputs.text.includes("low quality");
          
          if (isLikelyPrompt && !replacedNodePrompts.some(r => r.node.startsWith(nodeId))) {
            node.inputs.text = prompt;
            replacedNodePrompts.push({ node: `${nodeId} (text field)`, prompt });
          }
        }
      }
    }
    
    // 显示替换的节点和提示词内容（限制 1000 字以内）
    const replacedNodes = replacedNodePrompts.map(r => r.node);
    logger.debug("Replaced prompts in ${replacedNodes.length} nodes:", replacedNodes);
    for (const { node, prompt } of replacedNodePrompts) {
      logger.debug(`  ${node}: "${prompt}"`);
    }
    
    if (replacedNodes.length === 0) {
      logger.warn("WARNING: No CLIPTextEncode nodes found in workflow!");
      logger.warn("Available nodes:", Object.keys(result).join(", "));
    }
    
    return result;
  }

  /**
   * 将 API URL 或本地路径转换为本地文件系统路径
   * 支持:
   * - /api/uploads/... -> 本地 uploads 目录
   * - uploads/... (相对路径) -> 直接使用（假设是相对于工作目录）
   * - http(s)://... -> 抛出错误（不支持远程 URL）
   * - 本地绝对/相对路径 -> 直接使用或相对于 uploadDir
   */
  private resolveLocalPath(filePathOrUrl: string): string {
    // 如果是 HTTP URL，抛出错误
    if (filePathOrUrl.startsWith("http://") || filePathOrUrl.startsWith("https://")) {
      throw new Error(`Remote URL not supported for ComfyUI upload: ${filePathOrUrl}`);
    }

    // 如果是 API URL (/api/uploads/...)，转换为本地路径
    if (filePathOrUrl.startsWith("/api/uploads/")) {
      const relativePath = filePathOrUrl.replace("/api/uploads/", "");
      return path.join(this.uploadDir, relativePath);
    }

    // 如果路径以 uploads/ 开头，假设是相对于工作目录的路径，直接使用
    if (filePathOrUrl.startsWith("uploads/")) {
      // 检查相对于当前工作目录是否存在
      const cwdPath = path.join(process.cwd(), filePathOrUrl);
      if (fs.existsSync(cwdPath)) {
        return cwdPath;
      }
      // 如果不存在，尝试作为相对于 uploadDir 的路径（处理 uploads/ 重复的情况）
      const uploadDirPath = path.join(this.uploadDir, filePathOrUrl);
      if (fs.existsSync(uploadDirPath)) {
        return uploadDirPath;
      }
      // 默认返回 cwd 路径（让后续报错给出更清晰的信息）
      return cwdPath;
    }

    // 如果是绝对路径，直接使用
    if (path.isAbsolute(filePathOrUrl)) {
      return filePathOrUrl;
    }

    // 其他相对路径，尝试相对于 uploadDir
    return path.join(this.uploadDir, filePathOrUrl);
  }

  /**
   * 上传图片到 ComfyUI
   */
  private async uploadImage(filePath: string, baseUrl?: string, apiKey?: string): Promise<string> {
    const targetBaseUrl = baseUrl || this.baseUrl;
    const targetApiKey = apiKey || this.apiKey;

    // 解析本地路径（支持 API URL 和本地路径）
    const localPath = this.resolveLocalPath(filePath);
    const filename = path.basename(localPath);

    logger.debug("Uploading image: ${filePath} -> ${localPath}");

    // 检查文件是否存在
    if (!fs.existsSync(localPath)) {
      throw new Error(`Image file not found: ${localPath} (original: ${filePath})`);
    }

    const fileData = fs.readFileSync(localPath);

    const formData = new FormData();
    formData.append("image", new Blob([fileData]), filename);

    const response = await fetch(`${targetBaseUrl}/api/upload/image`, {
      method: "POST",
      headers: targetApiKey ? { Authorization: `Bearer ${targetApiKey}` } : {},
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Failed to upload image: ${response.status} ${errorText}`);
    }

    const result = (await response.json()) as { name: string; subfolder?: string };
    return `${result.subfolder ? `${result.subfolder}/` : ""}${result.name}`;
  }

  /**
   * 使用 WebSocket 获取工作流执行结果（实时方式）
   */
  private async waitForCompletionViaWebSocket(
    promptId: string,
    maxWaitMs = 600000, // 10 分钟超时
    baseUrl?: string,
    apiKey?: string
  ): Promise<{ outputs: Record<string, unknown>; executedNodes: string[] }> {
    const targetBaseUrl = baseUrl || this.baseUrl;
    const wsUrl = targetBaseUrl.replace(/^http/, "ws");
    
    logger.debug("WebSocket: Connecting to ${wsUrl} for prompt ${promptId}");
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws?.close();
        reject(new Error("WebSocket timeout waiting for execution results"));
      }, maxWaitMs);

      let ws: WebSocket | null = null;
      const executedNodes: string[] = [];
      const outputs: Record<string, unknown> = {};

      try {
        ws = new WebSocket(`${wsUrl}/ws?clientId=${genId()}`);

        ws.onopen = () => {
          logger.debug("WebSocket connected");
          // 订阅执行相关消息
          ws?.send(JSON.stringify({
            type: "subscribe",
            channel: "execution",
          }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string) as ComfyUISocketMessage;
            
            // 处理执行完成消息
            if (msg.type === "execution-success" && msg.data?.prompt_id === promptId) {
              logger.debug("WebSocket: execution-success for ${promptId}");
              logger.debug("WebSocket: Executed nodes: ${executedNodes.join(", ")}");
              logger.debug("WebSocket: Outputs collected: ${Object.keys(outputs).length}");
              
              clearTimeout(timeout);
              ws?.close();
              resolve({ outputs, executedNodes });
            }
            
            // 处理节点执行开始
            if (msg.type === "executing" && msg.data?.node) {
              executedNodes.push(msg.data.node);
            }
            
            // 处理节点输出（保存图片信息）
            if (msg.type === "output" && msg.data?.prompt_id === promptId) {
              const nodeId = msg.data.node;
              if (nodeId && msg.data.output) {
                outputs[nodeId] = msg.data.output;
                logger.debug("WebSocket: Captured output for node ${nodeId}");
              }
            }
            
            // 处理执行错误
            if (msg.type === "execution-error") {
              logger.error("WebSocket: execution-error", msg.data);
              clearTimeout(timeout);
              ws?.close();
              reject(new Error(`ComfyUI execution error: ${JSON.stringify(msg.data)}`));
            }
            
            // 处理进度消息
            if (msg.type === "progress") {
              logger.debug("WebSocket: Progress - ${msg.data_i}");
            }
          } catch (parseError) {
            // 忽略非 JSON 消息
          }
        };

        ws.onerror = (error) => {
          logger.error("WebSocket error:", error);
        };

        ws.onclose = () => {
          logger.debug("WebSocket closed");
        };
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * 等待工作流执行完成
   */
  private async waitForCompletion(
    promptId: string,
    maxAttempts = 300,
    intervalMs = 5000,
    baseUrl?: string,
    apiKey?: string
  ): Promise<Record<string, unknown>> {
    const targetBaseUrl = baseUrl || this.baseUrl;
    const headers: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

    logger.debug("Starting to wait for completion: ${promptId} at ${targetBaseUrl}");
    
    // 首先尝试 HTTP polling 方式
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));

      try {
        const historyResponse = await fetch(`${targetBaseUrl}/api/history/${promptId}`, {
          headers,
        });

        if (!historyResponse.ok) {
          if (i % 5 === 0) {
            logger.debug("History request failed: ${historyResponse.status}");
          }
          continue;
        }

        const history = (await historyResponse.json()) as ComfyUIHistory;
        
        if (!history[promptId]) {
          if (i % 5 === 0) {
            logger.debug("Prompt ${promptId} not in history yet (${i + 1}/${maxAttempts})");
          }
          continue;
        }

        const item = history[promptId];
        logger.debug(`Status: ${item.status.status_str}`);
        
        if (item.status.status_str === "success") {
          const execTime = item.status.exec_time;
          logger.debug(`Workflow completed${execTime !== undefined ? ` in ${execTime.toFixed(2)}s` : ""}`);
          logger.debug(`Outputs: ${Object.keys(item.outputs).length} nodes`);
          return item.outputs;
        }
        if (item.status.errors && item.status.errors.length > 0) {
          throw new Error(`ComfyUI execution errors: ${item.status.errors.join(", ")}`);
        }
        
        if (i % 10 === 0) {
          logger.debug("Still running... (${i + 1}/${maxAttempts})");
        }
      } catch (error) {
        logger.error("Error checking status:", error);
      }
    }

    throw new Error("ComfyUI workflow execution timed out");
  }

  /**
   * 下载图片到本地
   */
  private async downloadImage(url: string, outputDir: string, apiKey?: string): Promise<string> {
    const effectiveApiKey = apiKey || this.apiKey;
    logger.debug(`Downloading from ${url} with API key: ${effectiveApiKey ? "yes" : "no"}`);
    const response = await fetch(url, {
      headers: effectiveApiKey ? { Authorization: `Bearer ${effectiveApiKey}` } : {},
    });

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentDisposition = response.headers.get("Content-Disposition");
    let filename = `image_${genId()}.png`;

    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match) {
        filename = match[1];
      }
    }

    const filepath = path.join(outputDir, filename);
    fs.writeFileSync(filepath, buffer);

    return filepath;
  }

  /**
   * 从 ComfyUI output 文件夹直接获取最新生成的图片
   * 适用于 history 被禁用的服务器
   */
  private async fetchLatestOutputFromFolder(
    baseUrl: string,
    apiKey?: string
  ): Promise<string[]> {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    // 尝试访问 output 文件夹
    try {
      const response = await fetch(`${baseUrl}/api/view?filename=`, { headers });
      // 这个 API 可能不可用，尝试其他方式
      logger.debug("Output folder API response: ${response.status}");
    } catch (e) {
      logger.debug("Output folder API not accessible:", e);
    }

    // 尝试获取最近保存的图片列表
    try {
      const response = await fetch(`${baseUrl}/api/files?path=output`, { headers });
      if (response.ok) {
        const data = await response.json();
        logger.debug("Output folder contents:", JSON.stringify(data).slice(0, 500));
        
        // 解析文件列表
        const images: string[] = [];
        if (Array.isArray(data)) {
          for (const item of data) {
            if (item.type === "file" && item.name) {
              // 过滤图片文件
              if (/\.(png|jpg|jpeg|webp)$/i.test(item.name)) {
                images.push(item.name);
              }
            }
          }
        }
        
        // 按时间倒序（最新的在前）
        images.sort((a, b) => b.localeCompare(a));
        return images.slice(0, 10); // 只返回最近 10 张
      }
    } catch (e) {
      logger.debug("Failed to fetch output folder:", e);
    }

    return [];
  }

  /**
   * 从 ComfyUI 的输出版本历史获取最新生成的图片
   */
  private async fetchLatestOutputImages(
    promptNumber: number,
    baseUrl: string,
    apiKey?: string
  ): Promise<string[]> {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    // 尝试获取指定 prompt 版本的图片列表
    const response = await fetch(`${baseUrl}/api/history/${promptNumber}`, { headers });
    if (!response.ok) {
      logger.debug("History for prompt ${promptNumber} not available: ${response.status}");
      return [];
    }

    const data = await response.json();
    logger.debug("History response for prompt ${promptNumber}: ${Object.keys(data).length} keys");
    
    // 查找包含图片的输出
    const images: string[] = [];
    
    // 遍历所有节点的输出
    for (const [nodeId, output] of Object.entries(data)) {
      if (output && typeof output === "object" && "images" in output) {
        const imageData = (output as { images: unknown[] }).images;
        for (const img of imageData) {
          if (Array.isArray(img) && img.length >= 1) {
            images.push(img[0] as string);
          } else if (typeof img === "string") {
            images.push(img);
          }
        }
      }
    }

    return images;
  }

  /**
   * 获取所有历史记录中的图片
   */
  private async fetchAllHistoryImages(
    baseUrl: string,
    apiKey?: string
  ): Promise<string[]> {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    // 获取最近的历史记录
    const response = await fetch(`${baseUrl}/api/history?max_entries=10`, { headers });
    if (!response.ok) {
      logger.debug("Failed to fetch history: ${response.status}");
      return [];
    }

    const data = await response.json();
    logger.debug("History entries count: ${Object.keys(data).length}");
    
    const images: string[] = [];
    
    // 按时间倒序遍历历史记录
    const entries = Object.entries(data).sort(([a], [b]) => b.localeCompare(a));
    
    for (const [promptId, entry] of entries) {
      const entryData = entry as { outputs?: Record<string, unknown> };
      if (entryData.outputs) {
        for (const [nodeId, output] of Object.entries(entryData.outputs)) {
          if (output && typeof output === "object" && "images" in output) {
            const imageData = (output as { images: unknown[] }).images;
            for (const img of imageData) {
              if (Array.isArray(img) && img.length >= 1) {
                images.push(img[0] as string);
              } else if (typeof img === "string") {
                images.push(img);
              }
            }
          }
        }
      }
    }
    
    logger.debug("Found ${images.length} total images in history");
    return images;
  }

  /**
   * 获取系统状态
   */
  async getSystemStats(): Promise<{
    devices: Array<{ name: string; type: string; memory: { used: number; reserved: number; free: number } }>;
    queueSize: number;
  }> {
    const response = await fetch(`${this.baseUrl}/api/system_stats`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get system stats: ${response.status}`);
    }

    return response.json();
  }

  /**
   * 获取队列状态
   */
  async getQueue(): Promise<{
    queueRunning: Array<{ prompt_id: string; number: number }>;
    queuePending: Array<{ prompt_id: string; number: number }>;
  }> {
    const response = await fetch(`${this.baseUrl}/api/queue`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get queue: ${response.status}`);
    }

    return response.json();
  }

  /**
   * 执行视频工作流
   */
  async runVideoWorkflow(params: {
    prompt?: string;
    initialImage?: string;
    firstFrame?: string;
    lastFrame?: string;
    workflowId?: string;
  }): Promise<{ filePath: string; lastFrameUrl?: string }> {
    const { prompt, initialImage, firstFrame, lastFrame, workflowId } = params;

    // 获取工作流数据
    let workflowData: Record<string, unknown> | undefined;
    let effectiveBaseUrl = this.baseUrl;
    let effectiveApiKey = this.apiKey;

    logger.debug("runVideoWorkflow: this.baseUrl=${this.baseUrl}, effectiveBaseUrl=${effectiveBaseUrl}, workflowId=${workflowId}");

    if (workflowId) {
      try {
        const [wf] = await db
          .select()
          .from(comfyuiWorkflows)
          .where(eq(comfyuiWorkflows.id, workflowId));

        if (wf) {
          workflowData = JSON.parse(wf.workflowJson);
          workflowData = this.normalizeWorkflowLinks(workflowData!);
          logger.debug(`Loaded video workflow "${wf.name}" from DB`);
          logger.debug(`Workflow providerId: "${wf.providerId}"`);

          // 只有当没有显式提供 baseUrl 时，才使用 workflow 关联的 provider
          if (wf.providerId) {
            const [provider] = await db
              .select()
              .from(comfyuiProviders)
              .where(eq(comfyuiProviders.id, wf.providerId));
            if (provider) {
              const providerConfigUrl = provider.baseUrl.replace(/\/+$/, "");
              // 只有当没有显式提供 baseUrl 时，才使用 workflow 关联的 provider
              // 也处理其他常见的本地地址格式
              const isLocalhostUrl = !this.baseUrl || 
                this.baseUrl === "http://127.0.0.1:8188" ||
                this.baseUrl === "http://localhost:8188" ||
                this.baseUrl.startsWith("http://0.0.0.0");
              
              if (isLocalhostUrl) {
                effectiveBaseUrl = providerConfigUrl;
                effectiveApiKey = provider.apiKey || this.apiKey;
                logger.debug(`Using workflow's provider (localhost detected): ${effectiveBaseUrl}`);
              } else {
                logger.debug(`Using explicit baseUrl: ${this.baseUrl} (ignoring workflow's provider: ${providerConfigUrl})`);
              }
            } else {
              logger.debug("Provider ${wf.providerId} not found in DB, using this.baseUrl: ${this.baseUrl}");
            }
          } else {
            logger.debug("Workflow has no providerId, using this.baseUrl: ${this.baseUrl}");
          }
        } else {
          throw new Error(`Video workflow ${workflowId} not found in database. Please select a valid workflow in Settings.`);
        }
      } catch (error) {
        logger.warn("Error fetching video workflow from DB:", error);
        throw error;
      }
    } else {
      throw new Error("No workflowId provided. Please select a ComfyUI video workflow in Settings.");
    }

    // 上传输入图片
    const uploadedImages: string[] = [];
    const inputImages = [initialImage, firstFrame, lastFrame].filter(Boolean) as string[];
    logger.debug("Uploading ${inputImages.length} images to ${effectiveBaseUrl}");
    for (const imgPath of inputImages) {
      const uploadedPath = await this.uploadImage(imgPath, effectiveBaseUrl, effectiveApiKey);
      uploadedImages.push(uploadedPath);
    }

    // 替换工作流中的提示词
    if (prompt && workflowData) {
      workflowData = this.replacePromptInWorkflow(workflowData, prompt);
    }

    // 设置随机的 seed，确保每次生成结果不同
    if (workflowData) {
      workflowData = this.setRandomSeedToWorkflow(workflowData);
    }

    // 设置输入图片节点
    if (workflowData && uploadedImages.length > 0) {
      workflowData = this.setInputImagesInWorkflow(workflowData, uploadedImages);
    }

    // 生成唯一的 filename_prefix
    const uniquePrefix = `aicb_${genId().slice(0, 12)}`;
    if (workflowData) {
      workflowData = this.setUniqueFilenamePrefix(workflowData, uniquePrefix);
      logger.debug("Set unique filename prefix: ${uniquePrefix}");
    }

    // 创建 headers
    const headers: Record<string, string> = effectiveApiKey ? { Authorization: `Bearer ${effectiveApiKey}` } : {};

    // 提交工作流
    logger.debug("Submitting workflow to ${effectiveBaseUrl}/api/prompt");
    const promptResponse = await fetch(`${effectiveBaseUrl}/api/prompt`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt: workflowData,
        extra_data: {
          extra_pnginfo: {
            workflow: workflowData,
          },
        },
      }),
    });

    if (!promptResponse.ok) {
      const errText = await promptResponse.text();
      throw new Error(`ComfyUI video prompt failed: ${promptResponse.status} ${errText}`);
    }

    const promptData = (await promptResponse.json()) as ComfyUIPromptResponse;
    if (promptData.node_errors && Object.keys(promptData.node_errors).length > 0) {
      const errors = Object.entries(promptData.node_errors)
        .map(([node, err]) => `${node}: ${(err as { errors: string[] }).errors.join(", ")}`)
        .join("; ");
      throw new Error(`ComfyUI video workflow errors: ${errors}`);
    }

    logger.debug("Video prompt submitted: ${promptData.prompt_id}");

    // 等待执行完成
    const outputs = await this.waitForCompletion(promptData.prompt_id, 600, 5000, effectiveBaseUrl, effectiveApiKey);

    // 保存输出视频
    const outputDir = path.join(this.uploadDir, "comfyui", "videos");
    fs.mkdirSync(outputDir, { recursive: true });

    const resultVideos: string[] = [];
    let lastFrameUrl: string | undefined;

    for (const [nodeId, output] of Object.entries(outputs)) {
      logger.debug(`Video node ${nodeId} output type: ${typeof output}`);
      logger.debug(`Video node ${nodeId} output keys: ${output && typeof output === "object" ? Object.keys(output).join(", ") : "N/A"}`);
      logger.debug(`Video node ${nodeId} output: ${JSON.stringify(output).slice(0, 500)}`);
      try {
        if (output && typeof output === "object") {
          // Check for ComfyUI video format: { videos: [[filename, subfolder, type], ...] }
          if ("videos" in output) {
            const videoData = output as { videos: unknown[] };
            logger.debug(`Found videos array with ${videoData.videos.length} items`);

            for (const video of videoData.videos) {
              if (Array.isArray(video) && video.length >= 1) {
                const [filename, subfolder = "", type = "output"] = video as string[];
                const videoUrl = `${effectiveBaseUrl}/view?filename=${filename}&subfolder=${subfolder}&type=${type}`;
                logger.debug(`Downloading video: ${filename}`);
                const savedPath = await this.downloadVideo(videoUrl, outputDir, effectiveApiKey);
                resultVideos.push(savedPath);
              } else if (typeof video === "string") {
                const videoUrl = `${effectiveBaseUrl}/view?filename=${video}`;
                const savedPath = await this.downloadVideo(videoUrl, outputDir, effectiveApiKey);
                resultVideos.push(savedPath);
              }
            }
          }
          // Check for VHS_VideoCombine / Wan2.2 output format: { images: [{filename, subfolder, type}], animated: [true] }
          else if ("gifs" in output || "images" in output) {
            const videoOutput = output as { gifs?: unknown[]; images?: unknown[] };
            const items = videoOutput.gifs || videoOutput.images || [];
            for (const item of items) {
              // Handle array format [filename, subfolder, type]
              if (Array.isArray(item) && item.length >= 1) {
                const [filename, subfolder = "", type = "output"] = item as string[];
                const videoUrl = `${effectiveBaseUrl}/view?filename=${filename}&subfolder=${subfolder}&type=${type}`;
                logger.debug("Downloading video (VHS): ${filename}");
                const savedPath = await this.downloadVideo(videoUrl, outputDir, effectiveApiKey);
                resultVideos.push(savedPath);
              } else if (item && typeof item === "object" && "filename" in item) {
                // Handle object format {filename, subfolder, type} - Wan2.2 format
                const itemObj = item as { filename: string; subfolder?: string; type?: string };
                const filename = itemObj.filename;
                const subfolder = itemObj.subfolder || "";
                const type = itemObj.type || "output";
                const videoUrl = `${effectiveBaseUrl}/view?filename=${filename}&subfolder=${subfolder}&type=${type}`;
                logger.debug("Downloading video (Wan2.2): ${filename}");
                const savedPath = await this.downloadVideo(videoUrl, outputDir, effectiveApiKey);
                resultVideos.push(savedPath);
                if ((filename.endsWith(".mp4") || filename.endsWith(".webm")) && !lastFrameUrl) {
                  lastFrameUrl = savedPath;
                }
              } else if (typeof item === "string") {
                const videoUrl = `${effectiveBaseUrl}/view?filename=${item}`;
                logger.debug("Downloading video: ${item}");
                const savedPath = await this.downloadVideo(videoUrl, outputDir, effectiveApiKey);
                resultVideos.push(savedPath);
              }
            }
          }
        }
      } catch (nodeError) {
        logger.error("Error processing video node ${nodeId}:", nodeError);
      }
    }

    if (resultVideos.length === 0) {
      logger.error("No videos generated from workflow");
      throw new Error("ComfyUI video workflow completed but no videos were generated. Please check your workflow configuration.");
    }

    return {
      filePath: resultVideos[0],
      lastFrameUrl,
    };
  }

  /**
   * 清除队列
   */
  async clearQueue(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/queue`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to clear queue: ${response.status}`);
    }
  }

  /**
   * 中断正在运行的任务
   */
  async interrupt(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/interrupt`, {
      method: "POST",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to interrupt: ${response.status}`);
    }
  }
}

export default ComfyUIProvider;