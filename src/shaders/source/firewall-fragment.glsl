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
    float d = 0.0;
    for(float i = 0.0; i < 40.0; i++) {
        vec3 p = z * normalize(FC.rgb * 2.0 - r.xyx);
        p = vec3(atan(p.z += 9.0, p.x + 1.0) * 2.0, 0.6 * p.y + t + t, length(p.xz) - 3.0);
        for(float j = 1.0; j < 7.0; j++) {
            p += sin(p.yzx * j + t + 0.5 * i) / j;
        }
        d = 0.4 * length(vec4(0.3 * cos(p) - 0.3, p.z));
        z += d;
        o += (cos(p.y + i * 0.4 + vec4(6.0, 1.0, 2.0, 0.0)) + 1.0) / d;
    }
    
    // Apply tanh component-wise (GLSL ES 1.0 tanh only works on scalars)
    vec4 oSquared = o * o;
    o = vec4(tanh(oSquared.x / 6e3), tanh(oSquared.y / 6e3), tanh(oSquared.z / 6e3), tanh(oSquared.w / 6e3));
    
    gl_FragColor = o;
}

