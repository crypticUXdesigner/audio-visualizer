// Text Rendering Module
// Handles text rendering logic, font loading, text wrapping, and layout calculations

import { ShaderLogger } from '../../shaders/utils/ShaderLogger.js';

interface TextRendererOptions {
    textTransform?: 'original' | 'uppercase' | 'lowercase' | 'title';
    maxWidth?: number;
    leftPadding?: number;
    lineHeight?: number;
    fontSize?: string;
}

export class TextRenderer {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    fontLoaded: boolean = false;
    fontLoadPromise: Promise<void> | null = null;
    textTransform: 'original' | 'uppercase' | 'lowercase' | 'title';
    maxWidth: number;
    leftPadding: number;
    lineHeight: number;
    fontSize: string;
    verticalPosition: number = 0.5;
    
    constructor(canvas: HTMLCanvasElement, options: TextRendererOptions = {}) {
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to get 2D rendering context');
        }
        this.ctx = ctx;
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
        this.verticalPosition = 0.5; // Default to center
        
        this.fontLoadPromise = this.loadFont();
    }
    
    async loadFont(): Promise<void> {
        // Wait for fonts to be loaded before rendering
        try {
            await document.fonts.ready;
            
            // Check if Montserrat font is loaded (Google Fonts)
            const fontFamily = 'Montserrat';
            if (document.fonts.check(`12px ${fontFamily}`)) {
                ShaderLogger.debug(`TextRenderer: Font loaded: ${fontFamily}`);
                this.fontLoaded = true;
            } else {
                // Wait a bit for Google Fonts to load
                await new Promise(resolve => setTimeout(resolve, 500));
                // Check again after delay
                if (document.fonts.check(`12px ${fontFamily}`)) {
                    this.fontLoaded = true;
                    ShaderLogger.debug('TextRenderer: Font available after delay');
                } else {
                    // Final fallback: mark as loaded anyway (will use fallback fonts)
                    this.fontLoaded = true;
                    ShaderLogger.debug('TextRenderer: Using fallback fonts');
                }
            }
            
            // Ensure font is actually ready by testing rendering
            await this.ensureFontReady();
        } catch (err) {
            ShaderLogger.warn('TextRenderer: Font loading error:', err);
            this.fontLoaded = true; // Continue anyway
        }
    }
    
    async ensureFontReady(): Promise<void> {
        // Force font to be ready by doing a test render
        const testText = 'A';
        const testFont = 'Montserrat';
        this.ctx.font = `12px ${testFont}`;
        this.ctx.fillText(testText, 0, 0);
        // Small delay to ensure font is applied
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    /**
     * Wrap text into lines that fit within maxWidth
     */
    wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
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
    
    /**
     * Render text to canvas
     * @param title - Text to render
     */
    async renderTitle(title: string): Promise<void> {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        if (!title || title.trim() === '') {
            return;
        }
        
        ShaderLogger.debug(`TextRenderer: Rendering title: "${title}" on canvas ${width}x${height}`);
        
        // Set up text styling (wide, large, subtle)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'; // Increased opacity for better visibility
        
        // Use Montserrat font with fallbacks
        const fontFamily = this.fontLoaded 
            ? 'Montserrat, sans-serif'
            : 'Montserrat, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        
        // Set font - Montserrat supports weights 100-900 and italic style
        const fontWeight = 900; // Black weight
        const fontStyle = 'normal';
        
        ctx.font = `${fontWeight} ${fontStyle} ${this.fontSize} ${fontFamily}`;

        // Left-align text
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        // Verify font is actually being used
        ShaderLogger.debug(`TextRenderer: Using font: ${ctx.font}`);
        
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
        const startY = height * this.verticalPosition;
        
        // Wrap text into lines
        const lines = this.wrapText(ctx, text, maxWidthPixels);
        
        // Calculate line height from font metrics
        const textMetrics = ctx.measureText('M');
        const lineHeight = textMetrics.fontBoundingBoxAscent + textMetrics.fontBoundingBoxDescent;
        const lineSpacing = lineHeight * this.lineHeight * 0.8;
        
        // Calculate total text height
        const totalHeight = lines.length === 1 
            ? lineHeight 
            : lineHeight + (lines.length - 1) * lineSpacing;
        
        // Calculate starting Y position based on verticalPosition
        let startYCentered;
        if (this.verticalPosition === 0.5) {
            startYCentered = startY - totalHeight / 2;
        } else if (this.verticalPosition > 0.5) {
            const centerOffset = totalHeight / 2;
            const bottomOffset = totalHeight;
            const t = (this.verticalPosition - 0.5) * 2.0;
            const offset = centerOffset + (bottomOffset - centerOffset) * t;
            startYCentered = startY - offset;
        } else {
            startYCentered = startY;
        }
        
        ShaderLogger.debug(`TextRenderer: Text metrics - ${lines.length} lines, ${maxWidthPixels.toFixed(0)}px max width, ${lineHeight.toFixed(1)}px line height`);
        
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
    }
    
    async setFontSize(fontSize: string): Promise<void> {
        this.fontSize = fontSize;
    }
    
    setVerticalPosition(position: number): void {
        this.verticalPosition = position;
    }
}

