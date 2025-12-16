import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

// Plugin to copy shaders directory to dist
const copyShadersPlugin = () => {
  return {
    name: 'copy-shaders',
    writeBundle() {
      const shadersDir = 'shaders';
      const distShadersDir = join('dist', 'shaders');
      
      if (existsSync(shadersDir)) {
        mkdirSync(distShadersDir, { recursive: true });
        const files = ['vertex.glsl', 'background-fragment.glsl'];
        files.forEach(file => {
          const src = join(shadersDir, file);
          const dest = join(distShadersDir, file);
          if (existsSync(src)) {
            copyFileSync(src, dest);
            console.log(`Copied ${src} to ${dest}`);
          }
        });
      }
    }
  };
};

// Plugin to copy audio directory to dist/audio
const copyAudioPlugin = () => {
  return {
    name: 'copy-audio',
    writeBundle() {
      const audioDir = 'audio';
      const distAudioDir = join('dist', 'audio');
      
      if (existsSync(audioDir)) {
        mkdirSync(distAudioDir, { recursive: true });
        const files = readdirSync(audioDir);
        files.forEach(file => {
          const src = join(audioDir, file);
          const dest = join(distAudioDir, file);
          const stat = statSync(src);
          if (stat.isFile() && file.endsWith('.mp3')) {
            copyFileSync(src, dest);
            console.log(`Copied ${src} to ${dest}`);
          }
        });
      }
      
      // Create .nojekyll file for GitHub Pages (prevents Jekyll processing)
      const nojekyllPath = join('dist', '.nojekyll');
      writeFileSync(nojekyllPath, '');
    }
  };
};

export default defineConfig(({ command }) => ({
  // Use base path only for production builds (GitHub Pages)
  // For dev server, use root path
  base: command === 'build' ? '/audio-visualizer/' : '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          return 'assets/[name]-[hash][extname]';
        }
      }
    }
  },
  plugins: [
    copyShadersPlugin(), 
    copyAudioPlugin(),
    // Plugin to serve shaders in dev mode
    {
      name: 'serve-shaders',
      configureServer(server) {
        // Register middleware early to intercept shader requests
        server.middlewares.use('/shaders', (req, res, next) => {
          // Serve shader files from the shaders directory
          let url = req.url;
          
          // Remove query parameters (cache-busting)
          if (url.includes('?')) {
            url = url.split('?')[0];
          }
          
          if (url && url.endsWith('.glsl')) {
            try {
              // req.url includes the full path like '/shaders/vertex.glsl'
              // Extract just the filename
              const filename = url.split('/').pop();
              const filePath = join(process.cwd(), 'shaders', filename);
              
              if (!existsSync(filePath)) {
                console.error(`Shader file not found: ${filePath} (requested: ${req.url})`);
                next();
                return;
              }
              
              const content = readFileSync(filePath, 'utf-8');
              
              // Set aggressive headers to prevent caching
              res.setHeader('Content-Type', 'text/plain');
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
              res.setHeader('Pragma', 'no-cache');
              res.setHeader('Expires', '0');
              res.setHeader('X-Accel-Expires', '0'); // Nginx cache control
              res.setHeader('Vary', '*'); // Prevent cache matching
              // Add ETag to help with cache validation (always changing)
              const etag = `"${Date.now()}-${Math.random()}"`;
              res.setHeader('ETag', etag);
              res.setHeader('Last-Modified', new Date().toUTCString());
              
              console.log(`Served shader: ${filename}`);
              res.end(content);
            } catch (err) {
              console.error(`Error serving shader ${req.url}:`, err);
              next();
            }
          } else {
            next();
          }
        });
      }
    },
    // Plugin to serve audio files in dev mode
    {
      name: 'serve-audio',
      configureServer(server) {
        server.middlewares.use('/audio', (req, res, next) => {
          let url = req.url;
          
          // Remove query parameters if any
          if (url.includes('?')) {
            url = url.split('?')[0];
          }
          
          if (url && (url.endsWith('.mp3') || url.endsWith('.ogg') || url.endsWith('.wav'))) {
            try {
              const filename = url.split('/').pop();
              const filePath = join(process.cwd(), 'audio', filename);
              
              if (!existsSync(filePath)) {
                console.error(`Audio file not found: ${filePath} (requested: ${req.url})`);
                next();
                return;
              }
              
              const content = readFileSync(filePath);
              
              // Set proper MIME type and cache headers
              const mimeType = url.endsWith('.mp3') ? 'audio/mpeg' : 
                              url.endsWith('.ogg') ? 'audio/ogg' : 
                              url.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg';
              
              res.setHeader('Content-Type', mimeType);
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
              res.setHeader('Pragma', 'no-cache');
              res.setHeader('Expires', '0');
              res.setHeader('Accept-Ranges', 'bytes');
              
              res.end(content);
            } catch (err) {
              console.error(`Error serving audio ${req.url}:`, err);
              next();
            }
          } else {
            next();
          }
        });
      }
    },
    // Plugin to serve font files in dev mode
    {
      name: 'serve-fonts',
      configureServer(server) {
        server.middlewares.use('/src/fonts', (req, res, next) => {
          let url = req.url;
          
          // Remove query parameters if any
          if (url.includes('?')) {
            url = url.split('?')[0];
          }
          
          if (url && (url.endsWith('.woff2') || url.endsWith('.woff') || url.endsWith('.otf') || url.endsWith('.ttf'))) {
            try {
              // Extract path after /src/fonts
              const fontPath = url.replace('/src/fonts', '');
              const filePath = join(process.cwd(), 'src', 'fonts', fontPath);
              
              if (!existsSync(filePath)) {
                console.error(`Font file not found: ${filePath} (requested: ${req.url})`);
                next();
                return;
              }
              
              const content = readFileSync(filePath);
              
              // Set proper MIME type
              let mimeType = 'application/octet-stream';
              if (url.endsWith('.woff2')) mimeType = 'font/woff2';
              else if (url.endsWith('.woff')) mimeType = 'font/woff';
              else if (url.endsWith('.otf')) mimeType = 'font/otf';
              else if (url.endsWith('.ttf')) mimeType = 'font/ttf';
              
              res.setHeader('Content-Type', mimeType);
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
              res.setHeader('Access-Control-Allow-Origin', '*');
              
              res.end(content);
            } catch (err) {
              console.error(`Error serving font ${req.url}:`, err);
              next();
            }
          } else {
            next();
          }
        });
      }
    }
  ],
}));

