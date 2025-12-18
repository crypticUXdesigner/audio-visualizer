// Query Popular Tracks from Audiotool API
// Fetches tracks created in the last 1-2 years, sorted by play count

import { listTracks } from './src/core/AudiotoolTrackService.js';

/**
 * Query tracks from the last N years, sorted by play count
 * @param {number} years - Number of years back to search (default: 2)
 * @param {number} maxPages - Maximum pages to fetch (default: 10, 50 tracks per page)
 */
async function queryPopularTracks(years = 2, maxPages = 10) {
  console.log('\n' + '='.repeat(80));
  console.log(`🔍 QUERYING POPULAR AUDIOTOOL TRACKS FROM LAST ${years} YEAR(S)`);
  console.log('='.repeat(80) + '\n');
  
  // Calculate date N years ago
  const yearsAgo = new Date();
  yearsAgo.setFullYear(yearsAgo.getFullYear() - years);
  const yearsAgoSeconds = Math.floor(yearsAgo.getTime() / 1000);
  
  console.log(`📅 Searching for tracks created after: ${yearsAgo.toISOString()}`);
  console.log(`⏰ Timestamp: ${yearsAgoSeconds} seconds\n`);
  
  // CEL filter: track.create_time.seconds >= timestamp_in_seconds
  const filter = `track.create_time.seconds >= ${yearsAgoSeconds}`;
  
  let allTracks = [];
  let pageToken = '';
  let pageCount = 0;
  
  try {
    console.log('📊 Fetching tracks...\n');
    
    // Fetch multiple pages of results
    while (pageCount < maxPages) {
      const result = await listTracks({
        filter: filter,
        pageSize: 50,
        pageToken: pageToken,
        orderBy: 'track.create_time desc', // Order by creation time (num_plays not supported in order_by)
      });
      
      if (!result.success || !result.tracks || result.tracks.length === 0) {
        console.log(`ℹ️  No more tracks found on page ${pageCount + 1}`);
        break;
      }
      
      allTracks = allTracks.concat(result.tracks);
      console.log(`✅ Page ${pageCount + 1}: ${result.tracks.length} tracks (total: ${allTracks.length})`);
      
      if (!result.nextPageToken) {
        console.log('ℹ️  Reached last page\n');
        break;
      }
      
      pageToken = result.nextPageToken;
      pageCount++;
    }
    
    if (allTracks.length === 0) {
      console.log('\n❌ No tracks found matching the criteria');
      return;
    }
    
    // Sort by num_plays descending
    console.log('\n🔄 Sorting tracks by play count...\n');
    allTracks.sort((a, b) => (b.num_plays || 0) - (a.num_plays || 0));
    
    // Display results
    displayTopTracks(allTracks, years);
    
    return allTracks;
    
  } catch (error) {
    console.error('\n❌ ERROR FETCHING TRACKS:', error);
    console.error('Error message:', error.message);
    
    if (error.message?.includes('403') || error.message?.includes('401')) {
      console.error('\n💡 TIP: Check your API token in environment variables');
      console.error('   Set VITE_AUDIOTOOL_API_TOKEN for authentication');
    }
    
    throw error;
  }
}

/**
 * Display top tracks with detailed information
 * @param {Array} tracks - Array of track objects
 * @param {number} years - Number of years searched
 */
function displayTopTracks(tracks, years) {
  console.log('='.repeat(80));
  console.log(`🎵 TOP TRACKS FROM LAST ${years} YEAR(S) (SORTED BY PLAY COUNT)`);
  console.log('='.repeat(80));
  console.log(`Total tracks found: ${tracks.length}\n`);
  
  // Show top 50 tracks
  const topCount = Math.min(50, tracks.length);
  const topTracks = tracks.slice(0, topCount);
  
  console.log(`📊 Showing top ${topCount} tracks:\n`);
  
  topTracks.forEach((track, index) => {
    const createDate = track.create_time 
      ? new Date(track.create_time.seconds * 1000).toISOString().split('T')[0]
      : 'unknown';
    const plays = track.num_plays || 0;
    const favorites = track.num_favorites || 0;
    const downloads = track.num_downloads || 0;
    const contributors = track.contributor_names?.join(', ') || 'unknown';
    const bpm = track.bpm || 'unknown';
    const genre = track.genre_name || 'unknown';
    
    console.log(`${(index + 1).toString().padStart(3)}. ${track.display_name}`);
    console.log(`     ID: ${track.name}`);
    console.log(`     👥 Contributors: ${contributors}`);
    console.log(`     📊 Plays: ${plays.toLocaleString()} | ⭐ Favorites: ${favorites.toLocaleString()} | 💾 Downloads: ${downloads.toLocaleString()}`);
    console.log(`     🎼 BPM: ${bpm} | Genre: ${genre} | 📅 Created: ${createDate}`);
    if (track.mp3_url) {
      console.log(`     🔗 Listen: ${track.mp3_url}`);
    }
    console.log('');
  });
  
  // Display summary statistics
  displayStatistics(tracks, years);
}

/**
 * Display summary statistics
 * @param {Array} tracks - Array of track objects
 * @param {number} years - Number of years searched
 */
function displayStatistics(tracks, years) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY STATISTICS');
  console.log('='.repeat(80));
  
  const totalPlays = tracks.reduce((sum, t) => sum + (t.num_plays || 0), 0);
  const totalFavorites = tracks.reduce((sum, t) => sum + (t.num_favorites || 0), 0);
  const totalDownloads = tracks.reduce((sum, t) => sum + (t.num_downloads || 0), 0);
  const avgPlays = tracks.length > 0 ? Math.round(totalPlays / tracks.length) : 0;
  const avgFavorites = tracks.length > 0 ? Math.round(totalFavorites / tracks.length) : 0;
  
  console.log(`\n📈 Overall Stats:`);
  console.log(`   Total tracks: ${tracks.length.toLocaleString()}`);
  console.log(`   Total plays: ${totalPlays.toLocaleString()}`);
  console.log(`   Total favorites: ${totalFavorites.toLocaleString()}`);
  console.log(`   Total downloads: ${totalDownloads.toLocaleString()}`);
  console.log(`   Average plays per track: ${avgPlays.toLocaleString()}`);
  console.log(`   Average favorites per track: ${avgFavorites.toLocaleString()}`);
  
  if (tracks.length > 0) {
    console.log(`\n🏆 Top Performance:`);
    console.log(`   Most played: "${tracks[0].display_name}" - ${tracks[0].num_plays?.toLocaleString()} plays`);
    
    // Sort by favorites to find most favorited
    const byFavorites = [...tracks].sort((a, b) => (b.num_favorites || 0) - (a.num_favorites || 0));
    console.log(`   Most favorited: "${byFavorites[0].display_name}" - ${byFavorites[0].num_favorites?.toLocaleString()} favorites`);
  }
  
  // Genre breakdown
  const genreCounts = {};
  tracks.forEach(track => {
    const genre = track.genre_name || 'Unknown';
    genreCounts[genre] = (genreCounts[genre] || 0) + 1;
  });
  
  const topGenres = Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  if (topGenres.length > 0) {
    console.log(`\n🎼 Top Genres:`);
    topGenres.forEach(([genre, count], index) => {
      console.log(`   ${index + 1}. ${genre}: ${count} tracks`);
    });
  }
  
  // Year-over-year comparison if searching multiple years
  if (years > 1) {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearAgoSeconds = Math.floor(oneYearAgo.getTime() / 1000);
    
    const lastYearTracks = tracks.filter(t => 
      t.create_time && t.create_time.seconds >= oneYearAgoSeconds
    );
    
    console.log(`\n📅 Time Breakdown:`);
    console.log(`   Last year: ${lastYearTracks.length} tracks`);
    console.log(`   Previous year(s): ${tracks.length - lastYearTracks.length} tracks`);
    
    if (lastYearTracks.length > 0) {
      const lastYearPlays = lastYearTracks.reduce((sum, t) => sum + (t.num_plays || 0), 0);
      const lastYearAvgPlays = Math.round(lastYearPlays / lastYearTracks.length);
      console.log(`   Last year average plays: ${lastYearAvgPlays.toLocaleString()}`);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Query complete!');
  console.log('='.repeat(80) + '\n');
}

// Main execution
const YEARS_TO_SEARCH = 2;  // Change this to search different time periods
const MAX_PAGES = 10;       // Change this to fetch more/fewer results (50 tracks per page)

console.log('🚀 Starting Audiotool track query...\n');

queryPopularTracks(YEARS_TO_SEARCH, MAX_PAGES)
  .then(tracks => {
    if (tracks && tracks.length > 0) {
      console.log(`\n💾 Query returned ${tracks.length} tracks`);
      console.log(`💡 To query more tracks, increase MAX_PAGES in the script`);
    }
  })
  .catch(error => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });

