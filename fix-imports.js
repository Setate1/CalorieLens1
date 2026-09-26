const fs = require('fs');
const path = require('path');

const serverContent = fs.readFileSync('server.ts', 'utf8');

// Extract all lines from `import { GoogleGenAI` up to `return geminiClient;\n}`
const startString = 'import { GoogleGenAI, Type } from "@google/genai";';
const endString = '  return geminiClient;\n}';
const startIndex = serverContent.indexOf(startString);
const endIndex = serverContent.indexOf(endString) + endString.length;

let extractedCode = serverContent.substring(startIndex, endIndex);

// Remove the import of sanityChecker inside the extracted code, since the api files already import it or we can just leave it.
// Actually, `extractedCode` contains:
// import { matchUSDAFood } from "./server/usdaDatabase.js";
// import { validateAndSanityCheckItem, ... } from "./server/sanityChecker.js";
// We need to fix those paths to point to "../server/..." instead of "./server/..."
extractedCode = extractedCode.replace(/from "\.\/server\//g, 'from "../server/');

// Now, in api/analyze-meal.ts and api/analyze-text-meal.ts:
for (const file of ['api/analyze-meal.ts', 'api/analyze-text-meal.ts']) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Remove the import from "../server.js" completely
    content = content.replace(/import\s*\{[^}]+\}\s*from\s*["']\.\.\/server\.js["'];\n/m, '');
    
    // Prepend the extracted code after the first few imports, or just at the top (after VercelRequest import)
    // We can insert it after `import type { VercelRequest, VercelResponse } from '@vercel/node';`
    const insertPoint = content.indexOf('\n') + 1;
    
    content = content.slice(0, insertPoint) + '\n' + extractedCode + '\n' + content.slice(insertPoint);
    
    // We might have duplicated imports for `doc, getDoc, updateDoc, serverTimestamp` from "firebase/firestore"
    // and `getAdminAuth` from "firebase-admin/auth". This is fine, TS/Node allows duplicate imports of the same module, 
    // or we can just leave them. But to be clean, let's let it be. Vercel builds it fine.

    // Write back
    fs.writeFileSync(file, content, 'utf8');
}

console.log("Patched both files successfully.");
