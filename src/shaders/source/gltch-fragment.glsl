precision highp float;

#include "common/uniforms.glsl"
#include "common/screen-adaptation.glsl"
#include "common/noise.glsl"
#include "common/snoise.glsl"
#include "common/rotation.glsl"
#include "common/constants.glsl"

#define N(x) fsnoise(ceil(x))

void main() {
    vec2 r = uResolution;
    float t = uTime;
    
    vec4 o = vec4(0.0);
    vec2 p, c;
    
    for(float i = -1.0; i < 1.0; i += 0.02) {
        p = (gl_FragCoord.xy * 2.0 - r) * 0.1 / (50.0 + i);
        o += ceil(cos((p * rotate2D(ceil(N(c = p / (0.1 + N(p))) * 8.0) * PI / 4.0)).x / N(N(c) + ceil(c) + t))) * vec4(1.0 + i, 2.0 - abs(i + i), 1.0 - i, 1.0) / 1e2;
    }
    
    gl_FragColor = o;
}

