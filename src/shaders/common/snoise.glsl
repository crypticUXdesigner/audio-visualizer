// Simplex Noise Functions
// Additional noise functions used by some shaders
// Note: Requires hash11 and hash22 from noise.glsl

// 2D Simplex Noise
float snoise2D(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec2 hashVal = hash22(i + i1.y + vec2(0.0, 1.0));
    vec3 p = vec3(hashVal, hashVal.x);
    p = mod(p, vec3(289.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

// 4D Simplex Noise
float snoise4D(vec4 v) {
    const vec4 C = vec4(0.138196601125011, 0.276393202250021, 0.414589803375032, -0.447213595499958);
    vec4 i = floor(v + dot(v, vec4(0.309016994374947451)) * vec4(1.0));
    vec4 x0 = v - i + dot(i, C.xxxx);
    vec4 i0;
    vec3 isX = step(x0.yzw, x0.xxx);
    vec3 isYZ = step(x0.zww, x0.yyy);
    i0.x = isX.x + isX.y + isX.z;
    i0.yzw = 1.0 - isX;
    i0.y += isYZ.x + isYZ.y;
    i0.zw += 1.0 - isYZ.xy;
    i0.z += isYZ.z;
    i0.w += 1.0 - isYZ.z;
    vec4 i3 = clamp(i0, 0.0, 1.0);
    vec4 i2 = clamp(i0 - 1.0, 0.0, 1.0);
    vec4 i1 = clamp(i0 - 2.0, 0.0, 1.0);
    vec4 x1 = x0 - i1 + C.xxxx;
    vec4 x2 = x0 - i2 + C.yyyy;
    vec4 x3 = x0 - i3 + C.zzzz;
    vec4 x4 = x0 + C.wwww;
    i = mod(i, 289.0);
    float j0 = hash11(dot(i, vec4(1.0, 57.0, 113.0, 171.0)));
    vec4 j = vec4(j0, j0, j0, j0) + vec4(0.0, 1.0, 2.0, 3.0);
    j = mod(j, 289.0);
    vec4 p = vec4(
        hash11(dot(j, vec4(1.0, 57.0, 113.0, 171.0))),
        hash11(dot(j + vec4(1.0), vec4(1.0, 57.0, 113.0, 171.0))),
        hash11(dot(j + vec4(2.0), vec4(1.0, 57.0, 113.0, 171.0))),
        hash11(dot(j + vec4(3.0), vec4(1.0, 57.0, 113.0, 171.0)))
    );
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    m = m * m;
    vec4 p1 = p * x0;
    vec4 p2 = p * x1;
    vec4 p3 = p * x2;
    vec4 p4 = p * x3;
    return 42.0 * dot(m, vec4(dot(p1, x0), dot(p2, x1), dot(p3, x2), dot(p4, x3)));
}

// Fast Simplex Noise (fsnoise) - simplified version
float fsnoise(vec2 p) {
    return snoise2D(p) * 0.5 + 0.5;
}

