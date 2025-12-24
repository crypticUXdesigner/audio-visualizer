// Waveform Scrubber Component
// Renders audio waveform using Audiotool Audiograph data

import { ShaderLogger } from '../shaders/utils/ShaderLogger.js';
import { EventListenerManager } from '../utils/eventListenerManager.js';
import { WaveformColorManager } from './waveform/WaveformColorManager.js';
import { WaveformDataLoader } from './waveform/WaveformDataLoader.js';
import { WaveformRenderer, type RenderContext } from './waveform/WaveformRenderer.js';
import type { ColorMap } from '../types/index.js';

export class WaveformScrubber {
  container: HTMLElement;
  audioElement: HTMLAudioElement | null;
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  waveformData: number[] | null;
  leftChannelData: number[] | null;
  rightChannelData: number[] | null;
  isDragging: boolean;
  currentTrackId: string | null;
  animationFrameId: number | null;
  targetFPS: number;
  lastFrameTime: number;
  displayedLeftData: number[] | null;
  displayedRightData: number[] | null;
  targetLeftData: number[] | null;
  targetRightData: number[] | null;
  waveformAnimationSpeed: number;
  minWaveformValue: number;
  staggerAmount: number;
  animationProgress: number;
  backgroundColor: string;
  waveformOpacity: number;
  targetWaveformOpacity: number;
  waveformTransitionSpeed: number;
  paddingX: number;
  paddingY: number;
  resizeObserver: ResizeObserver | null;
  windowResizeHandler: (() => void) | null;
  visualViewportHandler: (() => void) | null;
  orientationChangeHandler: (() => void) | null;
  resizeTimeout: ReturnType<typeof setTimeout> | null;
  resizeRetryCount: number;
  eventListenerManager: EventListenerManager;
  
  // Module instances
  colorManager: WaveformColorManager;
  dataLoader: WaveformDataLoader;
  renderer: WaveformRenderer;
  
  constructor(container: HTMLElement, audioElement: HTMLAudioElement | null) {
    this.container = container;
    this.audioElement = audioElement;
    this.canvas = null;
    this.ctx = null;
    this.waveformData = null;
    this.leftChannelData = null;
    this.rightChannelData = null;
    this.isDragging = false;
    this.currentTrackId = null;
    this.animationFrameId = null;
    
    // FPS throttling (match shader system)
    this.targetFPS = 30;
    this.lastFrameTime = 0;
    
    // Initialize modules first
    this.colorManager = new WaveformColorManager();
    this.dataLoader = new WaveformDataLoader();
    this.renderer = new WaveformRenderer();
    
    // Waveform value animation
    this.displayedLeftData = null;
    this.displayedRightData = null;
    this.targetLeftData = null;
    this.targetRightData = null;
    this.waveformAnimationSpeed = 1.5;
    this.minWaveformValue = this.dataLoader.getMinWaveformValue();
    this.staggerAmount = 0.6;
    this.animationProgress = 1;
    
    // Visual settings
    this.backgroundColor = 'rgba(0, 0, 0, 0.62)';
    this.waveformOpacity = 1;
    this.targetWaveformOpacity = 1;
    this.waveformTransitionSpeed = 0.15;
    
    // Padding (read from CSS tokens)
    this.paddingX = 12;
    this.paddingY = 8;
    
    this.resizeObserver = null;
    this.windowResizeHandler = null;
    this.visualViewportHandler = null;
    this.orientationChangeHandler = null;
    this.resizeTimeout = null;
    this.resizeRetryCount = 0;
    this.eventListenerManager = new EventListenerManager();
    
    this.init();
  }
  
  init(): void {
    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'waveform-canvas';
    this.ctx = this.canvas.getContext('2d');
    
    // Hide time displays (we'll show them on the canvas)
    const timeDisplay = this.container.querySelector('.time-display') as HTMLElement | null;
    if (timeDisplay) {
      timeDisplay.style.display = 'none';
    }
    
    // Insert canvas before playback controls (if they exist) or append to container
    const playbackControls = this.container.querySelector('.playback-controls');
    if (playbackControls) {
      this.container.insertBefore(this.canvas, playbackControls);
    } else {
      this.container.appendChild(this.canvas);
    }
    this.container.classList.add('has-waveform');
    
    // Read padding from CSS tokens
    this.readCSSTokens();
    
    // Setup interaction
    this.setupInteraction();
    
    // Setup resize observer
    this.setupResize();
    
    // Initial resize - wait for layout to settle
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.resize();
      });
    });
    
    // Start animation loop
    this.startAnimationLoop();
  }
  
  readCSSTokens(): void {
    const style = getComputedStyle(document.documentElement);
    const paddingX = style.getPropertyValue('--waveform-padding-x').trim();
    const paddingY = style.getPropertyValue('--waveform-padding-y').trim();
    
    this.paddingX = paddingX ? parseFloat(paddingX) : 12;
    this.paddingY = paddingY ? parseFloat(paddingY) : 8;
  }
  
  setupResize(): void {
    const handleResize = () => {
      requestAnimationFrame(() => {
        this.resize();
      });
    };
    
    this.resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    
    if (this.container) {
      this.resizeObserver.observe(this.container);
    }
    
    if (this.canvas) {
      requestAnimationFrame(() => {
        if (this.canvas && this.resizeObserver) {
          this.resizeObserver.observe(this.canvas);
        }
      });
    }
    
    this.windowResizeHandler = () => {
      if (this.resizeTimeout) {
        clearTimeout(this.resizeTimeout);
      }
      this.resizeTimeout = setTimeout(() => {
        handleResize();
      }, 50);
    };
    this.eventListenerManager.add(window, 'resize', this.windowResizeHandler);
    
    if (window.visualViewport) {
      this.visualViewportHandler = () => {
        if (this.resizeTimeout) {
          clearTimeout(this.resizeTimeout);
        }
        this.resizeTimeout = setTimeout(() => {
          handleResize();
        }, 50);
      };
      this.eventListenerManager.add(window.visualViewport, 'resize', this.visualViewportHandler);
      this.eventListenerManager.add(window.visualViewport, 'scroll', this.visualViewportHandler);
    }
    
    this.orientationChangeHandler = () => {
      setTimeout(() => {
        handleResize();
      }, 300);
    };
    this.eventListenerManager.add(window, 'orientationchange', this.orientationChangeHandler);
  }
  
  resize(): void {
    if (!this.canvas || !this.ctx) return;
    
    try {
      const canvasRect = this.canvas.getBoundingClientRect();
      const displayWidth = canvasRect.width;
      const displayHeight = canvasRect.height;
      
      if (displayWidth <= 0 || displayHeight <= 0) {
        if (!this.resizeRetryCount) {
          this.resizeRetryCount = 0;
        }
        if (this.resizeRetryCount < 5) {
          this.resizeRetryCount++;
          setTimeout(() => {
            this.resize();
          }, 50);
        }
        return;
      }
      
      this.resizeRetryCount = 0;
      
      const dpr = window.devicePixelRatio || 1;
      const newWidth = Math.max(1, Math.floor(displayWidth * dpr));
      const newHeight = Math.max(1, Math.floor(displayHeight * dpr));
      
      const currentWidth = this.canvas.width;
      const currentHeight = this.canvas.height;
      
      if (currentWidth !== newWidth || currentHeight !== newHeight) {
        this.canvas.width = newWidth;
        this.canvas.height = newHeight;
        
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
      }
      
      this.draw();
    } catch (error) {
      ShaderLogger.error('Error in waveform resize:', error);
    }
  }
  
  setupInteraction(): void {
    if (!this.canvas) return;
    
    const onMouseDown = (e: MouseEvent) => {
      this.isDragging = true;
      this.handleSeek(e);
    };
    this.eventListenerManager.add(this.canvas, 'mousedown', onMouseDown);
    
    const onMouseMove = (e: MouseEvent) => {
      if (this.isDragging) {
        this.handleSeek(e);
      }
    };
    this.eventListenerManager.add(document, 'mousemove', onMouseMove);
    
    const onMouseUp = () => {
      this.isDragging = false;
    };
    this.eventListenerManager.add(document, 'mouseup', onMouseUp);
    
    const onClick = (e: MouseEvent) => {
      this.handleSeek(e);
    };
    this.eventListenerManager.add(this.canvas, 'click', onClick);
    
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      this.isDragging = true;
      this.handleSeek(e.touches[0]);
    };
    this.eventListenerManager.add(this.canvas, 'touchstart', onTouchStart, { passive: false });
    
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (this.isDragging) {
        this.handleSeek(e.touches[0]);
      }
    };
    this.eventListenerManager.add(this.canvas, 'touchmove', onTouchMove, { passive: false });
    
    const onTouchEnd = () => {
      this.isDragging = false;
    };
    this.eventListenerManager.add(this.canvas, 'touchend', onTouchEnd);
  }
  
  handleSeek(e: MouseEvent | Touch): void {
    if (!this.audioElement || !this.audioElement.duration || !this.canvas) return;
    
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - this.paddingX;
    const availableWidth = rect.width - (this.paddingX * 2);
    const percent = x / availableWidth;
    const clampedPercent = Math.max(0, Math.min(1, percent));
    
    this.audioElement.currentTime = clampedPercent * this.audioElement.duration;
  }
  
  /**
   * Load waveform data for a track
   */
  async loadWaveform(trackId: string, resolution: number | null = null): Promise<void> {
    const waveformData = await this.dataLoader.loadWaveform(
      trackId,
      resolution,
      this.currentTrackId,
      this.waveformData
    );
    
    if (!waveformData) {
      // Cache hit or error - animate to min if error
      if (this.currentTrackId !== trackId) {
        this.animateToMinValues();
      }
      return;
    }
    
    // Set target data
    this.targetLeftData = waveformData.normalizedTargetLeft;
    this.targetRightData = waveformData.normalizedTargetRight;
    
    // Initialize displayed data if first load or resolution changed
    if (!this.displayedLeftData || this.displayedLeftData.length !== waveformData.normalizedTargetLeft.length) {
      const [leftData, rightData] = this.dataLoader.initializeDisplayData(waveformData.normalizedTargetLeft.length);
      this.displayedLeftData = leftData;
      this.displayedRightData = rightData;
    }
    
    // Reset animation progress for stagger effect
    this.animationProgress = 0;
    
    // Keep legacy references
    this.leftChannelData = waveformData.leftChannelData;
    this.rightChannelData = waveformData.rightChannelData;
    this.waveformData = waveformData.leftChannelData;
    this.currentTrackId = trackId;
    
    this.draw();
  }
  
  /**
   * Clear waveform data (with value animation to minimum)
   */
  clearWaveform(): void {
    this.animateToMinValues();
    this.currentTrackId = null;
  }
  
  /**
   * Animate waveform values to minimum (for clearing or errors)
   */
  animateToMinValues(): void {
    if (this.displayedLeftData && this.displayedLeftData.length > 0) {
      this.targetLeftData = new Array(this.displayedLeftData.length).fill(this.minWaveformValue);
      this.targetRightData = new Array(this.displayedRightData?.length || 0).fill(this.minWaveformValue);
      this.animationProgress = 0;
    } else {
      this.targetLeftData = null;
      this.targetRightData = null;
      this.displayedLeftData = null;
      this.displayedRightData = null;
      this.leftChannelData = null;
      this.rightChannelData = null;
      this.waveformData = null;
      this.animationProgress = 0;
    }
    
    setTimeout(() => {
      const isNearMin = this.displayedLeftData && 
                        this.displayedLeftData.every(v => Math.abs(v - this.minWaveformValue) < 0.01);
      if (isNearMin || !this.displayedLeftData) {
        this.leftChannelData = null;
        this.rightChannelData = null;
        this.waveformData = null;
      }
    }, 500);
  }
  
  /**
   * Start animation loop for smooth playback visualization
   */
  startAnimationLoop(): void {
    const animate = () => {
      this.draw();
      this.animationFrameId = requestAnimationFrame(animate);
    };
    animate();
  }
  
  /**
   * Stop animation loop
   */
  stopAnimationLoop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
  
  /**
   * Update the waveform visualization
   */
  draw(): void {
    // FPS throttling
    const now = Date.now();
    const elapsed = now - this.lastFrameTime;
    const targetFrameInterval = 1000 / this.targetFPS;
    
    if (elapsed < targetFrameInterval) {
      return;
    }
    
    this.lastFrameTime = now;
    
    if (!this.canvas || !this.ctx) return;
    
    const renderContext: RenderContext = {
      canvas: this.canvas,
      ctx: this.ctx,
      paddingX: this.paddingX,
      paddingY: this.paddingY,
      backgroundColor: this.backgroundColor,
      audioElement: this.audioElement
    };
    
    this.renderer.render(
      renderContext,
      this.colorManager,
      this.displayedLeftData,
      this.displayedRightData,
      () => this.interpolateWaveformData()
    );
  }
  
  /**
   * Interpolate displayed waveform data toward target data with stagger effect
   */
  interpolateWaveformData(): void {
    if (!this.displayedLeftData || !this.targetLeftData) return;
    if (!this.displayedRightData || !this.targetRightData) return;
    
    const dataLength = this.displayedLeftData.length;
    
    if (this.animationProgress < 1 + this.staggerAmount) {
      this.animationProgress += 0.015;
    }
    
    // Interpolate left channel
    for (let i = 0; i < dataLength; i++) {
      const barStartTime = (i / dataLength) * this.staggerAmount;
      const barProgress = Math.max(0, Math.min(1, this.animationProgress - barStartTime));
      
      if (barProgress > 0) {
        const target = this.targetLeftData[i] !== undefined ? this.targetLeftData[i] : this.minWaveformValue;
        const effectiveSpeed = this.waveformAnimationSpeed * barProgress;
        this.displayedLeftData[i] += (target - this.displayedLeftData[i]) * effectiveSpeed;
      }
    }
    
    // Interpolate right channel
    for (let i = 0; i < dataLength; i++) {
      const barStartTime = (i / dataLength) * this.staggerAmount;
      const barProgress = Math.max(0, Math.min(1, this.animationProgress - barStartTime));
      
      if (barProgress > 0) {
        const target = this.targetRightData[i] !== undefined ? this.targetRightData[i] : this.minWaveformValue;
        const effectiveSpeed = this.waveformAnimationSpeed * barProgress;
        this.displayedRightData[i] += (target - this.displayedRightData[i]) * effectiveSpeed;
      }
    }
  }
  
  /**
   * Update colors to match current theme (with smooth transitions)
   */
  setColors(colors: ColorMap): void {
    this.colorManager.setColors(colors);
  }
  
  /**
   * Cleanup when component is destroyed
   */
  destroy(): void {
    this.stopAnimationLoop();
    
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    
    if (this.canvas) {
      this.eventListenerManager.removeAll(this.canvas);
    }
    this.eventListenerManager.removeAll(document);
    this.eventListenerManager.removeAll(window);
    if (window.visualViewport) {
      this.eventListenerManager.removeAll(window.visualViewport);
    }
    
    this.eventListenerManager.cleanup();
    
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = null;
    }
    
    this.windowResizeHandler = null;
    this.visualViewportHandler = null;
    this.orientationChangeHandler = null;
    
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }
}
