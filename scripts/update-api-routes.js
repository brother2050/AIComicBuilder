#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const apiFiles = [
  'src/app/api/comfyui/proxy/route.ts',
  'src/app/api/comfyui/status/[id]/route.ts',
  'src/app/api/comfyui/run/route.ts',
  'src/app/api/comfyui/providers/route.ts',
  'src/app/api/comfyui/providers/[id]/route.ts',
  'src/app/api/comfyui/workflows/route.ts',
  'src/app/api/comfyui/workflows/[id]/route.ts',
  'src/app/api/projects/[id]/route.ts',
  'src/app/api/projects/[id]/upload-script/route.ts',
  'src/app/api/projects/[id]/merge-episodes/route.ts',
  'src/app/api/projects/[id]/episodes/[episodeId]/route.ts',
  'src/app/api/projects/[id]/import/characters/route.ts',
  'src/app/api/projects/[id]/import/split/route.ts',
  'src/app/api/models/list/route.ts',
];

apiFiles.forEach(filePath => {
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
      const contextName = filePath.replace(/src\/app\/api\/(.+)\/route\.ts/, '$1').replace(/\//g, ':').replace(/\[|\]/g, '');
      content = content.slice(0, importEndIndex + 1) + 
                '\nimport { createLogger } from "@/lib/logger";' +
                '\n\nconst logger = createLogger("' + contextName + '");' +
                content.slice(importEndIndex + 1);
    }
  }
  
  // Replace console calls
  content = content.replace(/console\.log\(/g, 'logger.info(');
  content = content.replace(/console\.error\(/g, 'logger.error(');
  content = content.replace(/console\.warn\(/g, 'logger.warn(');
  content = content.replace(/console\.info\(/g, 'logger.info(');
  content = content.replace(/console\.debug\(/g, 'logger.debug(');
  
  if (content !== originalContent) {
    fs.writeFileSync(fullPath, content, 'utf-8');
    console.log(`Updated ${filePath}`);
  } else {
    console.log(`No changes needed for ${filePath}`);
  }
});