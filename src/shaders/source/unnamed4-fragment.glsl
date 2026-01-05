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
    
    float z = 0.0;
    float d = 1.0; // Initialize to avoid division by zero
    float n = 0.0;
    for(float i = 0.0; i < 100.0; i++) {
        o += (cos(t + vec4(0.0, 2.0, 4.0, 0.0)) + 9.0 - n * 8.0) / d / d;
        vec3 p = z * normalize(FC.rgb * 2.0 - r.xyy);
        p.z += 7.0;
        n = fract(0.3 * t + pow(fract(d * 1e2), 0.1));
        p.y += n * (n + n - 3.0) / 0.1 + 9.0;
        d = length(p);
        d = 0.3 * length(vec3(d * 0.3 - n * n * n, cos(n + atan(vec2(p.z, d), p.xy) * mat2(4.0, -3.0, 3.0, 4.0)) * 0.3));
        z += d;
    }
    
    // Apply tanh component-wise (GLSL ES 1.0 tanh only works on scalars)
    o = vec4(tanh(o.x / 1e4), tanh(o.y / 1e4), tanh(o.z / 1e4), tanh(o.w / 1e4));
    
    gl_FragColor = o;
}

