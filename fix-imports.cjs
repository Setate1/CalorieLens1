const fs = require('fs');
const path = require('path');

const serverContent = fs.readFileSync('server.ts', 'utf8');

// Extract all lines from `import { GoogleGenAI` up to `return geminiClient;\n}`
const startString = 'import { GoogleGenAI, Type } from "@google/genai";';
const endString = '  return geminiClient;\n}';
const startIndex = serverContent.indexOf(startString);
const endIndex = serverContent.indexOf(endString) + endString.length;

let extractedCode = serverContent.substring(startIndex, endIndex);

// We need to fix those paths to point to "../server/..." instead of "./server/..."
extractedCode = extractedCode.replace(/from "\.\/server\//g, 'from "../server/');

// Also replace duplicate firebase imports if any, but it's safe to keep them.

for (const file of ['api/analyze-meal.ts', 'api/analyze-text-meal.ts']) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Remove the import from "../server.js" completely
    content = content.replace(/import\s*\{[^}]+\}\s*from\s*["']\.\.\/server\.js["'];\n?/m, '');
    
    // Insert the extracted code after the last import
    const lastImportIndex = content.lastIndexOf('import ');
    const endOfLastImport = content.indexOf('\n', lastImportIndex) + 1;
    
    content = content.slice(0, endOfLastImport) + '\n' + extractedCode + '\n' + content.slice(endOfLastImport);

    fs.writeFileSync(file, content, 'utf8');
}
console.log("Patched both files successfully.");
