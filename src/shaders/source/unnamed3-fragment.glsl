precision highp float;

#include "common/uniforms.glsl"
#include "common/screen-adaptation.glsl"
#include "common/constants.glsl"

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
    float d = 0.0;
    for(float i = 0.0; i < 100.0; i++) {
        vec3 p = z * normalize(FC.rgb * 2.0 - r.xyy);
        // GLSL ES 1.0: Calculate j from iteration count (j = 1.0 * 2^iter)
        for(float iter = 0.0; iter < 10.0; iter++) {
            float j = 1.0 * pow(2.0, iter);
            if (j >= 64.0) break;
            p += 0.7 * cos(p.yzx * j + t * PI / 10.0 + j) / j;
        }
        d = 0.03 + 0.1 * abs(abs(p.y) - 1.1);
        z += d;
        o += (cos(p.y / 0.2 - vec4(0.0, 1.0, 2.0, 3.0) * 0.3) + 1.5) / d;
    }
    
    // Apply tanh component-wise (GLSL ES 1.0 tanh only works on scalars)
    o = vec4(tanh(o.x / 5e3), tanh(o.y / 5e3), tanh(o.z / 5e3), tanh(o.w / 5e3));
    
    gl_FragColor = o;
}

