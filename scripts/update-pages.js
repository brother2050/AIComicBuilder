#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const pageFiles = [
  'src/app/[locale]/comfyui-workflows/page.tsx',
  'src/app/[locale]/project/[id]/episodes/[episodeId]/storyboard/page.tsx',
  'src/app/[locale]/project/[id]/episodes/[episodeId]/preview/page.tsx',
  'src/app/[locale]/project/[id]/episodes/[episodeId]/characters/page.tsx',
  'src/app/[locale]/project/[id]/episodes/page.tsx',
];

pageFiles.forEach(filePath => {
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
      const contextName = filePath.replace(/src\/app\/\[locale\]\/(.+)\/page\.tsx/, '$1').replace(/\//g, ':').replace(/\[|\]/g, '');
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