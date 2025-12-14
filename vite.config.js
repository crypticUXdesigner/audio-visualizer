import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync, writeFileSync } from 'fs';
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

export default defineConfig({
  base: '/audio-visualizer/', // GitHub Pages project path
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
  plugins: [copyShadersPlugin(), copyAudioPlugin()],
});

