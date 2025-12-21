// Screen Adaptation Functions
// Handles screen density, aspect ratio, and mobile-specific adjustments

// Calculate aspect ratio from resolution
float getAspectRatio() {
    return uResolution.x / uResolution.y;
}

// Check if device is in portrait mode (mobile)
bool isPortrait() {
    return getAspectRatio() < 1.0;
}

// Check if device is in landscape mode
bool isLandscape() {
    return getAspectRatio() >= 1.0;
}

// Convert pixel value to normalized screen space (accounts for DPR)
// Use this for pixel-based values like dot spacing, grid sizes
float pixelsToNormalized(float pixels) {
    // Convert pixels to normalized space (0-1 range)
    float minResolution = min(uResolution.x, uResolution.y);
    return pixels / minResolution;
}

// Convert pixel value to normalized screen space with DPR scaling
// For values that should scale with screen density
float pixelsToNormalizedDPR(float pixels) {
    float dpr = max(uDevicePixelRatio, 1.0);  // Fallback to 1.0 if not set
    float minResolution = min(uResolution.x, uResolution.y);
    return (pixels * dpr) / minResolution;
}

// Calculate adaptive value based on aspect ratio
// Useful for mobile portrait adjustments
float adaptiveValue(float portraitValue, float landscapeValue) {
    float aspectRatio = getAspectRatio();
    if (aspectRatio < 1.0) {
        // Portrait: interpolate between portrait and square (1.0)
        return mix(portraitValue, landscapeValue, aspectRatio);
    } else {
        // Landscape: use landscape value
        return landscapeValue;
    }
}

// Calculate screen-relative blur radius
// Ensures consistent blur appearance across resolutions
float calculateBlurRadius(float baseRadius, float strength) {
    // Base radius is fraction of screen (e.g., 0.01 = 1%)
    // Scale by strength and ensure minimum visibility
    float blurRadius = baseRadius * strength;
    float minBlurRadius = 0.0005;  // Minimum for visibility
    return max(blurRadius, minBlurRadius);
}

