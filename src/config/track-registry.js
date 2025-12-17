// Track Registry
// Maps (songName, username) to track identifiers for fast direct API calls
// When a track is found via search, add its identifier here to avoid future searches

export const TRACK_REGISTRY = {
  // Format: "songName|username": "tracks/identifier"
  // Sorted alphabetically by song name
  "#BBCHTRN|dquerg": "tracks/sklq6znmcg",
  "#DFNTLYNABYPK|dquerg": "tracks/v4zrg5sc",
  "Back To You - Icebox, SIREN & dcln|various": "tracks/5nobkdly",
  "Beast Within|dquerg": "tracks/s5t33uq934",
  "Blue Eyes (Trust Fund)|dquerg": "tracks/6348163o",
  "BRAE|audiotool": "tracks/c6u2qlx2",
  "cozy|audiotool": "tracks/pj1babztxhr",
  "Diatoma|audiotool": "tracks/p5o3dc7mm",
  "Esports World Cup Anthem #7 (Franz Fritz)|audiotool": "tracks/vfw4stlnlg",
  "feels like summer|audiotool": "tracks/x14wgdw3",
  "Five Hundred|various": "tracks/five_hundred-9i62haos1",
  "Fluid|audiotool": "tracks/d8gud97n8fd",
  "FOR LIFE|audiotool": "tracks/2r7664s10",
  "frisbee|audiotool": "tracks/xal9kjfhr",
  "homeless on I-95 & dock st|audiotool": "tracks/4ullagnt6l6",
  "Honey Lemon|audiotool": "tracks/3dglxy0oj3e",
  "Isomorph|audiotool": "tracks/8ezgwh0q420",
  "kitsch (Kepz Remix)|various": "tracks/phzqh1z0u",
  "knobs|audiotool": "tracks/vu2n6cekzk",
  "lazy sunday|audiotool": "tracks/yb9nzj7i",
  "legend|audiotool": "tracks/fmvcgjt31z",
  "lost|audiotool": "tracks/lxz6qz8o98",
  "MONOLITH|audiotool": "tracks/wfxh32l1ruq",
  "No Space, No Light (ATD 24 entry)|audiotool": "tracks/jjzd61y8gxx",
  "No timeline|audiotool": "tracks/10jshvkgbfy",
  "Overthinking pt3|audiotool": "tracks/v3tk6xhc0oqa",
  "Overthinking pt4|audiotool": "tracks/igjqcd7ixu",
  "phase|audiotool": "tracks/yup4hw63kv",
  "Rosary - Esport World Cup [Street fighter]|audiotool": "tracks/k0021yvki5h5",
  "Sackgesicht|various": "tracks/sackgesicht-7kgagh1r",
  "Sandstorm|audiotool": "tracks/qlruh4mofrma",
  "skyburst! [ATD2020]|audiotool": "tracks/x1f08pfr3n",
  "Starforge (Vulkronix 4.0)|audiotool": "tracks/gu2vsxe1k",
  "stars align|audiotool": "tracks/mb6oqwc1",
  "SUNDAY GROOVE|audiotool": "tracks/pldwk3pkezv1",
  "that recital i missed|audiotool": "tracks/da0tkheo0f",
  "the red moon's egg|audiotool": "tracks/ahntfhcz35",
  "THE WORST - Tim Derry Remix|audiotool": "tracks/t8sdit1q",
  "Thundyre|audiotool": "tracks/bd6c2oqh9",
  "u a fan|audiotool": "tracks/xctl53ponq7x",
  "United (EWC - Tekken 8)|audiotool": "tracks/k2lzshmci6s",
  "Versatile (Remix)|audiotool": "tracks/v2t6zor98u",
  "Who told you?|audiotool": "tracks/ov3argzlaj",
  "yōsei|audiotool": "tracks/an5k1uqmr",
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

