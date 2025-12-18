// Standalone script to transform old track IDs and validate them against the Audiotool API
// This doesn't rely on Vite or Sentry

import fetch from 'node-fetch';

/**
 * Transform old track ID to new track ID format
 * @param {string} oldId - Old track identifier
 * @returns {string} New track identifier in format "tracks/{transformed_id}"
 */
function transformOldTrackId(oldId) {
  let transformed = oldId.toLowerCase();
  transformed = transformed.replace(/%/g, 'x-');
  transformed = transformed.replace(/\*/g, 'y-');
  transformed = transformed.replace(/\./g, 'z-');
  return `tracks/${transformed}`;
}

/**
 * Call the TrackService using Connect RPC format
 * @param {string} method - The RPC method name (e.g., "GetTrack")
 * @param {object} request - The request payload
 * @returns {Promise<object>} The response
 */
async function callTrackService(method, request) {
  const baseUrl = 'https://rpc.audiotool.com';
  const serviceName = 'audiotool.track.v1.TrackService';
  const url = `${baseUrl}/${serviceName}/${method}`;
  
  const headers = {
    'Content-Type': 'application/json',
  };
  
  const response = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(request),
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

/**
 * Get a specific track by name
 * @param {string} trackName - Track name in format "tracks/{id}" or just "{id}"
 * @returns {Promise<object>} Track information
 */
async function getTrack(trackName) {
  const normalizedName = trackName.startsWith('tracks/') 
    ? trackName 
    : `tracks/${trackName}`;
  
  const request = { name: normalizedName };
  const result = await callTrackService('GetTrack', request);
  
  if (result.track) {
    return {
      success: true,
      track: result.track,
    };
  } else {
    throw new Error('Track not found in response');
  }
}

// List of old track IDs to transform and validate
const oldTrackIds = [
  'v4zrg5sc',
  'sklq6znmcg',
  '6348163o',
  'ch5rt5polz',
  's5t33uq934',
  's33dupwcq',
  '4ullagnt6l6',
  'v3tk6xhc0oqa',
  'igjqcd7ixu',
  '4clrrhtgao1c',
  'jjzd61y8gxx',
  'bxxptrka0zt',
  'opu5hcxzvr',
  '6mpzweiiczsv',
  'yb9nzj7i',
  'yup4hw63kv',
  'xal9kjfhr',
  'v09u9cwz',
  'nf2egu4kr36c',
  'dmrrmp5c01f',
  'n1u0ki5csgc6',
  'g6oux0zbqwk',
  'l81yco33',
  '0ny2gzxi',
  'g4nch6444q',
  'pgalngf5tj4',
  'ggvjeg0tygh',
  'p2itondu4',
  'c2eqjvp22',
  'eoq8phpq',
  'd8gud97n8fd',
  'u131oveaf3yp',
  'tormo2pl882',
  '8ezgwh0q420',
  '3327n9kl',
  'r5bl0gltjom',
  'p5o3dc7mm',
  '75wn7dkvvr',
  'smz6xc7b17p3',
  'wq34hd4y6o',
  'j6xyqmdauai',
  'ioq8jlbo3d8',
  'gc0xta86be',
  '4uuwgrkurxou',
  'nlmdzflb5hdm',
  'pvpbn2tne8',
  's3srkmrb',
  '0s1dwjunam',
  '6vcpe4rfkg',
  'ep8snzqa',
  'tjeor91e52s5',
  '2cpp37ei',
  'wwd53z8qto8y',
  'xcagqk',
  'conjure_the_ocean',
  'giants',
  '9jocs31nx',
  'dughy9vxmhrrny9ldd9yayeuesaohoh',
  'eq4nc5h64his',
  'sm4wb1p8r0fj',
  '4b9qne1hdzm',
  '83mfygw1qs',
  'zycy4cs44hqe',
  '1072z6wedzn',
  '2ibr7jqvn8',
  '10jshvkgbfy',
  'jl9jtg5rg',
  'k1osiy4y9i7',
  'lni8ki6y',
  'ahntfhcz35',
  '7mhgv0xte',
  '8ykxragg74',
  '0f8m0ly7wgd',
  'smvre71gwp',
  'nycjc30z',
  'ht6z1etq',
  'ouim2q736',
  'u1nc7vr28k',
  'y1ud2i27mlfj',
  'bxnc8g0co9il',
  '9kbgrdjnkdgf',
  'ocze6c9me',
  'e8se8es9',
  'r3vi4czqe',
  '3g3vlw3j3l',
  '5e43g5duuq',
  'pq4n8039wj7',
  'x7umb1jq3bd',
  'ea2wmm8mwuhu',
  'an5k1uqmr',
  'g7kwswmzdooz',
  '27mq9crzo',
  '74o8qx2a1hpy',
  'e2k608gh9mf',
  'zixnxub8z7mm',
  '5fkyb5wn6ml',
  'oxb34vh9xhr',
  'nlmdzflb5hdm',
  'stagger_ft_vulkron',
  'starfall_1_5k',
  'remember-kxr7h0',
  'la_la-k5gst92qh',
  '5jtc1dotor',
  'wqt80fj2a6e',
  'hk5txwk3',
  '33o8fg6f0x6',
  '5j0pudknj',
  'b267lxs6h',
  'p83dthwpz5',
  'n9ydabxo3n',
  'sinister_x_x',
  'ws0npd73uxf',
  'jc0lvi0wa5c',
  'rb548nz7zd1r',
  'i7cyjz583uty',
  'nv94ioyhs6',
  'hftla1k16t',
  'vdluc0g3j',
  '60tciwin',
  '6xzgxz3j03',
  '0fu0tnm82dp',
  'bxnc8g0co9il',
  'aao46fsxs',
  'tfk7gdlzf',
  'qlysw8rqcq5',
  'q5vzehwmj4',
  'qsw6b6tst',
  '20m0d7hqg0',
  'ji4w5ozlf',
  'yk5o7krfg5l',
  '74o8qx2a1hpy',
  'jpxo4itkva',
  '83mfygw1qs',
  '60tciwin',
  'runaway-fnwfb',
  'iuvlxv9f',
  'u4z5rf3e',
  'oxb34vh9xhr',
  'pxy8wzncz9mx',
  'og0gd4x19bnr',
  '32xzk2819yt',
  'ov3argzlaj',
  'da0tkheo0f',
  'wfxh32l1ruq',
  'ybrzxnonvctk',
  'opuosg007',
  '6xz2lugx007b',
  'c6u2qlx2',
  'ftg7k2in6kd',
  'k0021yvki5h5',
  'k2lzshmci6s',
  'z99trxks',
  'xt4ixderoc',
  '4kwlm5gfe',
  '0ny2gzxi',
  'ug7sf5pm',
  'v12f9c5p9rnj',
  'mgf2z0jcpk',
  'huubqmixeu1',
  'gfkq7ari1',
  'ds9aweb0xxd',
  'ep8snzqa',
  'w5eu5eu13',
  'lexn1jv0k',
  'isa34vlvm',
  'audiophil',
  'nsi0w29197',
  'kwybp1p23',
  'or9wwaui',
  'ke3qno7asrj',
  'wfgfuh2w0d',
  '13zlzb6b',
  'vesvtyd7m',
  'vxc08owx2so',
  'dmvcxv2cn7wm',
  'xt2uc9a950g',
  'vir2rp4e',
  'tgiex1h5zat',
  'f6qqbn6quv',
  's9krdarex',
  'f30sdfk11',
  'iwd52a2x',
];

async function validateAndBuildRegistry() {
  console.log(`🔄 Processing ${oldTrackIds.length} track IDs...`);
  console.log('=' .repeat(80));
  
  const validTracks = [];
  const invalidTracks = [];
  
  // Remove duplicates first
  const uniqueIds = [...new Set(oldTrackIds)];
  console.log(`📊 Unique IDs: ${uniqueIds.length} (removed ${oldTrackIds.length - uniqueIds.length} duplicates)`);
  console.log('');
  
  // Process in batches to avoid overwhelming the API
  const batchSize = 3;
  for (let i = 0; i < uniqueIds.length; i += batchSize) {
    const batch = uniqueIds.slice(i, i + batchSize);
    
    await Promise.all(
      batch.map(async (oldId) => {
        const newId = transformOldTrackId(oldId);
        
        try {
          const result = await getTrack(newId);
          
          if (result.success && result.track) {
            const track = result.track;
            
            // Debug: log first track structure
            if (validTracks.length === 0) {
              console.log('\n🔍 DEBUG: First track structure:', JSON.stringify(track, null, 2).substring(0, 500));
            }
            
            // Extract primary contributor (usually first in the list)
            const username = track.contributor_names?.[0] || track.contributorNames?.[0] || 'audiotool';
            const songName = track.display_name || track.displayName || track.name?.split('/').pop() || 'Untitled';
            
            validTracks.push({
              oldId,
              newId,
              songName,
              username,
              bpm: track.bpm,
              key: `${songName}|${username}`,
            });
            
            console.log(`✅ [${validTracks.length}] ${songName} | ${username}`);
            console.log(`   ${oldId} → ${newId} ${track.bpm ? `(${track.bpm} BPM)` : ''}`);
          } else {
            invalidTracks.push({ oldId, newId, reason: 'Not found' });
            console.log(`❌ ${oldId} → ${newId} (not found)`);
          }
        } catch (error) {
          invalidTracks.push({ oldId, newId, reason: error.message });
          console.log(`❌ ${oldId} → ${newId} (error: ${error.message.substring(0, 50)}...)`);
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      })
    );
  }
  
  console.log('');
  console.log('=' .repeat(80));
  console.log(`✅ Valid tracks: ${validTracks.length}`);
  console.log(`❌ Invalid tracks: ${invalidTracks.length}`);
  console.log('=' .repeat(80));
  
  // Sort valid tracks alphabetically by song name
  validTracks.sort((a, b) => {
    const nameA = a.songName || '';
    const nameB = b.songName || '';
    return nameA.localeCompare(nameB);
  });
  
  // Generate the new registry file content
  let registryContent = `// Track Registry
// Maps (songName, username) to track identifiers for fast direct API calls
// When a track is found via search, add its identifier here to avoid future searches

export const TRACK_REGISTRY = {
  // Format: "songName|username": "tracks/identifier"
  // Sorted alphabetically by song name
`;
  
  for (const track of validTracks) {
    const bpmComment = track.bpm ? ` // ${track.bpm} BPM` : '';
    registryContent += `  "${track.key}": "${track.newId}",${bpmComment}\n`;
  }
  
  registryContent += `};

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
 * Save track identifier to registry (in-memory only, requires code update for persistence)
 * @param {string} songName - Song name
 * @param {string} username - Username
 * @param {string} trackIdentifier - Track identifier (e.g., "tracks/abc123")
 */
export function saveTrackIdentifier(songName, username, trackIdentifier) {
  const key = \`\${songName}|\${username}\`;
  TRACK_REGISTRY[key] = trackIdentifier;
  console.log(\`💾 Track identifier saved: \${key} -> \${trackIdentifier}\`);
  console.log(\`📝 Update src/config/track-registry.js with: "\${key}": "\${trackIdentifier}",\`);
}

/**
 * Transform old track ID to new track ID format
 * @param {string} oldId - Old track identifier
 * @returns {string} New track identifier in format "tracks/{transformed_id}"
 */
export function transformOldTrackId(oldId) {
  let transformed = oldId.toLowerCase();
  transformed = transformed.replace(/%/g, 'x-');
  transformed = transformed.replace(/\*/g, 'y-');
  transformed = transformed.replace(/\\./g, 'z-');
  return \`tracks/\${transformed}\`;
}
`;
  
  console.log('\n📝 Writing new track registry...');
  
  // Write the file using Node.js fs
  const fs = await import('fs');
  fs.writeFileSync('./src/config/track-registry.js', registryContent, 'utf8');
  
  console.log('✅ Track registry updated successfully!');
  console.log(`   File: src/config/track-registry.js`);
  console.log(`   Tracks: ${validTracks.length}`);
  
  // Print summary of invalid tracks
  if (invalidTracks.length > 0) {
    console.log('\n❌ Invalid tracks (removed from registry):');
    const sample = invalidTracks.slice(0, 10);
    for (const track of sample) {
      console.log(`   ${track.oldId} → ${track.newId}`);
    }
    if (invalidTracks.length > 10) {
      console.log(`   ... and ${invalidTracks.length - 10} more`);
    }
  }
  
  console.log('\n✨ Done!');
}

// Run the validation
validateAndBuildRegistry().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

