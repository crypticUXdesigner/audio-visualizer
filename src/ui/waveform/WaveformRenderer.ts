// Waveform Renderer
// Handles canvas rendering for waveform visualization

import type { WaveformColorManager, ColorRGBA } from './WaveformColorManager.js';

export interface RenderContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  paddingX: number;
  paddingY: number;
  backgroundColor: string;
  audioElement: HTMLAudioElement | null;
}

/**
 * Handles rendering of waveform data to canvas
 */
export class WaveformRenderer {
  /**
   * Render waveform to canvas
   * @param context - Render context with canvas, context, and settings
   * @param colorManager - Color manager for color interpolation
   * @param displayedLeftData - Normalized left channel data (0-1)
   * @param displayedRightData - Normalized right channel data (0-1)
   * @param interpolateWaveformData - Callback to interpolate waveform data
   */
  render(
    context: RenderContext,
    colorManager: WaveformColorManager,
    displayedLeftData: number[] | null,
    displayedRightData: number[] | null,
    interpolateWaveformData: () => void
  ): void {
    const { canvas, ctx, paddingX, paddingY, backgroundColor, audioElement } = context;
    
    if (!canvas || !ctx) return;
    
    const canvasWidth = canvas.width / (window.devicePixelRatio || 1);
    const canvasHeight = canvas.height / (window.devicePixelRatio || 1);
    
    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Calculate drawable area with padding
    const drawWidth = canvasWidth - (paddingX * 2);
    const drawHeight = canvasHeight - (paddingY * 2);
    const centerY = canvasHeight / 2;
    
    // Interpolate waveform values
    interpolateWaveformData();
    
    // Smooth color transitions
    colorManager.interpolateColors();
    
    // Calculate progress (needed for both waveform and playhead)
    const progress = audioElement && audioElement.duration
      ? audioElement.currentTime / audioElement.duration
      : 0;
    
    if (!displayedLeftData || displayedLeftData.length === 0 || 
        !displayedRightData || displayedRightData.length === 0) {
      // Draw placeholder line if no waveform (respecting padding)
      const placeholderColor = colorManager.parseRGBA(colorManager.getWaveColorRGBA());
      ctx.fillStyle = `rgba(${placeholderColor.r}, ${placeholderColor.g}, ${placeholderColor.b}, ${placeholderColor.a})`;
      ctx.fillRect(paddingX, centerY - 1, drawWidth, 2);
      
      // Still draw playhead even without waveform data
      if (progress > 0) {
        this.drawPlayhead(ctx, paddingX, paddingY, drawWidth, drawHeight, progress, colorManager.getCursorColor());
      }
      return;
    }
    
    // Use displayed data (already normalized 0-1)
    const normalizedLeft = displayedLeftData;
    const normalizedRight = displayedRightData;
    
    // Draw waveform bars
    const barWidth = drawWidth / normalizedLeft.length;
    const maxBarHeight = drawHeight; // Use full drawable height (already has padding factored in)
    
    // Draw left channel (top half)
    normalizedLeft.forEach((value, i) => {
      const x = paddingX + (i * barWidth);
      const barHeight = value * (maxBarHeight / 2);
      
      // Color based on progress (use interpolated colors)
      const barProgress = i / normalizedLeft.length;
      const color = barProgress <= progress 
        ? colorManager.getProgressColorRGBA() 
        : colorManager.getWaveColorRGBA();
      
      ctx.fillStyle = color;
      
      // Draw upward from center (left channel)
      ctx.fillRect(x, centerY - barHeight, Math.max(1, barWidth - 0.5), barHeight);
    });
    
    // Draw right channel (bottom half)
    normalizedRight.forEach((value, i) => {
      const x = paddingX + (i * barWidth);
      const barHeight = value * (maxBarHeight / 2);
      
      // Color based on progress (use interpolated colors)
      const barProgress = i / normalizedRight.length;
      const color = barProgress <= progress 
        ? colorManager.getProgressColorRGBA() 
        : colorManager.getWaveColorRGBA();
      
      ctx.fillStyle = color;
      
      // Draw downward from center (right channel)
      ctx.fillRect(x, centerY, Math.max(1, barWidth - 0.5), barHeight);
    });
    
    // Draw playhead cursor (respecting padding) - always visible
    if (progress > 0) {
      this.drawPlayhead(ctx, paddingX, paddingY, drawWidth, drawHeight, progress, colorManager.getCursorColor());
    }
  }
  
  /**
   * Draw playhead cursor
   */
  private drawPlayhead(
    ctx: CanvasRenderingContext2D,
    paddingX: number,
    paddingY: number,
    drawWidth: number,
    drawHeight: number,
    progress: number,
    cursorColor: ColorRGBA
  ): void {
    const cursorX = paddingX + (progress * drawWidth);
    // Cursor always at full opacity
    ctx.fillStyle = `rgba(${cursorColor.r}, ${cursorColor.g}, ${cursorColor.b}, ${cursorColor.a})`;
    ctx.fillRect(cursorX - 1, paddingY, 2, drawHeight);
  }
}

