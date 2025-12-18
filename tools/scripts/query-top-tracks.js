#!/usr/bin/env node

/**
 * Standalone script to query Audiotool API for tracks created in the last 1-2 years
 * with the most plays, sorted by play count.
 * 
 * Usage: node query-top-tracks.js
 * 
 * Requires environment variable: VITE_AUDIOTOOL_API_TOKEN (optional for public endpoints)
 */

// Calculate date thresholds
const twoYearsAgo = new Date();
twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
const twoYearsAgoSeconds = Math.floor(twoYearsAgo.getTime() / 1000);

const oneYearAgo = new Date();
oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
const oneYearAgoSeconds = Math.floor(oneYearAgo.getTime() / 1000);

console.log(`🔍 Searching for tracks created after ${twoYearsAgo.toISOString().split('T')[0]}`);
console.log(`   (${Math.floor((Date.now() - twoYearsAgo.getTime()) / (1000 * 60 * 60 * 24))} days ago)\n`);

// Get API token from environment
const token = process.env.VITE_AUDIOTOOL_API_TOKEN || null;
const clientId = process.env.VITE_AUDIOTOOL_CLIENT_ID || null;

const baseUrl = 'https://rpc.audiotool.com';
const serviceName = 'audiotool.track.v1.TrackService';

/**
 * Call the TrackService API
 */
async function callTrackService(method, request) {
  const url = `${baseUrl}/${serviceName}/${method}`;
  
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(request),
  });
  
  if (!response.ok) {
    let errorText = '';
    try {
      errorText = await response.text();
    } catch (e) {
      errorText = response.statusText;
    }
    
    let errorMessage = `TrackService.${method} failed: ${response.status} ${response.statusText}`;
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.message) {
        errorMessage = errorJson.message;
      } else if (errorJson.error) {
        errorMessage = errorJson.error;
      }
    } catch (e) {
      if (errorText) {
        errorMessage += ` - ${errorText}`;
      }
    }
    
    throw new Error(errorMessage);
  }
  
  return await response.json();
}

/**
 * List tracks with pagination
 */
async function listTracks(options = {}) {
  const request = {
    filter: options.filter || '',
    page_size: options.pageSize || 50,
    page_token: options.pageToken || '',
    order_by: options.orderBy || 'track.create_time desc',
  };
  
  const result = await callTrackService('ListTracks', request);
  
  return {
    success: true,
    tracks: result.tracks || [],
    nextPageToken: result.next_page_token || '',
  };
}

/**
 * Main function to query and display top tracks
 */
async function main() {
  try {
    // Build CEL filter for tracks created in last 2 years
    // CEL timestamp comparison - try ISO format or timestamp function
    // Format: timestamp("YYYY-MM-DDTHH:MM:SSZ")
    const twoYearsAgoISO = twoYearsAgo.toISOString();
    const filter = `track.create_time >= timestamp("${twoYearsAgoISO}")`;
    
    console.log('📊 Fetching tracks (this may take a while)...\n');
    
    // Collect all tracks with pagination
    let allTracks = [];
    let pageToken = '';
    let pageCount = 0;
    const maxPages = 20; // Limit to prevent excessive API calls (up to 1000 tracks)
    
    // First, try to get tracks ordered by create_time (most reliable)
    // We'll sort by plays manually since num_plays might not be available in order_by
    while (pageCount < maxPages) {
      const result = await listTracks({
        filter: filter,
        pageSize: 50,
        pageToken: pageToken,
        orderBy: 'track.create_time desc', // Most recent first
      });
      
      if (!result.success || !result.tracks || result.tracks.length === 0) {
        break;
      }
      
      allTracks = allTracks.concat(result.tracks);
      console.log(`✅ Fetched page ${pageCount + 1}: ${result.tracks.length} tracks (total: ${allTracks.length})`);
      
      // Debug: log first track structure on first page
      if (pageCount === 0 && result.tracks.length > 0) {
        console.log('\n🔍 Sample track structure (first track):');
        console.log(JSON.stringify(result.tracks[0], null, 2));
        console.log('');
      }
      
      if (!result.nextPageToken) {
        break;
      }
      
      pageToken = result.nextPageToken;
      pageCount++;
      
      // Small delay to be respectful to the API
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (allTracks.length === 0) {
      console.log('❌ No tracks found matching the criteria.');
      return;
    }
    
    // Sort by num_plays descending
    allTracks.sort((a, b) => (b.num_plays || 0) - (a.num_plays || 0));
    
    // Display results
    console.log('\n' + '='.repeat(100));
    console.log(`🎵 TOP TRACKS FROM LAST 2 YEARS (sorted by play count)`);
    console.log('='.repeat(100));
    console.log(`Total tracks found: ${allTracks.length}\n`);
    
    // Show top 50 tracks
    const topTracks = allTracks.slice(0, 50);
    
    topTracks.forEach((track, index) => {
      const createDate = track.create_time 
        ? new Date(track.create_time.seconds * 1000).toISOString().split('T')[0]
        : 'unknown';
      const plays = track.num_plays || 0;
      const favorites = track.num_favorites || 0;
      const downloads = track.num_downloads || 0;
      const comments = track.num_comments || 0;
      const contributors = track.contributor_names?.map(name => 
        name.replace('users/', '')
      ).join(', ') || 'unknown';
      const genre = track.genre_name || 'unknown';
      const bpm = track.bpm || 'unknown';
      
      console.log(`${(index + 1).toString().padStart(3)}. ${track.display_name}`);
      console.log(`     ID: ${track.name}`);
      console.log(`     Plays: ${plays.toLocaleString()} | Favorites: ${favorites.toLocaleString()} | Downloads: ${downloads.toLocaleString()} | Comments: ${comments.toLocaleString()}`);
      console.log(`     Created: ${createDate} | Genre: ${genre} | BPM: ${bpm}`);
      console.log(`     Contributors: ${contributors}`);
      if (track.description) {
        const desc = track.description.length > 100 
          ? track.description.substring(0, 100) + '...' 
          : track.description;
        console.log(`     Description: ${desc}`);
      }
      console.log('');
    });
    
    // Summary statistics
    console.log('\n' + '='.repeat(100));
    console.log('📊 SUMMARY STATISTICS');
    console.log('='.repeat(100));
    
    const totalPlays = allTracks.reduce((sum, t) => sum + (t.num_plays || 0), 0);
    const totalFavorites = allTracks.reduce((sum, t) => sum + (t.num_favorites || 0), 0);
    const totalDownloads = allTracks.reduce((sum, t) => sum + (t.num_downloads || 0), 0);
    const totalComments = allTracks.reduce((sum, t) => sum + (t.num_comments || 0), 0);
    const avgPlays = allTracks.length > 0 ? Math.round(totalPlays / allTracks.length) : 0;
    const medianPlays = allTracks.length > 0 
      ? allTracks[Math.floor(allTracks.length / 2)].num_plays || 0 
      : 0;
    
    console.log(`Total tracks analyzed: ${allTracks.length}`);
    console.log(`Total plays: ${totalPlays.toLocaleString()}`);
    console.log(`Total favorites: ${totalFavorites.toLocaleString()}`);
    console.log(`Total downloads: ${totalDownloads.toLocaleString()}`);
    console.log(`Total comments: ${totalComments.toLocaleString()}`);
    console.log(`Average plays per track: ${avgPlays.toLocaleString()}`);
    console.log(`Median plays per track: ${medianPlays.toLocaleString()}`);
    console.log(`Top track plays: ${topTracks[0]?.num_plays?.toLocaleString() || 0}`);
    
    // Tracks from last year vs last 2 years
    const lastYearTracks = allTracks.filter(t => 
      t.create_time && t.create_time.seconds >= oneYearAgoSeconds
    );
    const olderTracks = allTracks.filter(t => 
      t.create_time && t.create_time.seconds < oneYearAgoSeconds
    );
    
    console.log(`\n📅 BREAKDOWN BY TIME PERIOD:`);
    console.log(`   Last year (${oneYearAgo.toISOString().split('T')[0]} - now): ${lastYearTracks.length} tracks`);
    if (lastYearTracks.length > 0) {
      const lastYearPlays = lastYearTracks.reduce((sum, t) => sum + (t.num_plays || 0), 0);
      const lastYearAvg = Math.round(lastYearPlays / lastYearTracks.length);
      console.log(`     Total plays: ${lastYearPlays.toLocaleString()} | Avg: ${lastYearAvg.toLocaleString()}`);
    }
    console.log(`   Previous year (${twoYearsAgo.toISOString().split('T')[0]} - ${oneYearAgo.toISOString().split('T')[0]}): ${olderTracks.length} tracks`);
    if (olderTracks.length > 0) {
      const olderPlays = olderTracks.reduce((sum, t) => sum + (t.num_plays || 0), 0);
      const olderAvg = Math.round(olderPlays / olderTracks.length);
      console.log(`     Total plays: ${olderPlays.toLocaleString()} | Avg: ${olderAvg.toLocaleString()}`);
    }
    
    // Top genres
    const genreCounts = {};
    allTracks.forEach(track => {
      const genre = track.genre_name || 'Unknown';
      genreCounts[genre] = (genreCounts[genre] || 0) + 1;
    });
    const topGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    console.log(`\n🎵 TOP GENRES:`);
    topGenres.forEach(([genre, count], index) => {
      console.log(`   ${(index + 1).toString().padStart(2)}. ${genre}: ${count} tracks`);
    });
    
    console.log('\n' + '='.repeat(100));
    console.log('✅ Query completed successfully!');
    console.log('='.repeat(100) + '\n');
    
  } catch (error) {
    console.error('\n❌ Error fetching tracks:', error.message);
    if (error.message?.includes('401') || error.message?.includes('403')) {
      console.error('\n💡 Tip: This endpoint may require authentication.');
      console.error('   Set VITE_AUDIOTOOL_API_TOKEN in your environment variables.');
    }
    process.exit(1);
  }
}

// Run the script
main();

