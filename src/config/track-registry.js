// Track Registry
// Maps (songName, username) to track identifiers for fast direct API calls
// When a track is found via search, add its identifier here to avoid future searches

export const TRACK_REGISTRY = {
  // Format: "songName|username": "tracks/identifier"
  "Blue Eyes (Trust Fund)|dquerg": "tracks/6348163o",
  "Beast Within|dquerg": "tracks/s5t33uq934",
  "#BBCHTRN|dquerg": "tracks/sklq6znmcg",
  "#DFNTLYNABYPK|dquerg": "tracks/v4zrg5sc",
  "kitsch (Kepz Remix)|various": "tracks/phzqh1z0u",
  "Five Hundred|various": "tracks/five_hundred-9i62haos1",
  "Sackgesicht|various": "tracks/sackgesicht-7kgagh1r",
  "Back To You - Icebox, SIREN & dcln|various": "tracks/5nobkdly",
};

/**
 * Get track identifier from registry
 * @param {string} songName - Song name
 * @param {string} username - Username
 * @returns {string|null} Track identifier or null if not found
 */
export function getTrackIdentifier(songName, username) {
  const key = `${songName}|${username}`;
  return TRACK_REGISTRY[key] || null;
}

/**
 * Save track identifier to registry (in-memory only, requires code update for persistence)
 * @param {string} songName - Song name
 * @param {string} username - Username
 * @param {string} trackIdentifier - Track identifier (e.g., "tracks/abc123")
 */
export function saveTrackIdentifier(songName, username, trackIdentifier) {
  const key = `${songName}|${username}`;
  TRACK_REGISTRY[key] = trackIdentifier;
  console.log(`💾 Track identifier saved: ${key} -> ${trackIdentifier}`);
  console.log(`📝 Update src/config/track-registry.js with: "${key}": "${trackIdentifier}",`);
}

