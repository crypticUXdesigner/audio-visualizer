precision highp float;

#include "common/uniforms.glsl"
#include "common/screen-adaptation.glsl"

// Manual tanh implementation for GLSL ES 1.0 compatibility
// tanh(x) = (exp(2*x) - 1) / (exp(2*x) + 1)
float tanh(float x) {
    // Handle large values to prevent overflow
    if (x > 10.0) return 1.0;
    if (x < -10.0) return -1.0;
    
    float exp2x = exp(2.0 * x);
    return (exp2x - 1.0) / (exp2x + 1.0);
}

void main() {
    vec2 r = uResolution;
    float t = uTime;
    
    vec4 o = vec4(0.0);
    
    float z = 0.0;
    float d = 1.0; // Initialize to avoid division by zero
    float s = 0.0;
    for(float i = 0.0; i < 10.0; i++) {
        vec3 l = vec3(gl_FragCoord.rg * 2.0 - r, 0.0);
        vec3 p = z * normalize(l);
        // GLSL ES 1.0: Calculate j from iteration count (j = 6.0 * 2^iter)
        for(float iter = 0.0; iter < 10.0; iter++) {
            float j = 6.0 * pow(2.0, iter);
            if (j >= 200.0) break;
            p += sin(p.yzx * j - t) / j;
        }
        s = 0.3 - abs(p.y);
        d = 0.005 + abs(s) / 4.0;
        z += d;
        o += tanh(length(l) * 2.0 / r.y) * (cos(s / 0.1 + p.x / 0.2 + t - vec4(6.0, 1.0, 2.0, 3.0) - 3.0) + 1.5) / d;
    }
    
    // Apply tanh component-wise (GLSL ES 1.0 tanh only works on scalars)
    vec4 oSquared = o * o;
    o = vec4(tanh(oSquared.x / 1e6), tanh(oSquared.y / 1e6), tanh(oSquared.z / 1e6), tanh(oSquared.w / 1e6));
    
    gl_FragColor = o;
}

