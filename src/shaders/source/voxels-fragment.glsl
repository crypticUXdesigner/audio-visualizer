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
    float d = 1.0;
    for(float i = 0.0; i < 60.0; i++) {
        vec3 dir = normalize(FC.rgb * 2.0 - r.xyy);
        vec3 p = z * dir / 0.1;
        // Component-wise rounding: round each component
        p = floor(p + 0.5) * 0.1;
        p.z -= 9.0;
        for(float j = 0.0; j < 9.0; j++) {
            p += 0.2 * sin(p * j - t + z).yzx;
        }
        d = length(cos(p) - 1.0) / 20.0;
        o += vec4(z, 9.0, 1.0, 1.0) / d / d;
        z += d;
    }
    
    // Apply tanh component-wise (GLSL ES 1.0 tanh only works on scalars)
    o = vec4(tanh(o.x / 3e5), tanh(o.y / 3e5), tanh(o.z / 3e5), tanh(o.w / 3e5));
    
    gl_FragColor = o;
}


