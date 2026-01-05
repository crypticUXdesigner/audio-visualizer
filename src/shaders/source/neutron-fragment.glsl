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
    for(float i = 0.0; i < 100.0; i++) {
        o += (cos(s + vec4(0.0, 1.0, 2.0, 0.0)) + 1.0) / d;
        vec3 p = z * normalize(FC.rgb * 2.0 - r.xyy);
        vec3 a = normalize(cos(vec3(7.0, 1.0, 0.0) + t - 0.3 * s));
        p.z += 9.0;
        a = a * dot(a, p) - cross(a, p);
        for(float j = 0.5; j < 9.0; j++) {
            a += sin(a * j + t).yzx / j;
        }
        s = length(a) - 5.0;
        d = 0.01 * abs(s) + 0.05 * abs(a.y);
        z += d;
    }
    
    // Apply tanh component-wise (GLSL ES 1.0 tanh only works on scalars)
    o = vec4(tanh(o.x / 3e3), tanh(o.y / 3e3), tanh(o.z / 3e3), tanh(o.w / 3e3));
    
    gl_FragColor = o;
}

