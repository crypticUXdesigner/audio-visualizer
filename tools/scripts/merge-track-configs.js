// Merge track-registry.js and engagement-tracks-cache.js into unified config
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function mergeConfigs() {
  const projectRoot = join(__dirname, '../..');
  const registryPath = join(projectRoot, 'src/config/track-registry.js');
  const engagementPath = join(projectRoot, 'src/config/engagement-tracks-cache.js');
  
  console.log('📖 Reading config files...');
  const registryContent = readFileSync(registryPath, 'utf-8');
  const engagementContent = readFileSync(engagementPath, 'utf-8');
  
  // Extract TRACK_REGISTRY object using regex
  const registryMatch = registryContent.match(/export const TRACK_REGISTRY = ({[\s\S]*?});/);
  if (!registryMatch) {
    throw new Error('Could not extract TRACK_REGISTRY');
  }
  const registryObj = eval(`(${registryMatch[1]})`);
  
  // Extract ENGAGEMENT_TRACKS_CACHE object
  const engagementMatch = engagementContent.match(/export const ENGAGEMENT_TRACKS_CACHE = ({[\s\S]*?});/);
  if (!engagementMatch) {
    throw new Error('Could not extract ENGAGEMENT_TRACKS_CACHE');
  }
  const engagementObj = eval(`(${engagementMatch[1]})`);
  
  // Extract CACHE_METADATA if it exists
  const metadataMatch = engagementContent.match(/export const CACHE_METADATA = ({[\s\S]*?});/);
  const metadata = metadataMatch ? eval(`(${metadataMatch[1]})`) : {};
  
  console.log(`   Registry entries: ${Object.keys(registryObj).length}`);
  console.log(`   Engagement tracks: ${Object.keys(engagementObj).length}`);
  
  // Build unified TRACKS_DATA
  // Start with engagement tracks (they have full data)
  const tracksData = { ...engagementObj };
  
  // Get all track identifiers from registry
  const registryIdentifiers = new Set(Object.values(registryObj));
  const engagementIdentifiers = new Set(Object.keys(engagementObj));
  
  // Find registry tracks that aren't in engagement cache
  const missingFromData = Array.from(registryIdentifiers).filter(id => !engagementIdentifiers.has(id));
  
  console.log(`   Registry tracks missing from engagement cache: ${missingFromData.length}`);
  
  // Count unique tracks
  const allIdentifiers = new Set([...registryIdentifiers, ...engagementIdentifiers]);
  
  console.log(`\n📊 Merge Summary:`);
  console.log(`   Total unique track identifiers: ${allIdentifiers.size}`);
  console.log(`   Tracks with full data: ${Object.keys(tracksData).length}`);
  console.log(`   Registry-only tracks (no full data): ${missingFromData.length}`);
  
  // Generate unified config file
  const output = `// Unified Track Configuration
// Combines track registry and engagement tracks cache
// Last updated: ${new Date().toISOString()}
//
// Structure:
// - TRACK_REGISTRY: Maps "songName|username" -> "tracks/identifier" (for backward compatibility)
// - TRACKS_DATA: Maps "tracks/identifier" -> full track object (all tracks with complete data)
// - ENGAGEMENT_TRACKS_CACHE: Subset of TRACKS_DATA for engagement tracks only

// Track Registry: Maps (songName, username) to track identifiers
// Format: "songName|username": "tracks/identifier"
export const TRACK_REGISTRY = ${JSON.stringify(registryObj, null, 2)};

// Track Data: Full track objects keyed by track identifier
// Includes all tracks from engagement cache (tracks with full metadata)
// Format: "tracks/identifier": { full track object }
export const TRACKS_DATA = ${JSON.stringify(tracksData, null, 2)};

// Engagement Tracks: Subset of TRACKS_DATA that are engagement tracks
// Format: "tracks/identifier": { full track object }
export const ENGAGEMENT_TRACKS_CACHE = ${JSON.stringify(engagementObj, null, 2)};

// Metadata
export const CACHE_METADATA = ${JSON.stringify({
  ...metadata,
  totalTracks: Object.keys(tracksData).length,
  engagementTracks: Object.keys(engagementObj).length,
  registryTracks: Object.keys(registryObj).length,
  uniqueTrackIdentifiers: allIdentifiers.size,
  mergedAt: new Date().toISOString()
}, null, 2)};

// Helper functions (from original track-registry.js)
/**
 * Get track identifier from registry
 * @param {string} songName - Song name
 * @param {string} username - Username
 * @returns {string|null} Track identifier or null if not found
 */
export function getTrackIdentifier(songName, username) {
  const key = \`\${songName}|\${username}\`;
  return TRACK_REGISTRY[key] || null;
}

/**
 * Get full track data by identifier
 * @param {string} trackIdentifier - Track identifier (e.g., "tracks/abc123")
 * @returns {object|null} Full track object or null if not found
 */
export function getTrackData(trackIdentifier) {
  return TRACKS_DATA[trackIdentifier] || null;
}

/**
 * Get engagement track by identifier
 * @param {string} trackIdentifier - Track identifier
 * @returns {object|null} Engagement track object or null if not found
 */
export function getEngagementTrack(trackIdentifier) {
  return ENGAGEMENT_TRACKS_CACHE[trackIdentifier] || null;
}

/**
 * Save track identifier to registry (in-memory only, requires code update for persistence)
 * @param {string} songName - Song name
 * @param {string} username - Username
 * @param {string} trackIdentifier - Track identifier (e.g., "tracks/abc123")
 */
export function saveTrackIdentifier(songName, username, trackIdentifier) {
  const key = \`\${songName}|\${username}\`;
  TRACK_REGISTRY[key] = trackIdentifier;
  console.log(\`💾 Track identifier saved: \${key} -> \${trackIdentifier}\`);
  console.log(\`📝 Update src/config/tracks-config.js with: "\${key}": "\${trackIdentifier}",\`);
}

/**
 * Transform old track ID to new track ID format
 * @param {string} oldId - Old track identifier
 * @returns {string} New track identifier in format "tracks/{transformed_id}"
 */
export function transformOldTrackId(oldId) {
  let transformed = oldId.toLowerCase();
  transformed = transformed.replace(/%/g, 'x-');
  transformed = transformed.replace(/\\*/g, 'y-');
  transformed = transformed.replace(/\\./g, 'z-');
  return \`tracks/\${transformed}\`;
}
`;

  // Write unified config
  const outputPath = join(projectRoot, 'src/config/tracks-config.js');
  writeFileSync(outputPath, output, 'utf-8');
  
  console.log(`\n✅ Unified config written to: ${outputPath}`);
  console.log(`\n📝 Next steps:`);
  console.log(`   1. Review the merged config`);
  console.log(`   2. Update imports in code to use tracks-config.js`);
  console.log(`   3. Optionally remove old config files after verification`);
}

mergeConfigs();

