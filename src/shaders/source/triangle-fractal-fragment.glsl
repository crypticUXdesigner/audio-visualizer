precision highp float;

#include "common/uniforms.glsl"
#include "common/screen-adaptation.glsl"
#include "common/noise.glsl"
#include "common/snoise.glsl"

void main() {
    vec2 r = uResolution;
    float t = uTime;
    
    float f = floor(t);
    float s = t - f;
    vec4 o = vec4(0.0);
    
    for(float i = 0.0; i < 8.0; i++) {
        vec2 p = (gl_FragCoord.xy - r * 0.5) * mat2(1.155, 0.0, 0.577, 1.0);
        vec2 c;
        o += fsnoise(ceil(c = p / exp2(9.0 + s - i)) + ceil(c.x - c.y) + f + i) * max(3.5 - abs(i - s - 3.5), 0.0);
    }
    
    o = o * 0.1 - 0.1;
    
    gl_FragColor = o;
}

