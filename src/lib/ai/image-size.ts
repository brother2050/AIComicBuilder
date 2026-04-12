/**
 * Image size constraints and utilities for different providers
 * Handles model-specific size requirements (alignment, pixel limits, etc.)
 */

export interface ImageSizeConstraints {
  /** Minimum dimension in pixels */
  minSize: number;
  /** Maximum dimension in pixels */
  maxSize: number;
  /** Alignment requirement (dimension must be divisible by this) */
  alignment: number;
  /** Maximum total pixels (width * height) */
  maxPixels: number;
  /** Default size for common aspect ratios */
  defaultSizes: {
    "16:9": string;
    "9:16": string;
    "1:1": string;
  };
  /** Available preset sizes */
  presets: string[];
}

/**
 * Provider/model constraints configuration
 */
export const IMAGE_SIZE_CONSTRAINTS: Record<string, ImageSizeConstraints> = {
  // GLM / 智谱 (CogView-3/4)
  // 长宽: 1024-2048px, 32倍数, 最大像素 ≤2^22 (4,194,304)
  glm: {
    minSize: 1024,
    maxSize: 2048,
    alignment: 32,
    maxPixels: 2 ** 22,
    defaultSizes: {
      "16:9": "1728x960",
      "9:16": "960x1728",
      "1:1": "1280x1280",
    },
    presets: ["1280x1280", "1568x1056", "1056x1568", "1472x1088", "1088x1472", "1728x960", "960x1728"],
  },

  // DALL-E / OpenAI standard
  // 长宽: 512-2048px, 16倍数, 最大像素 ≤2^21 (2,097,152)
  dall_e: {
    minSize: 512,
    maxSize: 2048,
    alignment: 16,
    maxPixels: 2 ** 21,
    defaultSizes: {
      "16:9": "1024x576",
      "9:16": "576x1024",
      "1:1": "1024x1024",
    },
    presets: ["1024x1024", "768x1344", "864x1152", "1344x768", "1152x864", "1440x720", "720x1440"],
  },

  // Midjourney compatible (similar to DALL-E)
  midjourney: {
    minSize: 512,
    maxSize: 2048,
    alignment: 16,
    maxPixels: 2 ** 21,
    defaultSizes: {
      "16:9": "1024x576",
      "9:16": "576x1024",
      "1:1": "1024x1024",
    },
    presets: ["1024x1024", "768x1344", "864x1152", "1344x768", "1152x864", "1440x720", "720x1440"],
  },

  // Stable Diffusion compatible
  stable_diffusion: {
    minSize: 512,
    maxSize: 2048,
    alignment: 8,
    maxPixels: 2 ** 21,
    defaultSizes: {
      "16:9": "1024x576",
      "9:16": "576x1024",
      "1:1": "1024x1024",
    },
    presets: ["1024x1024", "768x1344", "1024x576", "576x1024"],
  },

  // Fallback / generic provider
  default: {
    minSize: 512,
    maxSize: 2048,
    alignment: 16,
    maxPixels: 2 ** 21,
    defaultSizes: {
      "16:9": "1024x576",
      "9:16": "576x1024",
      "1:1": "1024x1024",
    },
    presets: ["1024x1024", "768x1344", "864x1152", "1344x768", "1152x864", "1440x720", "720x1440"],
  },
};

interface ModelMatchRule {
  patterns: (string | RegExp)[];
  constraintKey: string;
}

/** Rules to match model/provider to size constraints */
const MODEL_MATCH_RULES: ModelMatchRule[] = [
  // GLM / 智谱
  {
    patterns: [/glm/i, /cogview/i, /bigmodel/i],
    constraintKey: "glm",
  },
  // OpenAI DALL-E
  {
    patterns: [/dall-e/i, /^gpt-/i, /gpt-image/i],
    constraintKey: "dall_e",
  },
  // Midjourney
  {
    patterns: [/midjourney/i, /mj-/i],
    constraintKey: "midjourney",
  },
  // Stable Diffusion
  {
    patterns: [/stable/i, /sd-/i, /sdxl/i, /flux/i],
    constraintKey: "stable_diffusion",
  },
];

/**
 * Detect provider/model constraints based on modelId or baseUrl
 */
export function getImageSizeConstraints(
  modelId?: string,
  baseUrl?: string
): ImageSizeConstraints {
  const normalizedModelId = (modelId || "").toLowerCase();
  const normalizedBaseUrl = (baseUrl || "").toLowerCase();
  const combined = `${normalizedModelId} ${normalizedBaseUrl}`;

  for (const rule of MODEL_MATCH_RULES) {
    for (const pattern of rule.patterns) {
      const regex = typeof pattern === "string" ? new RegExp(pattern, "i") : pattern;
      if (regex.test(combined)) {
        return IMAGE_SIZE_CONSTRAINTS[rule.constraintKey];
      }
    }
  }

  return IMAGE_SIZE_CONSTRAINTS.default;
}

/**
 * Parse size string like "1024x768" into width and height
 */
export function parseSize(size: string): { width: number; height: number } | null {
  const match = size.match(/^(\d+)x(\d+)$/i);
  if (!match) return null;
  return {
    width: parseInt(match[1], 10),
    height: parseInt(match[2], 10),
  };
}

/**
 * Check if a preset size is valid for given constraints
 */
export function isValidPreset(
  size: string,
  constraints: ImageSizeConstraints
): boolean {
  return constraints.presets.includes(size);
}

/**
 * Validate if a size string meets all constraints
 */
export function validateSize(
  width: number,
  height: number,
  constraints: ImageSizeConstraints
): { valid: boolean; reason?: string } {
  // Check dimension range
  if (width < constraints.minSize || width > constraints.maxSize) {
    return { valid: false, reason: `width ${width} not in range [${constraints.minSize}, ${constraints.maxSize}]` };
  }
  if (height < constraints.minSize || height > constraints.maxSize) {
    return { valid: false, reason: `height ${height} not in range [${constraints.minSize}, ${constraints.maxSize}]` };
  }

  // Check alignment
  if (width % constraints.alignment !== 0) {
    return { valid: false, reason: `width ${width} not divisible by ${constraints.alignment}` };
  }
  if (height % constraints.alignment !== 0) {
    return { valid: false, reason: `height ${height} not divisible by ${constraints.alignment}` };
  }

  // Check max pixels
  const totalPixels = width * height;
  if (totalPixels > constraints.maxPixels) {
    return { valid: false, reason: `total pixels ${totalPixels} exceeds max ${constraints.maxPixels}` };
  }

  return { valid: true };
}

/**
 * Adjust dimensions to meet constraints
 * Returns the closest valid dimensions within constraints
 */
export function adjustSizeToConstraints(
  width: number,
  height: number,
  constraints: ImageSizeConstraints,
  aspectRatio?: string
): { width: number; height: number; sizeString: string; isPreset: boolean } {
  const validation = validateSize(width, height, constraints);
  if (validation.valid) {
    return {
      width,
      height,
      sizeString: `${width}x${height}`,
      isPreset: isValidPreset(`${width}x${height}`, constraints),
    };
  }

  // Calculate target area (try to maintain original area if reasonable)
  let targetArea = width * height;
  if (targetArea > constraints.maxPixels) {
    targetArea = Math.floor(constraints.maxPixels * 0.9);
  }

  // Determine aspect ratio
  let targetRatio = width / height;
  if (aspectRatio) {
    const [w, h] = aspectRatio.split(":").map(Number);
    targetRatio = w / h;
  }

  // Calculate dimensions that satisfy all constraints
  let newWidth = Math.round(Math.sqrt(targetArea * targetRatio));
  let newHeight = Math.round(newWidth / targetRatio);

  // Apply alignment
  newWidth = Math.floor(newWidth / constraints.alignment) * constraints.alignment;
  newHeight = Math.floor(newHeight / constraints.alignment) * constraints.alignment;

  // Clamp to valid range
  newWidth = Math.max(constraints.minSize, Math.min(constraints.maxSize, newWidth));
  newHeight = Math.max(constraints.minSize, Math.min(constraints.maxSize, newHeight));

  // Ensure alignment after clamping
  newWidth = Math.floor(newWidth / constraints.alignment) * constraints.alignment;
  newHeight = Math.floor(newHeight / constraints.alignment) * constraints.alignment;

  // Final pixel check
  if (newWidth * newHeight > constraints.maxPixels) {
    const scale = Math.sqrt(constraints.maxPixels * 0.9 / (newWidth * newHeight));
    newWidth = Math.floor((newWidth * scale) / constraints.alignment) * constraints.alignment;
    newHeight = Math.floor((newHeight * scale) / constraints.alignment) * constraints.alignment;
  }

  return {
    width: newWidth,
    height: newHeight,
    sizeString: `${newWidth}x${newHeight}`,
    isPreset: isValidPreset(`${newWidth}x${newHeight}`, constraints),
  };
}

/**
 * Resolve image size based on user preference, provider constraints, and aspect ratio
 */
export function resolveImageSize(
  userSize?: string,
  modelId?: string,
  baseUrl?: string,
  preferredRatio?: string
): { width: number; height: number; sizeString: string; isPreset: boolean } {
  const constraints = getImageSizeConstraints(modelId, baseUrl);

  // If user specified a size, try to use it (adjusting if needed)
  if (userSize) {
    const parsed = parseSize(userSize);
    if (parsed) {
      return adjustSizeToConstraints(parsed.width, parsed.height, constraints, preferredRatio);
    }
  }

  // Fall back to default size for the ratio
  const ratio = preferredRatio || "16:9";
  const defaultSize = constraints.defaultSizes[ratio as keyof typeof constraints.defaultSizes] || constraints.defaultSizes["16:9"];
  const parsed = parseSize(defaultSize)!;

  return {
    width: parsed.width,
    height: parsed.height,
    sizeString: defaultSize,
    isPreset: true,
  };
}

/**
 * Get image options based on aspect ratio and provider constraints
 * This is the main function to use for image generation
 */
export function ratioToImageOpts(
  ratio?: string,
  modelId?: string,
  baseUrl?: string
): { aspectRatio?: string; size?: string } {
  const constraints = getImageSizeConstraints(modelId, baseUrl);
  const validRatio = ratio || "16:9";

  const size = constraints.defaultSizes[validRatio as keyof typeof constraints.defaultSizes] || constraints.defaultSizes["16:9"];

  return {
    aspectRatio: validRatio,
    size,
  };
}

/**
 * Get all available preset sizes for a provider
 */
export function getAvailablePresets(
  modelId?: string,
  baseUrl?: string
): { size: string; label: string }[] {
  const constraints = getImageSizeConstraints(modelId, baseUrl);

  return constraints.presets.map((size) => {
    const parsed = parseSize(size);
    const ratio = parsed ? getAspectRatioLabel(parsed.width, parsed.height) : "Custom";
    return {
      size,
      label: `${size} (${ratio})`,
    };
  });
}

/**
 * Get aspect ratio label from dimensions
 */
function getAspectRatioLabel(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}
