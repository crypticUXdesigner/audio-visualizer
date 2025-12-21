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

