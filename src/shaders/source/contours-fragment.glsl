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
    float z = fract(dot(FC, FC) / 9.0);
    
    float d = 1.0;
    for(float i = 0.0; i < 30.0; i++) {
        vec3 p = z * normalize(FC.rgb * 2.0 - r.xyy);
        p.z -= t;
        d = 0.01 + 0.3 * abs(cos(dot(cos(p), sin(p.yzx / 0.6 + 0.1 * sin(p.zxy / 0.1)) / 0.1)));
        z += d;
        o += vec4(2.0, 2.0, 3.0, 1.0) / d;
    }
    
    // Apply tanh component-wise (GLSL ES 1.0 tanh only works on scalars)
    o = vec4(tanh(o.x / 1e3), tanh(o.y / 1e3), tanh(o.z / 1e3), tanh(o.w / 1e3));
    
    gl_FragColor = o;
}

