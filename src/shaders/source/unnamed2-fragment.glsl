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
    
    vec2 p = (gl_FragCoord.xy * 2.0 - r) / r.y;
    vec4 temp = (sin(p.x * p.y / 0.3 + fract(cos(dot(tan(p), r)) * 4e4) - vec4(0.0, 1.0, 2.0, 0.0)) + 1.5) / abs(p.y * p.x) * 0.03;
    // Apply tanh component-wise (GLSL ES 1.0 tanh only works on scalars)
    vec4 o = vec4(tanh(temp.x), tanh(temp.y), tanh(temp.z), tanh(temp.w));
    
    gl_FragColor = o;
}

