# Development Tools & Scripts

This directory contains one-off helper scripts and testing tools that are not part of the main application.

## 📁 Directory Structure

```
tools/
├── api-testing/          # HTML test pages for API functionality
│   ├── batch-fetch-top-tracks.html
│   ├── query-newest-tracks.html
│   ├── query-popular-tracks-browser.html
│   ├── test-api-query.html
│   └── test-get-track.html
│
├── scripts/              # Node.js helper scripts
│   ├── query-popular-tracks.js
│   ├── query-top-tracks.js
│   ├── validate-and-transform-tracks.js
│   └── validate-tracks-standalone.js
│
└── README.md            # This file
```

---

## 🔧 API Testing Tools (api-testing/)

These are browser-based HTML pages for testing and exploring the Audiotool API.

### `batch-fetch-top-tracks.html`
**Purpose:** Test batch fetching of the top 5 most favorited tracks  
**Usage:** Open in browser with dev server running (`npm run dev`)  
**What it does:** Fetches multiple tracks in a single API call and displays their metadata

### `query-newest-tracks.html`
**Purpose:** Query and display the most recently published tracks  
**Usage:** Open in browser with dev server running  
**What it does:** Queries tracks ordered by creation date (newest first), shows top 30

### `query-popular-tracks-browser.html`
**Purpose:** Interactive query tool with controls for popular tracks  
**Usage:** Open in browser with dev server running  
**What it does:** 
- Configurable years and page limits
- Queries tracks by creation date and sorts by play count
- Shows statistics and genre breakdowns

### `test-api-query.html`
**Purpose:** General API query testing with detailed output  
**Usage:** Open in browser with dev server running  
**What it does:** Tests listing tracks ordered by favorites with CEL filters

### `test-get-track.html`
**Purpose:** Test fetching a single track by ID  
**Usage:** Open in browser with dev server running  
**What it does:** Simple test of the GetTrack API method

---

## 🐚 Node.js Scripts (scripts/)

These are command-line scripts for batch operations and data validation.

### `query-popular-tracks.js`
**Purpose:** Query popular tracks from the last N years (Node.js module)  
**Usage:** 
```bash
node tools/scripts/query-popular-tracks.js
```
**Requirements:** Uses ES modules, imports from `src/core/AudiotoolTrackService.js`  
**What it does:** 
- Fetches tracks from last 2 years (configurable)
- Sorts by play count
- Displays top 50 with statistics

### `query-top-tracks.js`
**Purpose:** Standalone script to query top tracks (no dependencies on src/)  
**Usage:**
```bash
node tools/scripts/query-top-tracks.js
```
**Requirements:** Uses native fetch API  
**What it does:**
- Standalone implementation of track querying
- Fetches up to 1000 tracks (20 pages × 50)
- Shows comprehensive statistics and breakdowns

### `validate-and-transform-tracks.js`
**Purpose:** Validate and transform old track IDs to new format  
**Usage:**
```bash
node tools/scripts/validate-and-transform-tracks.js
```
**Requirements:** Imports from `src/core/AudiotoolTrackService.js`  
**What it does:**
- Transforms old track ID format to new format
- Validates each track against the API
- Regenerates `src/config/track-registry.js` with valid tracks only
- Removes duplicates and invalid entries

### `validate-tracks-standalone.js`
**Purpose:** Same as above but standalone (uses node-fetch)  
**Usage:**
```bash
node tools/scripts/validate-tracks-standalone.js
```
**Requirements:** `node-fetch` package  
**What it does:** Same as validate-and-transform-tracks.js but doesn't depend on Vite/Sentry

---

## 📝 Notes

### When to Use These Tools

- **During Development:** Use the browser-based tools for quick API exploration
- **Building Track Registry:** Use the validation scripts to update the track registry
- **Data Analysis:** Use the query scripts to analyze popular tracks and trends
- **API Testing:** Use test pages when implementing new API features

### Authentication

Some API endpoints may require authentication. Set the environment variable:
```bash
VITE_AUDIOTOOL_API_TOKEN=your_token_here
```

### Development Server

Most HTML tools require the dev server to be running:
```bash
npm run dev
```

Then navigate to:
```
http://localhost:5173/tools/api-testing/[tool-name].html
```

---

## 🚫 Not for Production

**Important:** None of these tools should be included in production builds. They are for development and testing only.

