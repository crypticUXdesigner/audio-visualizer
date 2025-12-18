# Visual Player - Audio Visualizer

An immersive WebGL audio visualizer with dynamic color palettes and real-time frequency analysis. Features a modular architecture with shader-based visual effects, 170+ curated Audiotool tracks, and synchronized color modulation.

## Architecture

The project uses a modular architecture with clear separation of concerns:

### Core Modules (`src/core/`)
- **AudioAnalyzer.js** - Handles audio analysis, frequency bands, beat detection, and stereo processing
- **ColorGenerator.js** - OKLCH color space conversion, cubic bezier interpolation, and color palette generation
- **WebGLUtils.js** - WebGL helper functions (shader loading, compilation, program creation)

### Shader System (`src/shaders/`)
- **ShaderInstance.js** - Manages a single shader instance (WebGL context, uniforms, rendering)
- **ShaderManager.js** - Manages multiple shader instances, activation, and rendering
- **shader-configs/** - Configuration files for each shader (parameters, uniform mappings, color configs)

### UI Modules (`src/ui/`)
- **AudioControls.js** - Audio playback controls and track selection
- **ColorPresetSwitcher.js** - Color preset selection UI
- **UIToggle.js** - UI visibility toggle
- **DevTools.js** - Development tools management

### Configuration (`src/config/`)
- **color-presets.js** - Predefined color palette presets

### Entry Point
- **src/main.js** - Main application entry point that wires everything together

## Files

- `index.html` - Main HTML page with canvas elements and UI controls
- `style.css` - Styling for the application
- `src/main.js` - Application entry point
- `frequency-visualizer.js` - Development tool for frequency band visualization
- `shaders/vertex.glsl` - Vertex shader
- `shaders/background-fragment.glsl` - Fragment shader with animated fBm noise

## Development

### Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

The dev server will start on `http://localhost:5173` (or another port if 5173 is busy) with hot module replacement. Changes to HTML, CSS, JS, and shader files will automatically reload in the browser.

### Build

To create a production build:
```bash
npm run build
```

The build output will be in the `dist/` directory, ready for deployment.

## Deployment

This project is configured for automatic deployment to GitHub Pages using GitHub Actions.

### Automatic Deployment (Recommended)

The project includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically builds and deploys to GitHub Pages when you push to the `main` or `master` branch.

**Setup Steps:**

1. Ensure your repository is set up on GitHub
2. Go to **Settings → Pages** in your repository
3. Under **Source**, select **GitHub Actions**
4. Push your code to the `main` or `master` branch
5. The workflow will automatically build and deploy your changes

Your site will be available at: `https://crypticUXdesigner.github.io/audio-visualizer/`

**Environment Variables (Optional):**

The app works without API tokens (uses public endpoints), but you can optionally add GitHub Secrets for enhanced functionality:

- `AUDIOTOOL_API_TOKEN` - Audiotool API bearer token (optional, falls back to public client ID)
- `SENTRY_DSN` - Sentry error tracking DSN (optional)

Add these in **Settings → Secrets and variables → Actions → Repository secrets**.

### Manual Deployment

You can also deploy manually using the `gh-pages` package:

```bash
npm run deploy
```

This will build the project and push the `dist/` folder to the `gh-pages` branch.

### Local Development & Preview

Start the development server with hot module replacement:

```bash
npm run dev
```

To preview the production build locally:

```bash
npm run build
npm run preview
```

**Important:** The API token is only embedded in development builds. Production builds do not contain hardcoded credentials.

## Usage

1. Start the development server: `npm run dev`
2. Open the application in your browser
3. Select an audio track from the bottom-left controls
4. The shader will automatically initialize and run fullscreen
5. Use color preset buttons to change the color scheme

## Customization

### Adding a New Shader

1. Create a new shader config file in `src/shaders/shader-configs/`:
```javascript
export default {
    name: 'my-shader',
    displayName: 'My Custom Shader',
    canvasId: 'backgroundCanvas',
    vertexPath: 'shaders/vertex.glsl',
    fragmentPath: 'shaders/my-fragment.glsl',
    
    parameters: {
        myParam: { 
            type: 'float', 
            default: 1.0, 
            min: 0.0, 
            max: 5.0, 
            step: 0.1,
            label: 'My Parameter'
        }
    },
    
    colorConfig: {
        baseHue: '#41eee5',
        darkest: { lightness: 0.09, chroma: 0.08, hueOffset: -80 },
        brightest: { lightness: 0.97, chroma: 0.20, hueOffset: 90 },
        interpolationCurve: {
            lightness: [0.5, 0.2, 0.6, 0.7],
            chroma: [0.5, 0.2, 0.6, 0.7],
            hue: [0.5, 0.2, 0.6, 0.7]
        }
    },
    
    uniformMapping: {
        uBass: (data) => data?.bass || 0,
        uVolume: (data) => data?.volume || 0,
        // ... map audio data to shader uniforms
    }
};
```

2. Register the shader in `src/main.js`:
```javascript
import myShaderConfig from './shaders/shader-configs/my-shader.js';
// ...
this.shaderManager.registerShader(myShaderConfig);
await this.shaderManager.setActiveShader('my-shader');
```

### Customizing Colors

Color presets are defined in `src/config/color-presets.js`. You can:
- Modify existing presets
- Add new presets
- Change the color configuration in shader configs

### Adjusting Shader Parameters

Shader parameters can be adjusted programmatically:

```javascript
window.BackgroundShader.setParameter('pixelSize', 2.0);
const value = window.BackgroundShader.getParameter('pixelSize');
```

## API

The application exposes a global `BackgroundShader` object for backward compatibility:

- `BackgroundShader.setColorConfig(newConfig)` - Update color configuration
- `BackgroundShader.getColorConfig()` - Get current color configuration
- `BackgroundShader.regenerateColors()` - Regenerate colors from current config
- `BackgroundShader.setParameter(name, value)` - Set a shader parameter
- `BackgroundShader.getParameter(name)` - Get a shader parameter value

The main application instance is also exposed as `window.VisualPlayer`.

## Requirements

- Modern browser with WebGL support
- Local server required (due to CORS restrictions when loading shader files)
- ES6 modules support

## Features

- **Modular Architecture** - Easy to add new shaders and experiment with visual effects
- **Real-time Audio Analysis** - Advanced frequency band analysis, beat detection, and stereo processing
- **Dynamic Color Palettes** - OKLCH-based color generation with smooth interpolation and hue modulation
- **Curated Track Library** - 170+ validated tracks from Audiotool's community
- **WebGL Shaders** - Fractional Brownian motion (fBm) noise with multi-step dithering effects
- **Waveform Scrubber** - Interactive audio navigation with visual waveform display
- **Development Tools** - Frequency visualizer and debug mode for testing (add `?debug` to URL)
- **Error Tracking** - Integrated Sentry monitoring with graceful fallbacks

## Security & Environment Variables

### Production Build Security

- **No Credentials in Production**: The production build does NOT contain hardcoded API tokens
- **Public API Support**: The app uses Audiotool's public API endpoints with a client ID fallback and works without authentication
- **Environment Variables**: API tokens set in `.env.local` will be embedded in builds (Vite's behavior). For production deployments, DO NOT set `VITE_AUDIOTOOL_API_TOKEN` unless you want it in the public bundle.

### Local Development Setup

For local development with authenticated API access, create a `.env.local` file in the project root:

```bash
# .env.local (for local development only - never commit this file!)
VITE_AUDIOTOOL_API_TOKEN=your_token_here
VITE_SENTRY_DSN=your_sentry_dsn_here  # optional
```

**Important**: The `.env.local` file is already in `.gitignore` and should NEVER be committed to version control.

### GitHub Actions Deployment

The GitHub Actions workflow builds the app WITHOUT API tokens by default (using public API endpoints). If you need authenticated API access in production:

1. Go to **Settings → Secrets and variables → Actions → Repository secrets**
2. Add `AUDIOTOOL_API_TOKEN` (note: without `VITE_` prefix to keep it server-side only)
3. Update the workflow to pass it as `VITE_AUDIOTOOL_API_TOKEN` during build (currently commented out)

## Notes

- The shader uses animated fractional Brownian motion (fBm) noise
- Multi-step dithering creates a retro pixelated effect
- The shader automatically handles window resizing
- Performance is throttled to the target FPS for efficiency
- Beat detection creates ripple effects synchronized with music
