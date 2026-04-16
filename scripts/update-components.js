#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const componentFiles = [
  'src/components/settings/provider-form.tsx',
  'src/components/editor/script-editor.tsx',
  'src/components/editor/manual-outline-dialog.tsx',
  'src/components/editor/manual-script-dialog.tsx',
  'src/components/editor/character-card.tsx',
  'src/components/editor/upload-script-dialog.tsx',
  'src/components/comfyui/workflow-manager.tsx',
  'src/components/comfyui/provider-manager.tsx',
];

componentFiles.forEach(filePath => {
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
      const contextName = path.basename(filePath, path.extname(filePath));
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