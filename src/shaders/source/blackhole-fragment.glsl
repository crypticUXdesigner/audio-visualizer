precision highp float;

#include "common/uniforms.glsl"
#include "common/screen-adaptation.glsl"
#include "common/rotation.glsl"

void main() {
    vec2 r = uResolution;
    float t = uTime;
    
    vec2 p = (gl_FragCoord.xy * 2.0 - r) / r.y / 0.7;
    vec2 d = vec2(-1.0, 1.0);
    vec2 c = p * mat2(1.0, 1.0, d / (0.1 + 5.0 / dot(5.0 * p - d, 5.0 * p - d)));
    vec2 v = c;
    v = rotate2D(log(length(v)) + t * 0.2) * v * 5.0;
    
    vec4 o = vec4(0.0);
    for(float i = 0.0; i < 9.0; i++) {
        o += sin(v.xyyx) + 1.0;
        v += 0.7 * sin(v.yx * (i + 1.0) + t) / (i + 1.0) + 0.5;
    }
    
    o = 1.0 - exp(-exp(c.x * vec4(0.6, -0.4, -1.0, 0.0)) / o / (0.1 + 0.1 * pow(length(sin(v / 0.3) * 0.2 + c * vec2(1.0, 2.0)) - 1.0, 2.0)) / (1.0 + 7.0 * exp(0.3 * c.y - dot(c, c))) / (0.03 + abs(length(p) - 0.7)) * 0.2);
    
    gl_FragColor = o;
}

