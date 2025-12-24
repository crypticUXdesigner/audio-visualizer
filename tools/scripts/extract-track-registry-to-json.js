// Extract track registry data from TypeScript file to JSON files
// This script reads trackRegistry.ts and extracts the data objects to JSON files

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function extractObject(content, startMarker, endMarker) {
  const startIndex = content.indexOf(startMarker);
  if (startIndex === -1) {
    throw new Error(`Could not find start marker: ${startMarker}`);
  }
  
  // Find the matching closing brace
  let braceCount = 0;
  let inString = false;
  let stringChar = null;
  let i = startIndex + startMarker.length;
  
  // Skip whitespace and opening brace
  while (i < content.length && (content[i] === ' ' || content[i] === '\n' || content[i] === '\r' || content[i] === '\t' || content[i] === '=')) {
    i++;
  }
  
  if (content[i] !== '{') {
    throw new Error(`Expected opening brace after ${startMarker}`);
  }
  
  const objectStart = i;
  braceCount = 1;
  i++;
  
  while (i < content.length && braceCount > 0) {
    const char = content[i];
    const prevChar = i > 0 ? content[i - 1] : '';
    
    // Handle strings
    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = null;
      }
    }
    
    // Count braces (only when not in string)
    if (!inString) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
    }
    
    i++;
  }
  
  if (braceCount !== 0) {
    throw new Error(`Unmatched braces in ${startMarker}`);
  }
  
  const objectContent = content.substring(objectStart, i);
  
  // Try to parse as JSON (TypeScript object literals are mostly JSON-compatible)
  try {
    // Remove trailing semicolon if present
    const cleaned = objectContent.trim();
    return JSON.parse(cleaned);
  } catch (e) {
    // If direct JSON parse fails, try eval (safe in this context as we control the input)
    try {
      return eval(`(${objectContent})`);
    } catch (evalError) {
      throw new Error(`Failed to parse object: ${evalError.message}`);
    }
  }
}

function extractMetadata(content) {
  const startMarker = 'export const CACHE_METADATA:';
  const startIndex = content.indexOf(startMarker);
  if (startIndex === -1) {
    throw new Error('Could not find CACHE_METADATA');
  }
  
  // Find the `=` sign after the type annotation
  let i = startIndex + startMarker.length;
  
  // Skip to the `=` sign
  while (i < content.length && content[i] !== '=') {
    i++;
  }
  
  if (i >= content.length) {
    throw new Error('Could not find = after CACHE_METADATA type');
  }
  
  i++; // Skip the `=`
  
  // Skip whitespace
  while (i < content.length && (content[i] === ' ' || content[i] === '\n' || content[i] === '\r' || content[i] === '\t')) {
    i++;
  }
  
  if (content[i] !== '{') {
    throw new Error('Expected opening brace after CACHE_METADATA =');
  }
  
  // Find the matching closing brace
  let braceCount = 0;
  let inString = false;
  let stringChar = null;
  const objectStart = i;
  braceCount = 1;
  i++;
  
  while (i < content.length && braceCount > 0) {
    const char = content[i];
    const prevChar = i > 0 ? content[i - 1] : '';
    
    // Handle strings
    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = null;
      }
    }
    
    // Count braces (only when not in string)
    if (!inString) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
    }
    
    i++;
  }
  
  if (braceCount !== 0) {
    throw new Error('Unmatched braces in CACHE_METADATA');
  }
  
  let objectContent = content.substring(objectStart, i);
  
  // Remove trailing semicolon if present
  objectContent = objectContent.trim();
  while (objectContent.endsWith(';')) {
    objectContent = objectContent.slice(0, -1).trim();
  }
  
  try {
    return JSON.parse(objectContent);
  } catch (e) {
    try {
      return eval(`(${objectContent})`);
    } catch (evalError) {
      throw new Error(`Failed to parse CACHE_METADATA: ${evalError.message}`);
    }
  }
}

function main() {
  const projectRoot = join(__dirname, '../..');
  const registryPath = join(projectRoot, 'src/config/trackRegistry.ts');
  const outputDir = join(projectRoot, 'public/data');
  
  console.log('📖 Reading trackRegistry.ts...');
  const content = readFileSync(registryPath, 'utf-8');
  
  console.log('🔍 Extracting data objects...');
  
  // Extract TRACK_REGISTRY
  console.log('  - Extracting TRACK_REGISTRY...');
  const TRACK_REGISTRY = extractObject(content, 'export const TRACK_REGISTRY: Record<string, string> =', 'export const TRACKS_DATA');
  console.log(`    ✓ Found ${Object.keys(TRACK_REGISTRY).length} registry entries`);
  
  // Extract TRACKS_DATA
  console.log('  - Extracting TRACKS_DATA...');
  const TRACKS_DATA = extractObject(content, 'export const TRACKS_DATA: Record<string, Track> =', 'export const ENGAGEMENT_TRACKS_CACHE');
  console.log(`    ✓ Found ${Object.keys(TRACKS_DATA).length} tracks`);
  
  // Extract ENGAGEMENT_TRACKS_CACHE
  console.log('  - Extracting ENGAGEMENT_TRACKS_CACHE...');
  const ENGAGEMENT_TRACKS_CACHE = extractObject(content, 'export const ENGAGEMENT_TRACKS_CACHE: Record<string, Track> =', 'export const CACHE_METADATA');
  console.log(`    ✓ Found ${Object.keys(ENGAGEMENT_TRACKS_CACHE).length} engagement tracks`);
  
  // Extract CACHE_METADATA
  console.log('  - Extracting CACHE_METADATA...');
  const CACHE_METADATA = extractMetadata(content);
  console.log(`    ✓ Metadata extracted`);
  
  // Create output directory
  mkdirSync(outputDir, { recursive: true });
  
  // Write JSON files
  console.log('💾 Writing JSON files...');
  writeFileSync(
    join(outputDir, 'track-registry.json'),
    JSON.stringify(TRACK_REGISTRY, null, 2),
    'utf-8'
  );
  console.log(`  ✓ Written track-registry.json (${Object.keys(TRACK_REGISTRY).length} entries)`);
  
  writeFileSync(
    join(outputDir, 'tracks-data.json'),
    JSON.stringify(TRACKS_DATA, null, 2),
    'utf-8'
  );
  console.log(`  ✓ Written tracks-data.json (${Object.keys(TRACKS_DATA).length} tracks)`);
  
  writeFileSync(
    join(outputDir, 'engagement-tracks-cache.json'),
    JSON.stringify(ENGAGEMENT_TRACKS_CACHE, null, 2),
    'utf-8'
  );
  console.log(`  ✓ Written engagement-tracks-cache.json (${Object.keys(ENGAGEMENT_TRACKS_CACHE).length} tracks)`);
  
  writeFileSync(
    join(outputDir, 'cache-metadata.json'),
    JSON.stringify(CACHE_METADATA, null, 2),
    'utf-8'
  );
  console.log(`  ✓ Written cache-metadata.json`);
  
  console.log('✅ Extraction complete!');
  console.log(`📁 Files written to: ${outputDir}`);
}

main();

