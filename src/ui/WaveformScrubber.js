// Waveform Scrubber Component
// Renders audio waveform using Audiotool Audiograph data

import { safeSentrySpan, safeCaptureException } from '../core/SentryInit.js';

export class WaveformScrubber {
  constructor(container, audioElement) {
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
    
    // Waveform value animation
    this.displayedLeftData = null;  // Currently displayed values (interpolated)
    this.displayedRightData = null;
    this.targetLeftData = null;     // Target values to interpolate toward
    this.targetRightData = null;
    this.waveformAnimationSpeed = 1.5; // Speed of value interpolation
    this.minWaveformValue = 0.05;  // Minimum normalized value (not quite 0 for visual continuity)
    this.staggerAmount = 0.6;      // Stagger amount (0-1, how much to delay each subsequent bar) - increased for slower stagger
    this.animationProgress = 1;    // Global animation progress (0 to 1+stagger)
    
    // Visual settings (will be overridden by CSS tokens)
    this.waveColor = 'rgba(255, 255, 255, 0.3)';
    this.waveColorHover = 'rgba(255, 255, 255, 0.5)';
    this.progressColor = 'rgba(255, 255, 255, 0.9)';
    this.cursorColor = 'rgba(255, 255, 255, 1.0)';
    this.backgroundColor = 'rgba(0, 0, 0, 0.2)';
    
    // Color transition
    this.targetWaveColor = this.waveColor;
    this.targetProgressColor = this.progressColor;
    this.targetCursorColor = this.cursorColor;
    this.currentWaveColor = { r: 255, g: 255, b: 255, a: 0.3 };
    this.currentProgressColor = { r: 255, g: 255, b: 255, a: 0.9 };
    this.currentCursorColor = { r: 255, g: 255, b: 255, a: 1.0 };
    this.colorTransitionDuration = 1000; // Fixed 1 second transition
    this.colorTransitionStartTime = null;
    this.colorTransitionProgress = 1; // 0 to 1 (1 = complete)
    
    // Waveform opacity for transitions
    this.waveformOpacity = 1; // Start visible for placeholder
    this.targetWaveformOpacity = 1;
    this.waveformTransitionSpeed = 0.15; // Fast spatial transition
    
    // Padding (read from CSS tokens)
    this.paddingX = 12;
    this.paddingY = 8;
    
    this.init();
  }
  
  init() {
    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'waveform-canvas';
    this.ctx = this.canvas.getContext('2d');
    
    // Hide time displays (we'll show them on the canvas)
    const timeDisplay = this.container.querySelector('.time-display');
    if (timeDisplay) {
      timeDisplay.style.display = 'none';
    }
    
    this.container.appendChild(this.canvas);
    this.container.classList.add('has-waveform');
    
    // Read padding from CSS tokens
    this.readCSSTokens();
    
    // Setup interaction
    this.setupInteraction();
    
    // Setup resize observer
    this.setupResize();
    
    // Initial resize
    this.resize();
    
    // Start animation loop
    this.startAnimationLoop();
  }
  
  readCSSTokens() {
    // Read padding from CSS custom properties
    const style = getComputedStyle(document.documentElement);
    const paddingX = style.getPropertyValue('--waveform-padding-x').trim();
    const paddingY = style.getPropertyValue('--waveform-padding-y').trim();
    
    // Parse pixel values (e.g., "12px" -> 12)
    this.paddingX = paddingX ? parseFloat(paddingX) : 12;
    this.paddingY = paddingY ? parseFloat(paddingY) : 8;
  }
  
  setupResize() {
    const resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    resizeObserver.observe(this.container);
  }
  
  resize() {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    // Set canvas size
    this.canvas.width = rect.width * dpr;
    this.canvas.height = 60 * dpr; // Fixed height in logical pixels
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = '60px';
    
    // Scale context for high DPI
    this.ctx.scale(dpr, dpr);
    
    this.draw();
  }
  
  setupInteraction() {
    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.handleSeek(e);
    });
    
    document.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        this.handleSeek(e);
      }
    });
    
    document.addEventListener('mouseup', () => {
      this.isDragging = false;
    });
    
    this.canvas.addEventListener('click', (e) => {
      this.handleSeek(e);
    });
    
    // Touch events
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.isDragging = true;
      this.handleSeek(e.touches[0]);
    }, { passive: false });
    
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (this.isDragging) {
        this.handleSeek(e.touches[0]);
      }
    }, { passive: false });
    
    this.canvas.addEventListener('touchend', () => {
      this.isDragging = false;
    });
  }
  
  handleSeek(e) {
    if (!this.audioElement || !this.audioElement.duration) return;
    
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - this.paddingX; // Account for left padding
    const availableWidth = rect.width - (this.paddingX * 2); // Subtract both paddings
    const percent = x / availableWidth;
    const clampedPercent = Math.max(0, Math.min(1, percent));
    
    this.audioElement.currentTime = clampedPercent * this.audioElement.duration;
  }
  
  /**
   * Load waveform data for a track
   * @param {string} trackId - Track ID in format "tracks/xyz"
   * @param {number} resolution - Desired resolution (defaults to canvas width)
   */
  async loadWaveform(trackId, resolution = null) {
    return safeSentrySpan(
      {
        op: 'waveform.load',
        name: 'Load Waveform Data',
      },
      async (span) => {
        try {
          // Avoid reloading same waveform
          if (this.currentTrackId === trackId && this.waveformData) {
            console.log('📊 Waveform already loaded for this track');
            return;
          }
          
          // Default resolution to canvas width (or closest supported value)
          if (!resolution) {
            //const canvasWidth = this.canvas.width / (window.devicePixelRatio || 1);
            // Pick closest supported resolution
            //const resolutions = [120, 240, 480, 960, 1920, 3840];
            //resolution = resolutions.find(r => r >= canvasWidth) || 1920;
            resolution = 120; // STATIC OVERRIDE FOR NOW
          }
          
          // Import the service dynamically
          const { getAudiographs } = await import('../core/AudiotoolTrackService.js');
          
          console.log(`📊 Loading waveform for ${trackId} at ${resolution}px (stereo)`);
          
          const result = await getAudiographs(trackId, resolution, true);
          
          if (result.success && result.audiographs && result.audiographs.length > 0) {
            const audiograph = result.audiographs[0];
            if (audiograph.graphs && audiograph.graphs.length >= 2) {
              // Stereo: graphs[0] = left channel, graphs[1] = right channel
              const newLeftData = audiograph.graphs[0].values || [];
              const newRightData = audiograph.graphs[1].values || [];
              
              // Set target data (what we're animating TO)
              this.targetLeftData = newLeftData;
              this.targetRightData = newRightData;
              
              // Normalize to 0-1 range for animation
              const maxLeft = Math.max(...newLeftData);
              const maxRight = Math.max(...newRightData);
              const maxValue = Math.max(maxLeft, maxRight);
              
              const normalizedTargetLeft = newLeftData.map(v => v / maxValue);
              const normalizedTargetRight = newRightData.map(v => v / maxValue);
              
              // Initialize displayed data if first load or resolution changed
              if (!this.displayedLeftData || this.displayedLeftData.length !== normalizedTargetLeft.length) {
                // Start from min values
                this.displayedLeftData = new Array(normalizedTargetLeft.length).fill(this.minWaveformValue);
                this.displayedRightData = new Array(normalizedTargetRight.length).fill(this.minWaveformValue);
              }
              
              // Store normalized targets
              this.targetLeftData = normalizedTargetLeft;
              this.targetRightData = normalizedTargetRight;
              
              // Reset animation progress for stagger effect
              this.animationProgress = 0;
              
              // Keep legacy references
              this.leftChannelData = newLeftData;
              this.rightChannelData = newRightData;
              this.waveformData = newLeftData;
              this.currentTrackId = trackId;
              
              console.log(`✅ Loaded stereo waveform: L=${newLeftData.length} R=${newRightData.length} data points`);
              
              span.setAttribute('waveform.dataPoints', newLeftData.length);
              span.setAttribute('waveform.channels', 'stereo');
              span.setAttribute('waveform.resolution', resolution);
              
              this.draw();
            } else if (audiograph.graphs && audiograph.graphs.length === 1) {
              // Fallback to mono if only one channel received
              console.warn('⚠️  Received mono data, duplicating for stereo visualization');
              const newData = audiograph.graphs[0].values || [];
              
              // Set target data (duplicated for stereo)
              this.targetLeftData = newData;
              this.targetRightData = newData;
              
              // Normalize to 0-1 range
              const maxValue = Math.max(...newData);
              const normalizedTarget = newData.map(v => v / maxValue);
              
              // Initialize displayed data if first load or resolution changed
              if (!this.displayedLeftData || this.displayedLeftData.length !== normalizedTarget.length) {
                this.displayedLeftData = new Array(normalizedTarget.length).fill(this.minWaveformValue);
                this.displayedRightData = new Array(normalizedTarget.length).fill(this.minWaveformValue);
              }
              
              // Store normalized targets
              this.targetLeftData = normalizedTarget;
              this.targetRightData = normalizedTarget;
              
              // Reset animation progress for stagger effect
              this.animationProgress = 0;
              
              // Keep legacy references
              this.leftChannelData = newData;
              this.rightChannelData = newData;
              this.waveformData = newData;
              this.currentTrackId = trackId;
              
              this.draw();
            } else {
              console.warn('⚠️  No graph data in audiograph response');
              this.animateToMinValues();
            }
          } else {
            console.warn('⚠️  No audiograph data received:', result.error || 'Unknown error');
            this.animateToMinValues();
          }
        } catch (error) {
          console.error('❌ Failed to load waveform:', error);
          safeCaptureException(error);
          this.animateToMinValues();
        }
      }
    );
  }
  
  /**
   * Clear waveform data (with value animation to minimum)
   */
  clearWaveform() {
    this.animateToMinValues();
    this.currentTrackId = null;
  }
  
  /**
   * Animate waveform values to minimum (for clearing or errors)
   */
  animateToMinValues() {
    // Set targets to minimum values (animate down)
    if (this.displayedLeftData && this.displayedLeftData.length > 0) {
      this.targetLeftData = new Array(this.displayedLeftData.length).fill(this.minWaveformValue);
      this.targetRightData = new Array(this.displayedRightData.length).fill(this.minWaveformValue);
      
      // Reset animation progress for stagger effect
      this.animationProgress = 0;
    } else {
      // No displayed data yet, just clear everything
      this.targetLeftData = null;
      this.targetRightData = null;
      this.displayedLeftData = null;
      this.displayedRightData = null;
      this.leftChannelData = null;
      this.rightChannelData = null;
      this.waveformData = null;
      this.animationProgress = 0;
    }
    
    // Clear legacy data after a delay to allow animation
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
  startAnimationLoop() {
    const animate = () => {
      this.draw();
      this.animationFrameId = requestAnimationFrame(animate);
    };
    animate();
  }
  
  /**
   * Stop animation loop
   */
  stopAnimationLoop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
  
  /**
   * Update the waveform visualization
   */
  draw() {
    // FPS throttling (match shader system at 30 FPS)
    const now = Date.now();
    const elapsed = now - this.lastFrameTime;
    const targetFrameInterval = 1000 / this.targetFPS;
    
    if (elapsed < targetFrameInterval) {
      return; // Skip frame to maintain target FPS
    }
    
    this.lastFrameTime = now;
    
    const canvasWidth = this.canvas.width / (window.devicePixelRatio || 1);
    const canvasHeight = this.canvas.height / (window.devicePixelRatio || 1);
    
    // Clear canvas
    this.ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw background
    this.ctx.fillStyle = this.backgroundColor;
    this.ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Calculate drawable area with padding
    const drawWidth = canvasWidth - (this.paddingX * 2);
    const drawHeight = canvasHeight - (this.paddingY * 2);
    const centerY = canvasHeight / 2;
    
    // Interpolate waveform values
    this.interpolateWaveformData();
    
    // Smooth color transitions
    this.interpolateColors();
    
    // Calculate progress (needed for both waveform and playhead)
    const progress = this.audioElement && this.audioElement.duration
      ? this.audioElement.currentTime / this.audioElement.duration
      : 0;
    
    if (!this.displayedLeftData || this.displayedLeftData.length === 0 || 
        !this.displayedRightData || this.displayedRightData.length === 0) {
      // Draw placeholder line if no waveform (respecting padding)
      const placeholderColor = this.parseRGBA(this.waveColor);
      this.ctx.fillStyle = `rgba(${placeholderColor.r}, ${placeholderColor.g}, ${placeholderColor.b}, ${placeholderColor.a})`;
      this.ctx.fillRect(this.paddingX, centerY - 1, drawWidth, 2);
      
      // Still draw playhead even without waveform data
      if (progress > 0) {
        const cursorX = this.paddingX + (progress * drawWidth);
        const color = this.currentCursorColor;
        this.ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
        this.ctx.fillRect(cursorX - 1, this.paddingY, 2, drawHeight);
      }
      return;
    }
    
    // Use displayed data (already normalized 0-1)
    const normalizedLeft = this.displayedLeftData;
    const normalizedRight = this.displayedRightData;
    
    // Draw waveform bars
    const barWidth = drawWidth / normalizedLeft.length;
    const maxBarHeight = drawHeight; // Use full drawable height (already has padding factored in)
    
    // Draw left channel (top half)
    normalizedLeft.forEach((value, i) => {
      const x = this.paddingX + (i * barWidth);
      const barHeight = value * (maxBarHeight / 2);
      
      // Color based on progress (use interpolated colors)
      const barProgress = i / normalizedLeft.length;
      const color = barProgress <= progress ? this.currentProgressColor : this.currentWaveColor;
      
      this.ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
      
      // Draw upward from center (left channel)
      this.ctx.fillRect(x, centerY - barHeight, Math.max(1, barWidth - 0.5), barHeight);
    });
    
    // Draw right channel (bottom half)
    normalizedRight.forEach((value, i) => {
      const x = this.paddingX + (i * barWidth);
      const barHeight = value * (maxBarHeight / 2);
      
      // Color based on progress (use interpolated colors)
      const barProgress = i / normalizedRight.length;
      const color = barProgress <= progress ? this.currentProgressColor : this.currentWaveColor;
      
      this.ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
      
      // Draw downward from center (right channel)
      this.ctx.fillRect(x, centerY, Math.max(1, barWidth - 0.5), barHeight);
    });
    
    // Draw playhead cursor (respecting padding) - always visible
    if (progress > 0) {
      const cursorX = this.paddingX + (progress * drawWidth);
      const color = this.currentCursorColor;
      // Cursor always at full opacity (don't multiply by waveformOpacity)
      this.ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
      this.ctx.fillRect(cursorX - 1, this.paddingY, 2, drawHeight);
    }
  }
  
  /**
   * Parse RGBA string to color object
   * @param {string} rgbaString - RGBA string (e.g., "rgba(255, 255, 255, 0.3)")
   * @returns {object} Color object with r, g, b, a properties
   */
  parseRGBA(rgbaString) {
    const match = rgbaString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match) {
      return {
        r: parseInt(match[1]),
        g: parseInt(match[2]),
        b: parseInt(match[3]),
        a: match[4] ? parseFloat(match[4]) : 1.0
      };
    }
    return { r: 255, g: 255, b: 255, a: 1.0 };
  }
  
  /**
   * Interpolate colors smoothly with fixed 1-second transition
   */
  interpolateColors() {
    // Parse target colors
    const targetWave = this.parseRGBA(this.targetWaveColor);
    const targetProgress = this.parseRGBA(this.targetProgressColor);
    const targetCursor = this.parseRGBA(this.targetCursorColor);
    
    // Check if we need to start a new transition
    const colorsChanged = 
      Math.abs(targetWave.r - this.currentWaveColor.r) > 1 ||
      Math.abs(targetWave.g - this.currentWaveColor.g) > 1 ||
      Math.abs(targetWave.b - this.currentWaveColor.b) > 1 ||
      Math.abs(targetProgress.r - this.currentProgressColor.r) > 1 ||
      Math.abs(targetProgress.g - this.currentProgressColor.g) > 1 ||
      Math.abs(targetProgress.b - this.currentProgressColor.b) > 1 ||
      Math.abs(targetCursor.r - this.currentCursorColor.r) > 1 ||
      Math.abs(targetCursor.g - this.currentCursorColor.g) > 1 ||
      Math.abs(targetCursor.b - this.currentCursorColor.b) > 1;
    
    if (colorsChanged && this.colorTransitionProgress >= 1) {
      // Start new transition
      this.colorTransitionStartTime = Date.now();
      this.colorTransitionProgress = 0;
      
      // Store starting colors
      this.startWaveColor = { ...this.currentWaveColor };
      this.startProgressColor = { ...this.currentProgressColor };
      this.startCursorColor = { ...this.currentCursorColor };
    }
    
    // Update transition progress
    if (this.colorTransitionProgress < 1 && this.colorTransitionStartTime) {
      const elapsed = Date.now() - this.colorTransitionStartTime;
      this.colorTransitionProgress = Math.min(1, elapsed / this.colorTransitionDuration);
      
      // Use easing function for smooth transition (ease-in-out)
      const t = this.colorTransitionProgress;
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      
      // Interpolate wave color
      this.currentWaveColor.r = this.startWaveColor.r + (targetWave.r - this.startWaveColor.r) * eased;
      this.currentWaveColor.g = this.startWaveColor.g + (targetWave.g - this.startWaveColor.g) * eased;
      this.currentWaveColor.b = this.startWaveColor.b + (targetWave.b - this.startWaveColor.b) * eased;
      this.currentWaveColor.a = this.startWaveColor.a + (targetWave.a - this.startWaveColor.a) * eased;
      
      // Interpolate progress color
      this.currentProgressColor.r = this.startProgressColor.r + (targetProgress.r - this.startProgressColor.r) * eased;
      this.currentProgressColor.g = this.startProgressColor.g + (targetProgress.g - this.startProgressColor.g) * eased;
      this.currentProgressColor.b = this.startProgressColor.b + (targetProgress.b - this.startProgressColor.b) * eased;
      this.currentProgressColor.a = this.startProgressColor.a + (targetProgress.a - this.startProgressColor.a) * eased;
      
      // Interpolate cursor color
      this.currentCursorColor.r = this.startCursorColor.r + (targetCursor.r - this.startCursorColor.r) * eased;
      this.currentCursorColor.g = this.startCursorColor.g + (targetCursor.g - this.startCursorColor.g) * eased;
      this.currentCursorColor.b = this.startCursorColor.b + (targetCursor.b - this.startCursorColor.b) * eased;
      this.currentCursorColor.a = this.startCursorColor.a + (targetCursor.a - this.startCursorColor.a) * eased;
    }
  }
  
  /**
   * Interpolate displayed waveform data toward target data with stagger effect
   */
  interpolateWaveformData() {
    if (!this.displayedLeftData || !this.targetLeftData) return;
    if (!this.displayedRightData || !this.targetRightData) return;
    
    const dataLength = this.displayedLeftData.length;
    
    // Increase animation progress (slower for more visible stagger effect)
    if (this.animationProgress < 1 + this.staggerAmount) {
      this.animationProgress += 0.015; // Progress increment per frame (halved for slower animation)
    }
    
    // Interpolate each value for left channel with stagger
    for (let i = 0; i < dataLength; i++) {
      // Calculate when this bar should start animating (0 to staggerAmount)
      const barStartTime = (i / dataLength) * this.staggerAmount;
      
      // Calculate how much this bar should animate (0 to 1)
      const barProgress = Math.max(0, Math.min(1, this.animationProgress - barStartTime));
      
      // Only interpolate if this bar has started animating
      if (barProgress > 0) {
        const target = this.targetLeftData[i] !== undefined ? this.targetLeftData[i] : this.minWaveformValue;
        // Apply interpolation with adjusted speed based on progress
        const effectiveSpeed = this.waveformAnimationSpeed * barProgress;
        this.displayedLeftData[i] += (target - this.displayedLeftData[i]) * effectiveSpeed;
      }
    }
    
    // Interpolate each value for right channel with stagger
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
   * @param {object} colors - Color object from theme
   */
  setColors(colors) {
    if (colors && colors.color) {
      // Use the primary color from the theme
      const rgb = colors.color;
      
      // Set target colors (will be interpolated smoothly in draw())
      this.targetProgressColor = `rgba(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)}, 1.0)`;
      this.targetCursorColor = `rgba(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)}, 1.0)`;
      
      // Use a dimmer version for inactive waveform
      this.targetWaveColor = `rgba(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)}, 0.3)`;
    }
    // Note: draw() is called automatically by animation loop and will interpolate colors
  }
  
  /**
   * Cleanup when component is destroyed
   */
  destroy() {
    this.stopAnimationLoop();
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }
}

