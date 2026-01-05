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
    float s = 1.0; // Initialize to avoid division by zero
    for(float i = 0.0; i < 100.0; i++) {
        o += vec4(z, 1.0, s, 1.0) / s / d;
        vec3 p = z * normalize(FC.rgb * 2.0 - r.xyy);
        vec3 a = vec3(-1.0, 0.0, 0.0);
        p.z += 5.0;
        s -= t - z;
        a = mix(dot(a, p) * a, p, sin(s)) + cos(s) * cross(a, p);
        for(float j = 1.0; j < 9.0; j++) {
            a += sin(ceil(a * j) - t).yzx / j;
        }
        s = sqrt(length(a.yz));
        d = length(sin(a)) * s / 2e1;
        z += d;
    }
    
    // Apply tanh component-wise (GLSL ES 1.0 tanh only works on scalars)
    o = vec4(tanh(o.x / 5e3), tanh(o.y / 5e3), tanh(o.z / 5e3), tanh(o.w / 5e3));
    
    gl_FragColor = o;
}

