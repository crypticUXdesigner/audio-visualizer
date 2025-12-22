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

// Worley/Cellular Noise
float worleyNoise(vec2 uv, float t, float scale) {
    vec2 cell = floor(uv * scale);
    vec2 pos = fract(uv * scale);
    
    float minDist = 1.0;
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 point = neighbor + hash22(cell + neighbor) + vec2(sin(t * 0.5), cos(t * 0.5)) * 0.1;
            float dist = length(pos - point);
            minDist = min(minDist, dist);
        }
    }
    return minDist;
}

// Ridged/Turbulence Noise
float ridgedNoise(vec2 uv, float t, float scale, int octaves, float lacunarity, float gain) {
    vec3 p = vec3(uv * scale, t);
    float amp = 1.0;
    float freq = 1.0;
    float sum = 0.0;
    
    for (int i = 0; i < 6; ++i) {
        if (i >= octaves) break;
        float n = abs(vnoise(p * freq));
        sum += amp * (1.0 - n); // Invert for ridges
        freq *= lacunarity;
        amp *= gain;
    }
    return sum * 0.5 + 0.5;
}

// Billow Noise
float billowNoise(vec2 uv, float t, float scale, int octaves, float lacunarity, float gain) {
    vec3 p = vec3(uv * scale, t);
    float amp = 1.0;
    float freq = 1.0;
    float sum = 0.0;
    
    for (int i = 0; i < 6; ++i) {
        if (i >= octaves) break;
        float n = abs(vnoise(p * freq));
        sum += amp * n;
        freq *= lacunarity;
        amp *= gain;
    }
    return sum * 0.5 + 0.5;
}

// Flow Field / Curl Noise (returns vector field)
vec2 curlNoise(vec2 uv, float t, float scale) {
    vec2 p = uv * scale;
    float n1 = vnoise(vec3(p, t * 0.3));
    float n2 = vnoise(vec3(p + vec2(5.2, 1.3), t * 0.3));
    return vec2(n1, n2);
}

// Flow Field Noise (scalar output from curl)
float flowFieldNoise(vec2 uv, float t, float scale) {
    vec2 flow = curlNoise(uv, t, scale);
    return length(flow) * 0.5 + 0.5;
}

// Wave Noise / Wave Interference
float waveNoise(vec2 uv, float t, float scale) {
    vec2 p = uv * scale;
    float wave1 = sin(p.x * 3.14159 + t * 0.5);
    float wave2 = sin(p.y * 3.14159 + t * 0.7);
    float wave3 = sin((p.x + p.y) * 2.0 * 3.14159 + t * 0.3);
    float noise = vnoise(vec3(p * 0.5, t * 0.2)) * 0.3;
    return (wave1 + wave2 + wave3) * 0.33 + noise;
}

// IQ Noise (Improved noise with better quality)
float iqNoise(vec2 uv, float t, float scale, int octaves, float lacunarity, float gain) {
    vec3 p = vec3(uv * scale, t);
    float amp = 1.0;
    float freq = 1.0;
    float sum = 0.0;
    float maxSum = 0.0;
    
    for (int i = 0; i < 6; ++i) {
        if (i >= octaves) break;
        // Use smoother interpolation
        vec3 ip = floor(p * freq);
        vec3 fp = fract(p * freq);
        fp = fp * fp * (3.0 - 2.0 * fp); // smoothstep
        
        float n = vnoise(ip + fp);
        sum += amp * n;
        maxSum += amp;
        freq *= lacunarity;
        amp *= gain;
    }
    
    return (sum / maxSum) * 0.5 + 0.5;
}

// Reaction-Diffusion inspired pattern
float reactionDiffusionNoise(vec2 uv, float t, float scale) {
    vec2 p = uv * scale;
    float n1 = vnoise(vec3(p, t * 0.1));
    float n2 = vnoise(vec3(p * 2.0, t * 0.15));
    float n3 = vnoise(vec3(p * 4.0, t * 0.2));
    
    // Combine with reaction-diffusion like behavior
    float reaction = sin(n1 * 3.14159) * 0.5 + 0.5;
    float diffusion = (n2 + n3) * 0.5;
    return mix(reaction, diffusion, 0.5);
}

// Lattice-based noise with different interpolation
float latticeNoise(vec2 uv, float t, float scale) {
    vec2 p = uv * scale;
    vec2 ip = floor(p);
    vec2 fp = fract(p);
    
    // Use different interpolation method
    fp = fp * fp * fp * (fp * (fp * 6.0 - 15.0) + 10.0); // smootherstep
    
    float n00 = hash11(dot(ip + vec2(0.0, 0.0), vec2(1.0, 57.0)) + t);
    float n10 = hash11(dot(ip + vec2(1.0, 0.0), vec2(1.0, 57.0)) + t);
    float n01 = hash11(dot(ip + vec2(0.0, 1.0), vec2(1.0, 57.0)) + t);
    float n11 = hash11(dot(ip + vec2(1.0, 1.0), vec2(1.0, 57.0)) + t);
    
    float x0 = mix(n00, n10, fp.x);
    float x1 = mix(n01, n11, fp.x);
    return mix(x0, x1, fp.y);
}

