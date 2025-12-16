// Frequency Band Visualizer
// Displays 10 frequency bands for left and right channels (standard 10-band EQ)
// Left channel bars go up, right channel bars go down

window.FrequencyVisualizer = {
    canvas: null,
    ctx: null,
    width: 0,
    height: 0,
    
    // Frequency band configuration (10 bands, standard EQ frequencies)
    // Standard center frequencies: 31, 62, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Hz
    // Each band: { minHz, maxHz, color }
    // Colors are dynamically generated from config to match background visualizer
    bands: [
        { minHz: 20, maxHz: 44, color: null },        // 31 Hz - Sub-bass (darkest, freq7)
        { minHz: 44, maxHz: 88, color: null },        // 62 Hz - Bass (dark green, freq6)
        { minHz: 88, maxHz: 177, color: null },      // 125 Hz - Low-mid (green, freq5)
        { minHz: 177, maxHz: 354, color: null },      // 250 Hz - Mid (green, freq5)
        { minHz: 354, maxHz: 707, color: null },      // 500 Hz - Mid-high (cyan, freq4)
        { minHz: 707, maxHz: 1414, color: null },     // 1k Hz - Presence (violet, freq3)
        { minHz: 1414, maxHz: 2828, color: null },    // 2k Hz - Brilliance (yellow, freq2)
        { minHz: 2828, maxHz: 5657, color: null },   // 4k Hz - High (yellow, freq2)
        { minHz: 5657, maxHz: 11314, color: null },  // 8k Hz - Very High (white, freq1)
        { minHz: 11314, maxHz: 20000, color: null }  // 16k Hz - Ultra High (white, freq1)
    ],
    
    // Current frequency data for left and right channels
    leftBandValues: new Array(10).fill(0),
    rightBandValues: new Array(10).fill(0),
    
    // Smoothing for visual appeal
    smoothedLeftBands: new Array(10).fill(0),
    smoothedRightBands: new Array(10).fill(0),
    smoothingFactor: 0.7, // 0-1, higher = smoother but slower response
    
    // Visual settings
    barWidth: 0,
    barSpacing: 0,
    maxBarHeight: 0,
    centerY: 0,
    
    // Update band colors from current color set (called when colors are regenerated)
    updateBandColors() {
        // Check if getColorForFrequencyRange is available and colors are ready
        if (typeof window.getColorForFrequencyRange === 'function') {
            // Check if colors are actually initialized (not just the function existing)
            const colorsReady = window.VisualPlayer && 
                                window.VisualPlayer.colors && 
                                window.VisualPlayer.colors.color &&
                                Array.isArray(window.VisualPlayer.colors.color);
            
            if (colorsReady) {
                try {
                    // Colors are ready, update bands
                    let allUpdated = true;
                    for (let i = 0; i < this.bands.length; i++) {
                        const band = this.bands[i];
                        const color = window.getColorForFrequencyRange(band.minHz, band.maxHz);
                        // Update if we got a valid color (even if it's white - that's a valid color from the set)
                        if (color && color.length === 7 && color.startsWith('#')) {
                            band.color = color;
                        } else {
                            allUpdated = false;
                        }
                    }
                    
                    if (allUpdated) {
                        console.log('Updated frequency visualizer band colors from current color set');
                        // Reset retry counter on success
                        this.updateBandColorsRetries = 0;
                        return true;
                    }
                } catch (error) {
                    console.warn('Error updating frequency visualizer colors:', error);
                }
            }
        }
        
        // Retry after a short delay if colors not ready yet
        if (this.updateBandColorsRetries === undefined) {
            this.updateBandColorsRetries = 0;
        }
        if (this.updateBandColorsRetries < 20) { // Retry up to 2 seconds
            this.updateBandColorsRetries++;
            setTimeout(() => this.updateBandColors(), 100);
            return false;
        } else {
            console.warn('Colors not available after retries, using fallback colors');
            // Fallback to default colors if colors not ready
            this.bands[0].color = '#054a43';
            this.bands[1].color = '#087e55';
            this.bands[2].color = '#41eee5';
            this.bands[3].color = '#41eee5';
            this.bands[4].color = '#7bf4f6';
            this.bands[5].color = '#5030a3';
            this.bands[6].color = '#efef87';
            this.bands[7].color = '#efef87';
            this.bands[8].color = '#c6fbfb';
            this.bands[9].color = '#c6fbfb';
            return false;
        }
    },
    
    init() {
        // Update band colors from config (may need to wait for config to be ready)
        this.updateBandColors();
        
        this.canvas = document.getElementById('frequencyCanvas');
        
        if (!this.canvas) {
            console.warn('Frequency visualizer canvas not found');
            return;
        }
        
        this.ctx = this.canvas.getContext('2d');
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        // Start animation loop
        this.animate();
    },
    
    resize() {
        if (!this.canvas) return;
        
        // Set canvas size (positioned in bottom left via CSS)
        const containerWidth = 300; // Fixed width for visualizer (further reduced for narrower bands)
        const containerHeight = 150; // Fixed height for visualizer (reduced)
        
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = containerWidth * dpr;
        this.canvas.height = containerHeight * dpr;
        this.canvas.style.width = containerWidth + 'px';
        this.canvas.style.height = containerHeight + 'px';
        
        this.ctx.scale(dpr, dpr);
        
        this.width = containerWidth;
        this.height = containerHeight;
        this.centerY = this.height / 2;
        
            // Calculate bar dimensions
            const totalBars = this.bands.length;
            const totalSpacing = 20; // Total spacing on sides (10px on each side)
            const availableWidth = this.width - totalSpacing;
            this.barSpacing = 2; // Fixed 2px spacing between bars
            this.barWidth = (availableWidth - (this.barSpacing * (totalBars + 1))) / totalBars; // Fill all available space after accounting for gaps and padding
            // Leave space for labels at bottom (30px for two rows) and margin at top (10px)
            this.maxBarHeight = (this.height / 2) - 30; // Leave 30px for two-row labels at bottom, 10px margin at top
            
            // Store starting x position
            this.startX = 10; // 10px margin from left
    },
    
    // Calculate frequency band values from frequency data
    calculateBands(leftFrequencyData, rightFrequencyData, sampleRate) {
        if (!leftFrequencyData || !rightFrequencyData) return;
        
        const nyquist = sampleRate / 2;
        const binSize = nyquist / leftFrequencyData.length;
        
        // Calculate average value for each frequency band
        for (let i = 0; i < this.bands.length; i++) {
            const band = this.bands[i];
            
            // Find frequency bin range for this band
            const minBin = Math.floor(band.minHz / binSize);
            const maxBin = Math.ceil(band.maxHz / binSize);
            
            // Calculate average amplitude for left channel
            let leftSum = 0;
            let rightSum = 0;
            let count = 0;
            
            for (let bin = minBin; bin <= maxBin && bin < leftFrequencyData.length; bin++) {
                leftSum += leftFrequencyData[bin];
                rightSum += rightFrequencyData[bin];
                count++;
            }
            
            if (count > 0) {
                // Normalize to 0-1 range (frequency data is 0-255)
                this.leftBandValues[i] = (leftSum / count) / 255.0;
                this.rightBandValues[i] = (rightSum / count) / 255.0;
            } else {
                this.leftBandValues[i] = 0;
                this.rightBandValues[i] = 0;
            }
            
            // Apply smoothing
            this.smoothedLeftBands[i] = 
                this.smoothedLeftBands[i] * this.smoothingFactor + 
                this.leftBandValues[i] * (1 - this.smoothingFactor);
            
            this.smoothedRightBands[i] = 
                this.smoothedRightBands[i] * this.smoothingFactor + 
                this.rightBandValues[i] * (1 - this.smoothingFactor);
        }
    },
    
    // Format frequency label parts for two-row display
    formatFrequencyLabelParts(minHz, maxHz) {
        let minLabel, maxLabel;
        if (maxHz >= 1000) {
            minLabel = (minHz / 1000).toFixed(1) + 'k';
            maxLabel = (maxHz / 1000).toFixed(1) + 'k';
        } else {
            minLabel = minHz.toString();
            maxLabel = maxHz.toString();
        }
        return { minLabel, maxLabel };
    },
    
    draw() {
        if (!this.ctx || !this.canvas) return;
        
        // Clear canvas with semi-transparent background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Draw center line
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.centerY);
        this.ctx.lineTo(this.width, this.centerY);
        this.ctx.stroke();
        
        // Draw bars for each frequency band
        for (let i = 0; i < this.bands.length; i++) {
            const x = this.startX + this.barSpacing + (i * (this.barWidth + this.barSpacing)) + (this.barWidth / 2);
            const band = this.bands[i];
            
            // Get smoothed values
            const leftValue = this.smoothedLeftBands[i];
            const rightValue = this.smoothedRightBands[i];
            
            // Calculate bar heights
            const leftHeight = leftValue * this.maxBarHeight;
            const rightHeight = rightValue * this.maxBarHeight;
            
            // Draw left channel bar (upward)
            if (leftHeight > 0.5) {
                this.ctx.fillStyle = band.color;
                this.ctx.fillRect(
                    x - this.barWidth / 2,
                    this.centerY - leftHeight,
                    this.barWidth,
                    leftHeight
                );
            }
            
            // Draw right channel bar (downward)
            if (rightHeight > 0.5) {
                this.ctx.fillStyle = band.color;
                this.ctx.fillRect(
                    x - this.barWidth / 2,
                    this.centerY,
                    this.barWidth,
                    rightHeight
                );
            }
            
            // Draw bar outlines for better visibility
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            this.ctx.lineWidth = 1;
            if (leftHeight > 0.5) {
                this.ctx.strokeRect(
                    x - this.barWidth / 2,
                    this.centerY - leftHeight,
                    this.barWidth,
                    leftHeight
                );
            }
            if (rightHeight > 0.5) {
                this.ctx.strokeRect(
                    x - this.barWidth / 2,
                    this.centerY,
                    this.barWidth,
                    rightHeight
                );
            }
            
            // Draw frequency label in two rows at the bottom of the canvas
            const { minLabel, maxLabel } = this.formatFrequencyLabelParts(band.minHz, band.maxHz);
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            this.ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'bottom';
            // Draw max value on top row
            this.ctx.fillText(maxLabel, x, this.height - 3);
            // Draw min value on bottom row
            this.ctx.fillText(minLabel, x, this.height - 18);
        }
    },
    
    animate() {
        // Get frequency data from AudioVisualizer
        if (window.AudioVisualizer && 
            window.AudioVisualizer.leftFrequencyData && 
            window.AudioVisualizer.rightFrequencyData &&
            window.AudioVisualizer.audioContext) {
            
            const sampleRate = window.AudioVisualizer.audioContext.sampleRate;
            this.calculateBands(
                window.AudioVisualizer.leftFrequencyData,
                window.AudioVisualizer.rightFrequencyData,
                sampleRate
            );
        }
        
        this.draw();
        requestAnimationFrame(() => this.animate());
    }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Check for debug mode
        const urlParams = new URLSearchParams(window.location.search);
        const isDebugMode = urlParams.has('debug');
        
        // Don't initialize on mobile or if not in debug mode
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                        (window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
        
        if (!isMobile && isDebugMode && window.FrequencyVisualizer) {
            window.FrequencyVisualizer.init();
        }
    });
} else {
    // Check for debug mode
    const urlParams = new URLSearchParams(window.location.search);
    const isDebugMode = urlParams.has('debug');
    
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                    (window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
    
    if (!isMobile && isDebugMode && window.FrequencyVisualizer) {
        window.FrequencyVisualizer.init();
    }
}

