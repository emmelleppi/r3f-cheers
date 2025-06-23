export const vertexGlassShader = `
varying vec3 v_viewNormal;
varying vec2 v_uv;
varying vec3 v_modelPosition;
varying vec3 v_worldPosition;
varying vec3 v_viewPosition;
varying vec3 v_worldNormal;
varying vec2 v_highPrecisionZW;

vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}

void main () {
    vec3 pos = position;
    vec4 viewPosition = modelViewMatrix * vec4(pos, 1.0);

    gl_Position = projectionMatrix * viewPosition;

	v_viewNormal = normalMatrix * normal;
	v_uv = uv;
    v_modelPosition = position;
    v_worldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
    v_viewPosition = -viewPosition.xyz;
    v_worldNormal = inverseTransformDirection(v_viewNormal, viewMatrix);

    v_highPrecisionZW = gl_Position.zw;
}`

export const fragmentGlassShader = `
varying vec3 v_viewNormal;
varying vec2 v_uv;
varying vec3 v_modelPosition;
varying vec3 v_worldPosition;
varying vec3 v_viewPosition;
varying vec2 v_highPrecisionZW;

uniform vec2 u_resolution;
uniform sampler2D u_sceneMap;
uniform sampler2D u_diffuse;
uniform sampler2D u_specular;
uniform sampler2D u_lut;
uniform vec3 u_color;

uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;

const float PI = 3.14159265359;
const float RECIPROCAL_PI = 0.31830988618;
const float RECIPROCAL_PI2 = 0.15915494;
const float LN2 = 0.6931472;
const float ENV_LODS = 6.0;

vec4 SRGBtoLinear(vec4 srgb) {
	vec3 linOut = pow(srgb.xyz, vec3(2.2));
	return vec4(linOut, srgb.w);;
}

vec4 RGBMToLinear(in vec4 value) {
	float maxRange = 6.0;
	return vec4(value.xyz * value.w * maxRange, 1.0);
}

vec3 linearToSRGB(vec3 color) {
    return pow(color, vec3(1.0 / 2.2));
}

vec2 cartesianToPolar(vec3 n) {
    vec2 uv;
    uv.x = atan(n.z, n.x) * RECIPROCAL_PI2 + 0.5;
    uv.y = asin(n.y) * RECIPROCAL_PI + 0.5;
    return uv;
}

void getIBLContribution(inout vec3 specular, float NdV, float roughness, vec3 n, vec3 reflection, vec3 specularColor) {
    vec3 brdf = SRGBtoLinear(texture2D(u_lut, vec2(NdV, roughness))).rgb;

    // Sample 2 levels and mix between to get smoother degradation
    float blend = roughness * ENV_LODS;
    float level0 = floor(blend);
    float level1 = min(ENV_LODS, level0 + 1.0);
    blend -= level0;

    // Sample the specular env map atlas depending on the roughness value
    vec2 uvSpec = cartesianToPolar(reflection);
    uvSpec.y /= 2.0;

    vec2 uv0 = uvSpec;
    vec2 uv1 = uvSpec;

    uv0 /= pow(2.0, level0);
    uv0.y += 1.0 - exp(-LN2 * level0);

    uv1 /= pow(2.0, level1);
    uv1.y += 1.0 - exp(-LN2 * level1);

    vec3 specular0 = RGBMToLinear(texture2D(u_specular, uv0)).rgb;
    vec3 specular1 = RGBMToLinear(texture2D(u_specular, uv1)).rgb;
    vec3 specularLight = mix(specular0, specular1, blend);

    // Bit of extra reflection for smooth materials
    float reflectivity = pow((1.0 - roughness), 2.0) * 0.05;
    specular = specularLight * (specularColor * brdf.x + brdf.y + reflectivity);
}

vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}

void main() {
	float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
    
    vec3 viewNormal = faceDirection * normalize(v_viewNormal);
	vec3 N = inverseTransformDirection(viewNormal, viewMatrix);
	vec3 V = normalize(cameraPosition - v_worldPosition);
	vec3 R = normalize(reflect(-V, N));
    float NdV = clamp(abs(dot(N, V)), 0.001, 1.0);
    float fresnel = pow(1.0 - NdV, 2.0);
    float ao = clamp((v_worldPosition.y + 12.0) / 3.0, 0.0, 1.0);

    // Reflection
    vec3 albedo = pow(u_color, vec3(2.2));
    float roughness = 0.1;
    float metallic = 0.0;
    vec3 f0 = vec3(0.04);
    vec3 diffuseColor = albedo * (vec3(1.0) - f0) * (1.0 - metallic);
    vec3 specularColor = mix(f0, albedo, metallic);

    vec3 reflectionColor;
    getIBLContribution(reflectionColor, NdV, roughness, N, R, 1.0 * specularColor);

    // Refraction
    float ior = 1.5;
    float thickness = 0.35 * faceDirection;
    float refractionRatio = 1.0 / ior;
    vec3 refractionVector = refract( -V, N, refractionRatio );
    vec3 transmissionRay = refractionVector * thickness;
    vec3 refractedRayExit = v_worldPosition + transmissionRay;

    vec4 ndcPos = projectionMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
    vec2 refractionCoords = ndcPos.xy / ndcPos.w;
    refractionCoords += 1.0;
    refractionCoords /= 2.0;

    vec3 refractionColor = diffuseColor * SRGBtoLinear(texture2D(u_sceneMap, refractionCoords)).rgb;
    vec3 color = ao * refractionColor + (gl_FrontFacing ? 1.0 : 0.5) * ao * reflectionColor;

    gl_FragColor = vec4(linearToSRGB(color), 1.0);
}`

export const fragmentDepthGlassShader = `
    varying vec2 v_highPrecisionZW;
    varying vec3 v_viewNormal;
    varying vec3 v_worldPosition;

    vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
      return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
    }

    void main() {
        float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
        vec3 viewNormal = normalize(v_viewNormal);
        vec3 N = inverseTransformDirection(viewNormal, viewMatrix);
        vec3 V = normalize(cameraPosition - v_worldPosition);
        float NdV = clamp(abs(dot(N, V)), 0.001, 1.0);

        float distFromFloor = 1.0 - clamp((v_worldPosition.y + 12.0) / 12.0, 0.0, 1.0);

        float fragCoordZ = 0.5 * v_highPrecisionZW[0] / v_highPrecisionZW[1] + 0.5;
        gl_FragColor = vec4(fragCoordZ, 0.0, 0.0, -mix(0.5 * NdV, 1.0, 1.0 - 0.9 * distFromFloor) );
    }
`
