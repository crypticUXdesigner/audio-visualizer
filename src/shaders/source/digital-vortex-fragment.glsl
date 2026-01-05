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
    vec3 FC = gl_FragCoord.xyz;
    vec2 r = uResolution;
    float t = uTime;
    
    vec4 o = vec4(0.0);
    float z = fract(dot(FC, sin(FC)));
    
    float d = 1.0; // Initialize to avoid division by zero
    for(float i = 0.0; i < 100.0; i++) {
        o += (sin(z - t + vec4(6.0, 2.0, 4.0, 0.0)) + 1.5) / d;
        vec3 p = z * normalize(FC.rgb * 2.0 - r.xyy);
        p.z += 6.0;
        // GLSL ES 1.0: Calculate j from iteration count (j = 1.0 * 1.25^iter)
        for(float iter = 0.0; iter < 10.0; iter++) {
            float j = 1.0 * pow(1.25, iter);
            if (j >= 9.0) break;
            p += cos(ceil(p.yzx * j - t)) / j;
        }
        d = 0.002 + abs(length(p) - 0.5) / 40.0;
        z += d;
    }
    
    // Apply tanh component-wise (GLSL ES 1.0 tanh only works on scalars)
    o = vec4(tanh(o.x / 7e3), tanh(o.y / 7e3), tanh(o.z / 7e3), tanh(o.w / 7e3));
    
    gl_FragColor = o;
}

