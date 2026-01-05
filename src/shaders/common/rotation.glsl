// Rotation Functions
// 2D and 3D rotation matrix helpers

// 2D rotation matrix
mat2 rotate2D(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s, c);
}

// 3D rotation around axis (axis should be normalized)
mat3 rotate3D(float angle, vec3 axis) {
    float c = cos(angle);
    float s = sin(angle);
    float oc = 1.0 - c;
    
    mat3 rot = mat3(
        oc * axis.x * axis.x + c,
        oc * axis.x * axis.y - axis.z * s,
        oc * axis.z * axis.x + axis.y * s,
        oc * axis.x * axis.y + axis.z * s,
        oc * axis.y * axis.y + c,
        oc * axis.y * axis.z - axis.x * s,
        oc * axis.z * axis.x - axis.y * s,
        oc * axis.y * axis.z + axis.x * s,
        oc * axis.z * axis.z + c
    );
    
    return rot;
}

