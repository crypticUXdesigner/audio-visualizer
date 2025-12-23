// Ripple Effect Functions
// Shared ripple rendering utilities

// Function to create a ripple at a specific position
// Creates an expanding ring like a water drop - bright ring at wave front, fading on both sides
float createRipple(
    vec2 uv,
    vec2 center,
    float beatTime,
    float intensity,
    float speed,
    float width,
    float minRadius,
    float maxRadius
) {
    // Allow beatTime == 0.0 (immediate beat detection) and up to 2.0 seconds
    if (beatTime < 0.0 || beatTime > 2.0 || intensity <= 0.0) return 0.0;
    
    float dist = length(uv - center);
    
    // Calculate target radius based on intensity (loudness)
    // Stronger beats create larger rings, weaker beats create smaller rings
    float targetRadius = minRadius + (maxRadius - minRadius) * intensity;
    
    // Calculate expanding wave radius - speed controls how fast it travels to target size
    float radiusRange = targetRadius - minRadius;
    float distanceTraveled = beatTime * speed;
    float waveRadius = minRadius + min(distanceTraveled, radiusRange);
    
    // Calculate movement duration - when the ring stops expanding
    float movementDuration = radiusRange / speed;
    
    // Distance from the wave front (the expanding ring)
    float distFromRing = abs(dist - waveRadius);
    
    // Create expanding ring: brightest at the wave front, fading on both sides
    float ripple = exp(-distFromRing / width);
    
    // Fade out synchronized with movement
    float normalizedTime = beatTime / movementDuration;
    normalizedTime = min(normalizedTime, 1.0);
    
    // Cubic fade: starts slow, then accelerates to 0.0
    float fade = pow(1.0 - normalizedTime, 3.0);
    
    // Ensure fade is 0 when movement has stopped
    if (beatTime >= movementDuration) {
        fade = 0.0;
    }
    
    return ripple * fade * intensity;
}

// Render all active ripples and return combined intensity
// Handles default parameter fallbacks and stereo scaling
float renderAllRipples(vec2 uv, float aspectRatio, int rippleCountParam) {
    float beatRipple = 0.0;
    float rippleSpeed = uRippleSpeed > 0.0 ? uRippleSpeed : 0.5;
    float defaultRippleWidth = uRippleWidth > 0.0 ? uRippleWidth : 0.1;
    float defaultRippleMinRadius = uRippleMinRadius >= 0.0 ? uRippleMinRadius : 0.0;
    float defaultRippleMaxRadius = uRippleMaxRadius > 0.0 ? uRippleMaxRadius : 1.5;
    float defaultRippleIntensityMultiplier = uRippleIntensity >= 0.0 ? uRippleIntensity : 0.4;
    float stereoScale = aspectRatio * 0.5;
    int maxRipplesInt = 16;
    int clampedRippleCount;
    
    if (rippleCountParam < maxRipplesInt) {
        clampedRippleCount = rippleCountParam;
    } else {
        clampedRippleCount = maxRipplesInt;
    }
    
    for (int i = 0; i < 16; i++) {
        if (i >= clampedRippleCount) break;
        if (uRippleActive[i] > 0.5 && uRippleIntensities[i] > 0.0) {
            vec2 rippleCenter = vec2(uRippleCenterX[i] * stereoScale, uRippleCenterY[i]);
            float rippleAge = uRippleTimes[i];
            float rippleIntensity = uRippleIntensities[i];
            float rippleWidth = uRippleWidths[i] > 0.0 ? uRippleWidths[i] : defaultRippleWidth;
            float rippleMinRadius = uRippleMinRadii[i] >= 0.0 ? uRippleMinRadii[i] : defaultRippleMinRadius;
            float rippleMaxRadius = uRippleMaxRadii[i] > 0.0 ? uRippleMaxRadii[i] : defaultRippleMaxRadius;
            float rippleIntensityMultiplier = uRippleIntensityMultipliers[i] > 0.0 ? uRippleIntensityMultipliers[i] : defaultRippleIntensityMultiplier;
            float ripple = createRipple(uv, rippleCenter, rippleAge, rippleIntensity, rippleSpeed, rippleWidth, rippleMinRadius, rippleMaxRadius);
            beatRipple += ripple * rippleIntensityMultiplier;
        }
    }
    
    return beatRipple;
}

