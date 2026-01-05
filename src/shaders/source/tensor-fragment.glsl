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
    vec3 p;
    
    float z = 0.0;
    float f = 0.0;
    for(float i = 0.0; i < 40.0; i++) {
        p = z * (FC.rgb * 2.0 - r.xyy) / r.y;
        p.z -= t;
        for(float j = 1.0; j < 6.0; j++) {
            // Component-wise rounding (GLSL ES 1.0 round only works on scalars)
            vec3 pScaled = p * 6.0;
            vec3 pRounded = vec3(floor(pScaled.x + 0.5), floor(pScaled.y + 0.5), floor(pScaled.z + 0.5));
            p += sin(pRounded / 6.0 * j - t * 0.5) / j;
        }
        f = 0.003 + abs(length(p.xy) + dot(cos(p), sin(p / 0.6).yzx) - 5.0) / 7.0;
        z += f;
        o.grb += (1.5 - p / z) / f;
    }
    
    // Apply tanh component-wise (GLSL ES 1.0 tanh only works on scalars)
    o = vec4(tanh(o.x / 3e3), tanh(o.y / 3e3), tanh(o.z / 3e3), tanh(o.w / 3e3));
    
    gl_FragColor = o;
}

