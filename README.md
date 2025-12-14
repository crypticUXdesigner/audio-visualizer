# Visual Player - Music Visualization

A modular, fullscreen animated background shader using WebGL with real-time audio analysis. Features a refactored architecture designed to support multiple shader configurations and easy experimentation.

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
- **ShaderParameterPanel.js** - Dynamic parameter controls for shader experimentation
- **FullscreenToggle.js** - Fullscreen mode toggle
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

This project is configured for deployment to GitHub Pages.

### Automatic Deployment (Recommended)

The project includes a GitHub Actions workflow that automatically deploys to GitHub Pages when you push to the `main` or `master` branch.

1. Ensure your repository is set up on GitHub
2. Go to **Settings → Pages** in your repository
3. Under **Source**, select **GitHub Actions**
4. Push your code to the `main` branch - the workflow will automatically build and deploy

Your site will be available at: `https://crypticUXdesigner.github.io/audio-visualizer/`

### Manual Deployment

You can also deploy manually using the `gh-pages` package:

```bash
npm run deploy
```

This will build the project and push the `dist/` folder to the `gh-pages` branch.

### Local Preview

To preview the production build locally:

```bash
npm run build
npm run preview
```

## Usage

1. Start the development server: `npm run dev`
2. Open the application in your browser
3. Select an audio track from the bottom-left controls
4. The shader will automatically initialize and run fullscreen
5. Use color preset buttons to change the color scheme
6. Adjust shader parameters using the parameter panel

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
        interpolationCurve: [0.5, 0.2, 0.6, 0.7]
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

Shader parameters can be adjusted in real-time through the UI parameter panel, or programmatically:

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

- **Modular Architecture** - Easy to add new shaders and experiment
- **Real-time Audio Analysis** - Frequency bands, beat detection, stereo processing
- **Dynamic Color Palettes** - OKLCH-based color generation with smooth interpolation
- **Shader Parameter Controls** - Real-time parameter adjustment via UI
- **Multiple Shader Support** - Designed to support multiple background shaders
- **Development Tools** - Frequency visualizer for testing and debugging

## Notes

- The shader uses animated fractional Brownian motion (fBm) noise
- Multi-step dithering creates a retro pixelated effect
- The shader automatically handles window resizing
- Performance is throttled to the target FPS for efficiency
- Beat detection creates ripple effects synchronized with music
