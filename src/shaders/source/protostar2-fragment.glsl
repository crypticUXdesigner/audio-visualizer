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
    float s = 0.0;
    for(float i = 0.0; i < 200.0; i++) {
        o += (cos(s / 0.6 + vec4(0.0, 1.0, 2.0, 0.0)) + 1.1) / d;
        vec3 p = z * normalize(FC.rgb * 2.0 - r.xyy);
        vec3 a = normalize(cos(vec3(0.0, 1.0, 0.0) + t - 0.4 * s));
        p.z += 9.0;
        a = a * dot(a, p) - cross(a, p);
        for(float j = 1.0; j < 6.0; j++) {
            a += cos(a * j + t).yzx / j;
            s = length(a);
        }
        d = 0.1 * (abs(sin(s - t)) + abs(a.y) / 6.0);
        z += d;
    }
    
    // Apply tanh component-wise (GLSL ES 1.0 tanh only works on scalars)
    vec4 oSquared = o * o;
    o = vec4(tanh(oSquared.x / 2e7), tanh(oSquared.y / 2e7), tanh(oSquared.z / 2e7), tanh(oSquared.w / 2e7));
    
    gl_FragColor = o;
}

