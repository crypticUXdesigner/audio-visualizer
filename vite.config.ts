import { defineConfig, loadEnv, type Plugin } from 'vite';
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Connect } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';

// Plugin to copy shaders directory to dist
const copyShadersPlugin = (): Plugin => {
  return {
    name: 'copy-shaders',
    writeBundle() {
      // Main shader files that go directly in dist/shaders/
      // These are referenced by configs as "shaders/vertex.glsl", "shaders/arc-fragment.glsl", etc.
      const mainShaderFiles = [
        'vertex.glsl',
        'arc-fragment.glsl',
        'heightmap-fragment.glsl',
        'refraction-fragment.glsl',
        'strings-fragment.glsl'
      ];
      
      const shadersSourceDir = join('src', 'shaders', 'source');
      const distShadersDir = join('dist', 'shaders');
      
      // Copy main shader files to dist/shaders/
      if (existsSync(shadersSourceDir)) {
        mkdirSync(distShadersDir, { recursive: true });
        mainShaderFiles.forEach(file => {
          const src = join(shadersSourceDir, file);
          if (existsSync(src)) {
            const dest = join(distShadersDir, file);
            copyFileSync(src, dest);
            console.log(`Copied main shader: ${src} to ${dest}`);
          }
        });
      }
      
      // Copy included shader files to dist/shaders/source/
      // These are included with "source/arc-sphere.glsl" etc.
      const distShadersSourceDir = join('dist', 'shaders', 'source');
      
      if (existsSync(shadersSourceDir)) {
        mkdirSync(distShadersSourceDir, { recursive: true });
        // Copy all .glsl files from source directory
        const files = readdirSync(shadersSourceDir).filter(file => 
          file.endsWith('.glsl') && statSync(join(shadersSourceDir, file)).isFile()
        );
        files.forEach(file => {
          // Skip main shader files (already copied above)
          if (!mainShaderFiles.includes(file)) {
            const src = join(shadersSourceDir, file);
            const dest = join(distShadersSourceDir, file);
            copyFileSync(src, dest);
            console.log(`Copied included shader: ${src} to ${dest}`);
          }
        });
      }
      
      // Copy common shaders
      const commonDir = join('src', 'shaders', 'common');
      const distCommonDir = join('dist', 'shaders', 'common');
      
      if (existsSync(commonDir)) {
        mkdirSync(distCommonDir, { recursive: true });
        const commonFiles = readdirSync(commonDir).filter(file => 
          file.endsWith('.glsl') && statSync(join(commonDir, file)).isFile()
        );
        commonFiles.forEach(file => {
          const src = join(commonDir, file);
          const dest = join(distCommonDir, file);
          copyFileSync(src, dest);
          console.log(`Copied ${src} to ${dest}`);
        });
      }
      
      // Copy strings shader subdirectory
      const stringsDir = join('src', 'shaders', 'strings');
      const distStringsDir = join('dist', 'shaders', 'strings');
      
      if (existsSync(stringsDir)) {
        mkdirSync(distStringsDir, { recursive: true });
        const stringsFiles = readdirSync(stringsDir).filter(file => 
          file.endsWith('.glsl') && statSync(join(stringsDir, file)).isFile()
        );
        stringsFiles.forEach(file => {
          const src = join(stringsDir, file);
          const dest = join(distStringsDir, file);
          copyFileSync(src, dest);
          console.log(`Copied ${src} to ${dest}`);
        });
      }
    }
  };
};

// Plugin to create .nojekyll for GitHub Pages
const githubPagesPlugin = (): Plugin => {
  return {
    name: 'github-pages-setup',
    writeBundle() {
      // Create .nojekyll file for GitHub Pages (prevents Jekyll processing)
      const nojekyllPath = join('dist', '.nojekyll');
      writeFileSync(nojekyllPath, '');
      console.log('Created .nojekyll file for GitHub Pages');
    }
  };
};

export default defineConfig(({ command, mode }) => {
  // Explicitly load environment variables from .env files
  // Vite should do this automatically, but we'll ensure it works
  const env = loadEnv(mode, process.cwd(), '');
  
  // Debug: Log if token is loaded (only in dev mode, and don't log the actual token)
  if (command === 'serve') {
    const tokenSet = !!env.VITE_AUDIOTOOL_API_TOKEN;
    console.log(`[Vite Config] VITE_AUDIOTOOL_API_TOKEN is ${tokenSet ? 'SET' : 'NOT SET'}`);
    if (!tokenSet) {
      console.log('[Vite Config] No API token found - using public API endpoints (this is fine!)');
      console.log('[Vite Config] To use authenticated endpoints, create .env.local with: VITE_AUDIOTOOL_API_TOKEN=your_token');
    }
  }
  
  return {
  // Use base path only for production builds (GitHub Pages)
  // For dev server, use root path
  base: command === 'build' ? '/audio-visualizer/' : '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        assetFileNames: (_assetInfo) => {
          return 'assets/[name]-[hash][extname]';
        }
      }
    }
  },
  plugins: [
    copyShadersPlugin(), 
    githubPagesPlugin(),
    // Bundle analysis - generates dist/stats.html after build
    visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
      template: 'treemap', // 'sunburst' | 'treemap' | 'network'
    }),
    // Plugin to serve shaders in dev mode
    {
      name: 'serve-shaders',
      configureServer(server) {
        // Register middleware to intercept shader requests
        // This runs before Vite's default middleware
        const isDev = command === 'serve';
        server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
          // Only handle shader requests
          if (!req.url || !req.url.startsWith('/shaders/')) {
            next();
            return;
          }
          
          let url = req.url;
          
          // Remove query parameters (cache-busting)
          if (url.includes('?')) {
            url = url.split('?')[0];
          }
          
          if (url && url.endsWith('.glsl')) {
            try {
              // req.url includes the full path like '/shaders/vertex.glsl' or '/shaders/common/uniforms.glsl'
              // Handle source files, common includes, and subdirectories (like strings/)
              const pathParts = url.split('/').filter(p => p);
              let filePath: string;
              
              if (pathParts.length >= 3 && pathParts[1] === 'common') {
                // Common include: /shaders/common/uniforms.glsl -> src/shaders/common/uniforms.glsl
                const filename = pathParts[pathParts.length - 1];
                filePath = join(process.cwd(), 'src', 'shaders', 'common', filename);
              } else if (pathParts.length >= 3) {
                // Subdirectory: /shaders/strings/math-utils.glsl -> src/shaders/strings/math-utils.glsl
                const subdir = pathParts[1];
                const filename = pathParts[pathParts.length - 1];
                filePath = join(process.cwd(), 'src', 'shaders', subdir, filename);
              } else {
                // Source file: /shaders/vertex.glsl -> src/shaders/source/vertex.glsl
                const filename = pathParts[pathParts.length - 1];
                filePath = join(process.cwd(), 'src', 'shaders', 'source', filename);
              }
              
              if (!existsSync(filePath)) {
                // Silently handle missing shader files (likely from cached requests)
                // Only log as warning in development for debugging
                if (isDev) {
                  console.warn(`[Vite] Shader file not found: ${filePath} (requested: ${req.url})`);
                }
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
              
              console.log(`[Vite] Served shader: ${filePath} (requested: ${req.url})`);
              res.statusCode = 200;
              res.end(content);
              // Don't call next() - we've handled the request
            } catch (err) {
              console.error(`[Vite] Error serving shader ${req.url}:`, err);
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
        server.middlewares.use('/src/fonts', (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
          let url = req.url;
          
          // Remove query parameters if any
          if (url && url.includes('?')) {
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
  };
});

