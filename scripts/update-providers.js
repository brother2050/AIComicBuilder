#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const files = [
  'src/lib/ai/providers/veo.ts',
  'src/lib/ai/providers/openai.ts',
  'src/lib/ai/providers/comfyui.ts',
  'src/lib/ai/providers/kling-image.ts',
  'src/lib/ai/providers/seedance.ts',
  'src/lib/ai/providers/kling-video.ts',
];

files.forEach(filePath => {
  const fullPath = path.join(__dirname, '..', filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`Skipping ${filePath} - file not found`);
    return;
  }
  
  let content = fs.readFileSync(fullPath, 'utf-8');
  const originalContent = content;
  
  // Add logger import if not present
  if (!content.includes("import { createLogger } from \"@/lib/logger\";")) {
    const lastImportIndex = content.lastIndexOf('import ');
    const importEndIndex = content.indexOf(';', lastImportIndex);
    if (importEndIndex !== -1) {
      content = content.slice(0, importEndIndex + 1) + 
                '\nimport { createLogger } from "@/lib/logger";' +
                '\n\nconst logger = createLogger(path.basename("' + filePath + '", ".ts"));' +
                content.slice(importEndIndex + 1);
    }
  }
  
  // Replace console calls
  const replacements = [
    [/console\.log\(`\[Veo\] mode=\$\{modeLabel\}, model=\$\{this\.model\}, duration=\$\{durationSeconds\}s, ratio=\$\{aspectRatio\}`\);/g, 'logger.debug(`mode=${modeLabel}, model=${this.model}, duration=${durationSeconds}s, ratio=${aspectRatio}`);'],
    [/console\.log\(`\[Veo\] mode=referenceImages, model=\$\{this\.model\}, refCount=\$\{referenceImages\.length\}, ratio=\$\{aspectRatio\}`\);/g, 'logger.debug(`mode=referenceImages, model=${this.model}, refCount=${referenceImages.length}, ratio=${aspectRatio}`);'],
    [/console\.log\(`\[Veo\] Video saved to \$\{downloadPath\}`\);/g, 'logger.info(`Video saved to ${downloadPath}`);'],
    [/console\.log\(`\[Veo\] Poll \$\{i \+ 1\}: done=\$\{operation\.done\}`\);/g, 'logger.debug(`Poll ${i + 1}: done=${operation.done}`);'],
    [/console\.error\("\[OpenAIProvider\] generateText error:", error\?\.message \|\| error\);/g, 'logger.error("generateText error", error?.message || error);'],
    [/console\.error\("\[OpenAIProvider\] Model:", options\?\.model \|\| this\.defaultModel\);/g, 'logger.error("Model", options?.model || this.defaultModel);'],
    [/console\.error\("\[OpenAIProvider\] Has images:", options\?\.images\?\.length \|\| 0\);/g, 'logger.error("Has images", options?.images?.length || 0);'],
    [/console\.error\("\[OpenAIProvider\] Messages length:", messages\.length\);/g, 'logger.error("Messages length", messages.length);'],
    [/console\.error\("\[OpenAIProvider\] Response data:", error\.response\.data\);/g, 'logger.error("Response data", error.response.data);'],
  ];
  
  replacements.forEach(([pattern, replacement]) => {
    content = content.replace(pattern, replacement);
  });
  
  // Generic replacements for ComfyUI
  content = content.replace(/console\.log\(`\[ComfyUI\] (.+?)`\);/g, 'logger.debug("$1");');
  content = content.replace(/console\.log\(`\[ComfyUI\] (.+?)`, (.+?)\);/g, 'logger.debug("$1", $2);');
  content = content.replace(/console\.error\(`\[ComfyUI\] (.+?)`\);/g, 'logger.error("$1");');
  content = content.replace(/console\.error\(`\[ComfyUI\] (.+?)`, (.+?)\);/g, 'logger.error("$1", $2);');
  content = content.replace(/console\.warn\(`\[ComfyUI\] (.+?)`\);/g, 'logger.warn("$1");');
  content = content.replace(/console\.warn\(`\[ComfyUI\] (.+?)`, (.+?)\);/g, 'logger.warn("$1", $2);');
  
  if (content !== originalContent) {
    fs.writeFileSync(fullPath, content, 'utf-8');
    console.log(`Updated ${filePath}`);
  } else {
    console.log(`No changes needed for ${filePath}`);
  }
});