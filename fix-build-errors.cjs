#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 Fixing TypeScript build errors...');

// 1. Fix missing 'file' property in SourceLocation
const addFileProperty = (filePath, content) => {
  // Pattern: { line: number, column: number }
  const pattern = /\{\s*line:\s*(\d+),\s*column:\s*(\d+)\s*\}/g;
  const replacement = `{ line: $1, column: $2, file: '${filePath}' }`;
  return content.replace(pattern, replacement);
};

// 2. Fix missing 'id' property in ExtractedQuery
const addIdProperty = (content) => {
  // Look for query objects missing id
  const pattern = /(\{[^}]*name:\s*['"]\w+['"][^}]*\})/g;
  return content.replace(pattern, (match) => {
    if (!match.includes('id:')) {
      return match.replace('{', '{ id: \'generated-id\',');
    }
    return match;
  });
};

// 3. Fix missing 'namePattern' property in ResolvedQuery
const addNamePatternProperty = (content) => {
  // Add namePattern to query objects that need it
  const pattern = /(\{[^}]*query:\s*['"]\w+['"][^}]*\})/g;
  return content.replace(pattern, (match) => {
    if (!match.includes('namePattern:')) {
      return match.replace('{', '{ namePattern: { template: \'${queryName}\', version: \'V1\' },');
    }
    return match;
  });
};

// 4. Fix missing 'type' property in ExtractedQuery
const addTypeProperty = (content) => {
  const pattern = /(\{[^}]*name:\s*['"]\w+['"][^}]*\})/g;
  return content.replace(pattern, (match) => {
    if (!match.includes('type:')) {
      return match.replace('{', '{ type: \'query\',');
    }
    return match;
  });
};

// Function to process a file
const processFile = (filePath) => {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;
    
    // Apply fixes
    content = addFileProperty(filePath, content);
    content = addIdProperty(content);
    content = addNamePatternProperty(content);
    content = addTypeProperty(content);
    
    // Only write if content changed
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content);
      console.log(`✅ Fixed: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
};

// Process all test files
const processDirectory = (dirPath) => {
  try {
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        processDirectory(fullPath);
      } else if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) {
        processFile(fullPath);
      }
    }
  } catch (error) {
    console.error(`❌ Error processing directory ${dirPath}:`, error.message);
  }
};

// Start processing
const testDir = path.join(__dirname, 'src', 'test');
processDirectory(testDir);

console.log('🎉 Build error fixes completed!');