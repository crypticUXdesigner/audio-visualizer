precision highp float;

#include "common/uniforms.glsl"
#include "common/screen-adaptation.glsl"
#include "common/rotation.glsl"

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
    
    float z = 0.0;
    float d = 1.0; // Initialize to avoid division by zero
    for(float i = 0.0; i < 60.0; i++) {
        o += (sin(z * 0.5 + vec4(6.0, 1.0, 2.0, 0.0)) + 1.1) / d;
        vec3 p = z * normalize(FC.rgb * 2.0 - r.xyy);
        p.z += 6.0;
        p.xy *= rotate2D(p.z * 0.4);
        // GLSL ES 1.0: Calculate j from iteration count (j = 2.0 * (1.0/0.6)^iter)
        for(float iter = 0.0; iter < 10.0; iter++) {
            float j = 2.0 * pow(1.66666666667, iter);
            if (j >= 15.0) break;
            p += cos((p.yzx + t * 3.0) * j) / j;
        }
        d = 0.02 + abs(min(length(p.xy) - 3.0, 4.0 - length(p))) / 8.0;
        z += d;
    }
    
    // Apply tanh component-wise (GLSL ES 1.0 tanh only works on scalars)
    o = vec4(tanh(o.x / 15e2), tanh(o.y / 15e2), tanh(o.z / 15e2), tanh(o.w / 15e2));
    
    gl_FragColor = o;
}

