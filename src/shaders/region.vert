#version 300 es
// Standard vertex shader for full-screen quad
in vec3 aPosition;
in vec2 aTexCoord;

out vec2 vTexCoord;

void main() {
    // Flip Y coordinate for proper texture sampling
    vTexCoord = vec2(aTexCoord.x, 1.0 - aTexCoord.y);
    
    vec4 positionVec4 = vec4(aPosition, 1.0);
    positionVec4.xy = positionVec4.xy * 2.0 - 1.0;
    
    gl_Position = positionVec4;
}
