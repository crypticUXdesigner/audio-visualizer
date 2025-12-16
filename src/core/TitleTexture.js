// TitleTexture - Creates and manages title texture for shader
// Renders text to canvas and uploads as WebGL texture

export class TitleTexture {
    constructor(gl, options = {}) {
        this.gl = gl;
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.texture = null;
        this.needsUpdate = true;
        this.currentTitle = '';
        this.fontLoaded = false;
        this.fontLoadPromise = null;
        
        // Capitalization options: 'original', 'uppercase', 'lowercase', 'title'
        this.textTransform = options.textTransform || 'uppercase';
        
        // Max width for text wrapping (as percentage of canvas width, default 60%)
        this.maxWidth = options.maxWidth !== undefined ? options.maxWidth : 0.6;
        
        // Padding from left edge (as percentage of canvas width, default 5%)
        this.leftPadding = options.leftPadding !== undefined ? options.leftPadding : 0.05;
        
        // Line height multiplier (1.0 = no extra spacing, 1.2 = 20% extra spacing)
        this.lineHeight = options.lineHeight !== undefined ? options.lineHeight : 1.0;
        
        // Font size (viewport height units, e.g., '10vh')
        this.fontSize = options.fontSize !== undefined ? options.fontSize : '10vh';
        
        // Vertical position (0.0 = top, 0.5 = center, 1.0 = bottom)
        // This determines where the text is rendered vertically in the texture
        this.verticalPosition = 0.5; // Default to center
        
        // Canvas size will be set dynamically to match rendering canvas
        // Initialize with a default size (will be updated on first resize)
        // Use common 16:9 aspect ratio as default
        this.canvas.width = 1920;  // Default, will be updated
        this.canvas.height = 1080; // Default, will be updated
        
        // Hide canvas (used only for texture generation, not visible)
        this.canvas.style.display = 'none';
        
        this.createTexture();
        this.fontLoadPromise = this.loadFont();
    }
    
    async loadFont() {
        // Wait for fonts to be loaded before rendering
        try {
            await document.fonts.ready;
            
            // Check if Montserrat font is loaded (Google Fonts)
            const fontFamily = 'Montserrat';
            if (document.fonts.check(`12px ${fontFamily}`)) {
                console.log('TitleTexture: Font loaded:', fontFamily);
                this.fontLoaded = true;
            } else {
                // Wait a bit for Google Fonts to load
                await new Promise(resolve => setTimeout(resolve, 500));
                // Check again after delay
                if (document.fonts.check(`12px ${fontFamily}`)) {
                    this.fontLoaded = true;
                    console.log('TitleTexture: Font available after delay');
                } else {
                    // Final fallback: mark as loaded anyway (will use fallback fonts)
                    this.fontLoaded = true;
                    console.log('TitleTexture: Using fallback fonts');
                }
            }
            
            // Ensure font is actually ready by testing rendering
            await this.ensureFontReady();
            
            // If we have a pending title, render it now with loaded fonts
            if (this.currentTitle) {
                await this.renderTitle(this.currentTitle);
                this.uploadToTexture();
            }
        } catch (err) {
            console.warn('TitleTexture: Font loading error:', err);
            this.fontLoaded = true; // Continue anyway
        }
    }
    
    async ensureFontReady() {
        // Force font to be ready by doing a test render
        const testText = 'A';
        const testFont = 'Montserrat';
        this.ctx.font = `12px ${testFont}`;
        this.ctx.fillText(testText, 0, 0);
        // Small delay to ensure font is applied
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    createTexture() {
        const gl = this.gl;
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        
        // Initialize with empty texture
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.canvas.width, this.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    
    async updateTitle(title) {
        if (!title) {
            title = '';
        }
        
        if (this.currentTitle === title && !this.needsUpdate) {
            return;
        }
        
        console.log('TitleTexture: Updating title to:', title);
        this.currentTitle = title;
        
        // Wait for fonts to be loaded before rendering
        if (!this.fontLoaded && this.fontLoadPromise) {
            await this.fontLoadPromise;
        }
        
        // Ensure fonts are ready
        if (!this.fontLoaded) {
            await this.ensureFontReady();
            this.fontLoaded = true;
        }
        
        // Render with loaded fonts
        await this.renderTitle(title);
        this.uploadToTexture();
    }
    
    /**
     * Wrap text into lines that fit within maxWidth
     */
    wrapText(ctx, text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = words[0] || '';

        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const testLine = currentLine + ' ' + word;
            const metrics = ctx.measureText(testLine);
            
            if (metrics.width > maxWidth && currentLine.length > 0) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        
        if (currentLine.length > 0) {
            lines.push(currentLine);
        }
        
        return lines;
    }

    async renderTitle(title) {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        if (!title || title.trim() === '') {
            console.log('TitleTexture: Empty title, clearing texture');
            this.needsUpdate = false;
            return;
        }
        
        console.log('TitleTexture: Rendering title:', title, 'on canvas', width, 'x', height);
        console.log('TitleTexture: Font loaded:', this.fontLoaded);
        
        // Set up text styling (wide, large, subtle)
        // Use Humane font (MangoGrotesque) - Light weight for subtle appearance
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'; // Increased opacity for better visibility
        
        // Use Montserrat font with fallbacks
        const fontFamily = this.fontLoaded 
            ? 'Montserrat, sans-serif'
            : 'Montserrat, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        
        // Set font - Montserrat supports weights 100-900 and italic style
        // Montserrat is not a variable font, so we use static weights
        // Available weights: 100 (Thin), 200 (ExtraLight), 300 (Light), 400 (Regular),
        //                    500 (Medium), 600 (SemiBold), 700 (Bold), 800 (ExtraBold), 900 (Black)
        const fontWeight = 900; // Black weight - adjust as needed (100-900)
        const fontStyle = 'normal'; // Use 'italic' for slanted, 'normal' for upright
        
        // Use Montserrat with specified weight and style
        // Font string format: "weight style size family" (not "style weight size family")
        ctx.font = `${fontWeight} ${fontStyle} ${this.fontSize} ${fontFamily}`;

        // Left-align text
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        // Verify font is actually being used
        const actualFont = ctx.font;
        console.log('TitleTexture: Actual font being used:', actualFont);
        
        // Apply text transformation based on setting
        let text = title;
        switch (this.textTransform) {
            case 'uppercase':
                text = title.toUpperCase();
                break;
            case 'lowercase':
                text = title.toLowerCase();
                break;
            case 'title':
                // Title case: capitalize first letter of each word
                text = title.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
                break;
            case 'original':
            default:
                text = title; // Keep original case
                break;
        }
        
        // Calculate max width and starting position
        const maxWidthPixels = width * this.maxWidth;
        const leftPaddingPixels = width * this.leftPadding;
        // Use verticalPosition to determine where to render (0.0 = top, 0.5 = center, 1.0 = bottom)
        const startY = height * this.verticalPosition;
        
        // Wrap text into lines
        const lines = this.wrapText(ctx, text, maxWidthPixels);
        
        // Calculate line height from font metrics
        const textMetrics = ctx.measureText('M'); // Use 'M' to get typical line height
        const lineHeight = textMetrics.fontBoundingBoxAscent + textMetrics.fontBoundingBoxDescent;
        const lineSpacing = lineHeight * this.lineHeight * 0.8; // Apply configurable line height multiplier
        
        // Calculate total text height (including first line height + spacing for additional lines)
        // For single line: just lineHeight
        // For multiple lines: lineHeight + (lines.length - 1) * lineSpacing
        const totalHeight = lines.length === 1 
            ? lineHeight 
            : lineHeight + (lines.length - 1) * lineSpacing;
        
        // Calculate starting Y position based on verticalPosition
        // verticalPosition: 0.0 = top, 0.5 = center, 1.0 = bottom
        // Since textBaseline = 'top', we need to adjust:
        // - For center (0.5): startY - totalHeight/2
        // - For bottom (1.0): startY - totalHeight (position is where bottom should be)
        let startYCentered;
        if (this.verticalPosition === 0.5) {
            // Center: use the original centering logic
            startYCentered = startY - totalHeight / 2;
        } else if (this.verticalPosition > 0.5) {
            // For bottom positions: verticalPosition is where bottom should be
            // Since textBaseline = 'top', subtract total height
            // Interpolate: at 0.5 we subtract totalHeight/2, at 1.0 we subtract totalHeight
            const centerOffset = totalHeight / 2;
            const bottomOffset = totalHeight;
            const t = (this.verticalPosition - 0.5) * 2.0; // 0 at 0.5, 1 at 1.0
            const offset = centerOffset + (bottomOffset - centerOffset) * t;
            startYCentered = startY - offset;
        } else {
            // For top positions: verticalPosition is where top should be
            startYCentered = startY;
        }
        
        console.log('TitleTexture: Text metrics:', {
            lines: lines.length,
            maxWidthPixels: maxWidthPixels,
            lineHeight: lineHeight,
            totalHeight: totalHeight
        });
        
        // Draw each line with subtle glow effect
        ctx.shadowBlur = 30;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.2)';
        
        lines.forEach((line, index) => {
            const y = startYCentered + index * lineSpacing;
            ctx.fillText(line, leftPaddingPixels, y);
        });
        
        ctx.shadowBlur = 0;
        
        // Draw main text (without shadow for cleaner look)
        lines.forEach((line, index) => {
            const y = startYCentered + index * lineSpacing;
            ctx.fillText(line, leftPaddingPixels, y);
        });
        
        this.needsUpdate = false;
    }
    
    uploadToTexture() {
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    }
    
    getTexture() {
        return this.texture;
    }
    
    bindTexture(unit = 0) {
        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        return unit;
    }
    
    getSize() {
        return {
            width: this.canvas.width,
            height: this.canvas.height
        };
    }
    
    /**
     * Set the vertical position where text should be rendered in the texture
     * @param {number} position - Vertical position (0.0 = top, 0.5 = center, 1.0 = bottom)
     */
    /**
     * Set the font size for text rendering
     * @param {string} fontSize - Font size (e.g., '10vh', '8vh', '5vh')
     */
    async setFontSize(fontSize) {
        if (this.fontSize === fontSize && !this.needsUpdate) {
            return; // No change needed
        }
        
        this.fontSize = fontSize;
        this.needsUpdate = true;
        
        // Re-render title if we have one
        if (this.currentTitle) {
            if (!this.fontLoaded && this.fontLoadPromise) {
                await this.fontLoadPromise;
            }
            await this.renderTitle(this.currentTitle);
            this.uploadToTexture();
        }
    }
    
    async setVerticalPosition(position) {
        // Always update if position is different, or if we need an update
        // Remove the early return check to ensure updates happen
        const positionChanged = this.verticalPosition !== position;
        this.verticalPosition = position;
        this.needsUpdate = true; // Force update
        
        // Re-render title if we have one
        if (this.currentTitle) {
            if (!this.fontLoaded && this.fontLoadPromise) {
                await this.fontLoadPromise;
            }
            await this.renderTitle(this.currentTitle);
            this.uploadToTexture();
        }
    }
    
    /**
     * Resize the title texture canvas to match the rendering canvas
     * @param {number} width - Canvas width
     * @param {number} height - Canvas height
     */
    async resize(width, height) {
        if (this.canvas.width === width && this.canvas.height === height) {
            return; // No change needed
        }
        
        console.log(`TitleTexture: Resizing from ${this.canvas.width}x${this.canvas.height} to ${width}x${height}`);
        
        this.canvas.width = width;
        this.canvas.height = height;
        
        // Recreate texture with new size
        this.createTexture();
        
        // Re-render title if we have one (wait for fonts if needed)
        if (this.currentTitle) {
            if (!this.fontLoaded && this.fontLoadPromise) {
                await this.fontLoadPromise;
            }
            this.needsUpdate = true;
            await this.updateTitle(this.currentTitle);
        }
    }
    
    /**
     * Ensure the texture is ready (fonts loaded, texture uploaded)
     * Call this if you need to guarantee the texture is ready before use
     */
    async ensureReady() {
        if (!this.fontLoaded && this.fontLoadPromise) {
            await this.fontLoadPromise;
        }
        
        // If we have a title but haven't rendered it yet, render it now
        if (this.currentTitle && this.needsUpdate) {
            await this.updateTitle(this.currentTitle);
        }
    }
}

