// Noise and fBm Functions
// Shared noise generation utilities

// 1-D hash function
float hash11(float n) {
    return fract(sin(n) * 43758.5453);
}

// 2-D hash function
vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}

// 3-D value noise
float vnoise(vec3 p) {
    vec3 ip = floor(p);
    vec3 fp = fract(p);

    float n000 = hash11(dot(ip + vec3(0.0,0.0,0.0), vec3(1.0,57.0,113.0)));
    float n100 = hash11(dot(ip + vec3(1.0,0.0,0.0), vec3(1.0,57.0,113.0)));
    float n010 = hash11(dot(ip + vec3(0.0,1.0,0.0), vec3(1.0,57.0,113.0)));
    float n110 = hash11(dot(ip + vec3(1.0,1.0,0.0), vec3(1.0,57.0,113.0)));
    float n001 = hash11(dot(ip + vec3(0.0,0.0,1.0), vec3(1.0,57.0,113.0)));
    float n101 = hash11(dot(ip + vec3(1.0,0.0,1.0), vec3(1.0,57.0,113.0)));
    float n011 = hash11(dot(ip + vec3(0.0,1.0,1.0), vec3(1.0,57.0,113.0)));
    float n111 = hash11(dot(ip + vec3(1.0,1.0,1.0), vec3(1.0,57.0,113.0)));

    vec3 w = fp*fp*fp*(fp*(fp*6.0-15.0)+10.0);   // smootherstep

    float x00 = mix(n000, n100, w.x);
    float x10 = mix(n010, n110, w.x);
    float x01 = mix(n001, n101, w.x);
    float x11 = mix(n011, n111, w.x);

    float y0  = mix(x00, x10, w.y);
    float y1  = mix(x01, x11, w.y);

    return mix(y0, y1, w.z) * 2.0 - 1.0;         // [-1,1]
}

// Standard fBm (for heightmap, refraction)
// Parameters: uv, time, scale, octaves, lacunarity, gain
float fbm2_standard(vec2 uv, float t, float scale, int octaves, float lacunarity, float gain) {
    vec3 p = vec3(uv * scale, t);
    float amp = 1.0;
    float freq = 1.0;
    float sum = 0.0;

    for (int i = 0; i < 6; ++i) {  // Max 6 octaves
        if (i >= octaves) break;
        sum += amp * vnoise(p * freq);
        freq *= lacunarity;
        amp *= gain;
    }
    
    return sum * 0.5 + 0.5;   // [0,1]
}

// Domain-warped fBm (for dots shader)
// Parameters: uv, time, scale, warpStrength, octaves, lacunarity, gain
float fbm2_domainWarped(vec2 uv, float t, float scale, float warpStrength, int octaves, float lacunarity, float gain) {
    vec2 warpedUV = uv * scale;
    
    // Domain warping
    vec3 warpP1 = vec3(warpedUV * 0.7, t * 0.5);
    vec3 warpP2 = vec3(warpedUV * 0.9 + vec2(5.2, 1.3), t * 0.7);
    
    float warpX = vnoise(warpP1);
    float warpY = vnoise(warpP2);
    vec2 warp = vec2(warpX, warpY) * warpStrength;
    
    vec2 warped = warpedUV + warp;
    
    // Time-based rotation
    float rotationAngle = t * 0.15;
    float cosRot = cos(rotationAngle);
    float sinRot = sin(rotationAngle);
    vec2 rotatedUV = vec2(
        warped.x * cosRot - warped.y * sinRot,
        warped.x * sinRot + warped.y * cosRot
    );
    
    vec3 p = vec3(rotatedUV, t * 1.5);
    float amp = 1.0;
    float freq = 1.0;
    float sum = 0.0;

    for (int i = 0; i < 6; ++i) {
        if (i >= octaves) break;
        sum += amp * vnoise(p * freq);
        freq *= lacunarity;
        amp *= gain;
    }
    
    return sum * 0.5 + 0.5;   // [0,1]
}

