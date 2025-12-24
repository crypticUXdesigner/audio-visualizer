// UniformLocationCache - Manages uniform location caching for shaders
// Dynamically discovers and caches uniform locations from compiled shader programs

interface UniformLocations {
    [key: string]: WebGLUniformLocation | null;
}

interface AttributeLocations {
    [key: string]: number;
}

export class UniformLocationCache {
    gl: WebGLRenderingContext;
    program: WebGLProgram;
    locations: UniformLocations;
    attributeLocations: AttributeLocations;
    
    /**
     * @param gl - WebGL context
     * @param program - Compiled shader program
     */
    constructor(gl: WebGLRenderingContext, program: WebGLProgram) {
        this.gl = gl;
        this.program = program;
        this.locations = {};
        this.attributeLocations = {};
    }
    
    /**
     * Cache a uniform location
     * @param name - Uniform name
     * @returns The uniform location
     */
    getUniformLocation(name: string): WebGLUniformLocation | null {
        if (!(name in this.locations)) {
            this.locations[name] = this.gl.getUniformLocation(this.program, name);
        }
        return this.locations[name];
    }
    
    /**
     * Cache an attribute location
     * @param name - Attribute name
     * @returns The attribute location
     */
    getAttributeLocation(name: string): number {
        if (!(name in this.attributeLocations)) {
            this.attributeLocations[name] = this.gl.getAttribLocation(this.program, name);
        }
        return this.attributeLocations[name];
    }
    
    /**
     * Cache multiple uniform locations at once
     * @param names - Array of uniform names
     * @returns Map of uniform names to locations
     */
    cacheUniforms(names: string[]): UniformLocations {
        const result: UniformLocations = {};
        names.forEach(name => {
            result[name] = this.getUniformLocation(name);
        });
        return result;
    }
    
    /**
     * Discover all active uniforms from the shader program
     * Automatically finds uniforms declared in the shader code
     * @returns Map of discovered uniform names to locations
     */
    discoverUniforms(): UniformLocations {
        const gl = this.gl;
        const program = this.program;
        
        // Get active uniform count
        const activeUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
        
        for (let i = 0; i < activeUniforms; i++) {
            const info = gl.getActiveUniform(program, i);
            if (info) {
                // Remove array suffix if present (e.g., "uArray[0]" -> "uArray")
                const name = info.name.replace(/\[0\]$/, '');
                this.getUniformLocation(name);
            }
        }
        
        return this.locations;
    }
    
    /**
     * Cache all standard uniforms (commonly used across shaders)
     * @returns Map of standard uniform names to locations
     */
    cacheStandardUniforms(): UniformLocations {
        const standardUniforms = [
            'uResolution', 'uTime', 'uTimeOffset', 'uPixelSize', 'uDevicePixelRatio',
            'uSteps', 'uMouse', 'uShapeType',
            'uDitherStrength', 'uTransitionWidth',
            // Colors
            'uColor', 'uColor2', 'uColor3', 'uColor4', 'uColor5',
            'uColor6', 'uColor7', 'uColor8', 'uColor9', 'uColor10',
            // Audio
            'uBass', 'uMid', 'uTreble', 'uVolume',
            // Frequency bands
            'uFreq1', 'uFreq2', 'uFreq3', 'uFreq4', 'uFreq5',
            'uFreq6', 'uFreq7', 'uFreq8', 'uFreq9', 'uFreq10',
            // Stereo
            'uBassStereo', 'uMidStereo', 'uTrebleStereo',
            // Temporal and beat
            'uSmoothedBass', 'uSmoothedMid', 'uSmoothedTreble',
            'uPeakBass', 'uBeatTime', 'uBeatIntensity', 'uBPM',
            // Multi-frequency beat
            'uBeatTimeBass', 'uBeatTimeMid', 'uBeatTimeTreble',
            'uBeatIntensityBass', 'uBeatIntensityMid', 'uBeatIntensityTreble',
            'uBeatStereoBass', 'uBeatStereoMid', 'uBeatStereoTreble',
            // Ripple effect parameters
            'uRippleSpeed', 'uRippleWidth', 'uRippleMinRadius', 'uRippleMaxRadius',
            'uRippleIntensityThreshold', 'uRippleIntensity',
            // Multiple ripple arrays
            'uRippleCenterX', 'uRippleCenterY', 'uRippleTimes', 'uRippleIntensities',
            'uRippleWidths', 'uRippleMinRadii', 'uRippleMaxRadii',
            'uRippleIntensityMultipliers', 'uRippleActive', 'uRippleCount',
            // Threshold uniforms
            'uThreshold1', 'uThreshold2', 'uThreshold3', 'uThreshold4', 'uThreshold5',
            'uThreshold6', 'uThreshold7', 'uThreshold8', 'uThreshold9', 'uThreshold10',
            // Frequency visualizer uniforms
            'uMode', 'uNumBands', 'uMeasuredBands', 'uMaxHeight', 'uCenterY',
            'uBarWidth', 'uBlurStrength', 'uPixelizeLevels', 'uPostBlurStrength',
            'uNoiseStrength', 'uFrequencyTexture', 'uHeightTexture',
            // Refraction shader uniforms
            'uOuterGridSize', 'uInnerGridSize', 'uOffsetStrength',
            'uCellBrightnessVariation', 'uCellAnimNote1', 'uCellAnimNote2', 'uCellAnimNote3',
            'uDistortionStrength', 'uDistortionSize', 'uDistortionFalloff',
            'uDistortionPerspectiveStrength', 'uDistortionEasing',
            'uSmoothedVolumeScale', 'uSmoothedFbmZoom',
            // Arc shader uniforms
            'uBaseRadius', 'uMaxRadiusOffset', 'uCenterX',
            'uLayer1Texture', 'uLayer2Texture', 'uLayer3Texture',
            'uLayer1HeightMultiplier', 'uLayer2HeightMultiplier', 'uLayer3HeightMultiplier',
            'uLayer1Opacity', 'uLayer2Opacity', 'uLayer3Opacity',
            // Strings shader uniforms
            'uMinStringWidth', 'uMaxStringWidth', 'uMaxAmplitude', 'uWaveNote',
            'uStringTop', 'uStringBottom', 'uPaddingLeft', 'uPaddingRight',
            'uStringEndFadeMinAlpha', 'uWaveCycles', 'uShowBars', 'uShowStrings',
            'uWaveAmplitude', 'uMaxStrings', 'uThreshold2Strings', 'uThreshold3Strings',
            'uBandMinHeight', 'uBandMaxHeight',
            'uBandHeightCurveX1', 'uBandHeightCurveY1', 'uBandHeightCurveX2', 'uBandHeightCurveY2',
            'uStringHeightMultiplier',
            'uBackgroundNoiseScale', 'uBackgroundNoiseIntensity', 'uBackgroundNoiseTimeSpeed',
            'uBackgroundNoiseTimeOffset', 'uBackgroundNoiseAudioReactive', 'uBackgroundNoiseAudioSource',
            'uBackgroundNoiseBrightnessCurveX1', 'uBackgroundNoiseBrightnessCurveY1',
            'uBackgroundNoiseBrightnessCurveX2', 'uBackgroundNoiseBrightnessCurveY2',
            'uBackgroundNoiseBrightnessMin', 'uBackgroundNoiseBrightnessMax',
            'uSmoothedNoiseAudioLevel', 'uSmoothedContrastAudioLevel',
            'uColorTransitionWidth', 'uBarAlphaMin', 'uBarAlphaMax',
            'uBandWidthThreshold', 'uBandWidthMinMultiplier', 'uBandWidthMaxMultiplier',
            'uContrast', 'uContrastAudioReactive', 'uContrastAudioSource',
            'uContrastMin', 'uContrastMax', 'uGlowRadius',
            'uMaskExpansion', 'uMaskCutoutIntensity', 'uMaskFeathering',
            'uMaskNoiseStrength', 'uMaskNoiseScale', 'uMaskNoiseSpeed',
            'uMaskAlphaCurveX1', 'uMaskAlphaCurveY1', 'uMaskAlphaCurveX2', 'uMaskAlphaCurveY2',
            // Glitch effect uniforms
            'uGlitchColumnCount', 'uGlitchRandomSeed', 'uGlitchFlipProbability',
            'uGlitchIntensity', 'uGlitchBlurAmount', 'uGlitchPixelSize'
        ];
        
        return this.cacheUniforms(standardUniforms);
    }
    
    /**
     * Cache standard attributes
     * @returns Map of attribute names to locations
     */
    cacheStandardAttributes(): AttributeLocations {
        return {
            a_position: this.getAttributeLocation('a_position')
        };
    }
    
    /**
     * Get all cached uniform locations
     * @returns Map of uniform names to locations
     */
    getAllUniformLocations(): UniformLocations {
        return { ...this.locations };
    }
    
    /**
     * Get all cached attribute locations
     * @returns Map of attribute names to locations
     */
    getAllAttributeLocations(): AttributeLocations {
        return { ...this.attributeLocations };
    }
    
    /**
     * Set default threshold values (for color mapping)
     * @param thresholds - Array of 10 threshold values
     */
    setDefaultThresholds(thresholds: number[]): void {
        const gl = this.gl;
        gl.useProgram(this.program);
        thresholds.forEach((threshold, index) => {
            const uniformName = `uThreshold${index + 1}`;
            const location = this.getUniformLocation(uniformName);
            if (location) {
                gl.uniform1f(location, threshold);
            }
        });
    }
}

