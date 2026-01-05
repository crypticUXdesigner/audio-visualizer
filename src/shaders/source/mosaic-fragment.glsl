precision highp float;

#include "common/uniforms.glsl"
#include "common/screen-adaptation.glsl"

void main() {
    vec3 FC = gl_FragCoord.xyz;
    vec2 r = uResolution;
    float t = uTime;
    
    vec2 u = (FC.xy * 2.0 - r.xy) / r.y;
    float l = length(u);
    vec4 O = vec4(0.0);
    
    for (float i = 0.0; i < 4.0; i++) {
        O += pow(.04 / abs(sin(8.0 * ( length( u = fract(u * 1.5) - .5 ) / exp(l)) + t)), 1.2) * (1.0 + cos(6.0 * (l + (i + t) * .4 + vec4(.26, .4, .56, 0.0))));
    }
    
    gl_FragColor = O;
}

