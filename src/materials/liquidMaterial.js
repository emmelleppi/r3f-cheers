import { snoise } from "./snoise"

export const vertexLiquidShader = `
varying vec3 v_viewNormal;
varying vec2 v_uv;
varying vec3 v_modelPosition;
varying vec3 v_worldPosition;
varying vec3 v_viewPosition;
varying vec3 v_worldInnerNormal;
varying vec3 v_innerNormal;
varying vec3 v_fillPosition;
varying float v_wobble;
varying vec2 v_highPrecisionZW;

uniform vec3 u_fillAmount;
uniform float u_wobbleX;
uniform float u_wobbleZ;
uniform vec3 u_position;
uniform float u_time;
uniform float u_foam;
uniform float u_bubbles;
uniform float u_impulse;

#define PI 3.1415926538

vec3 rotateAroundAxis(vec3 pos, vec3 axis, float angle) {
    float s = sin(radians(angle));
    float c = cos(radians(angle));
    float one_minus_c = 1.0 - c;

    axis = normalize(axis);
    mat3 rotMat = mat3(
        one_minus_c * axis.x * axis.x + c, one_minus_c * axis.x * axis.y - axis.z * s, one_minus_c * axis.z * axis.x + axis.y * s,
        one_minus_c * axis.x * axis.y + axis.z * s, one_minus_c * axis.y * axis.y + c, one_minus_c * axis.y * axis.z - axis.x * s,
        one_minus_c * axis.z * axis.x - axis.y * s, one_minus_c * axis.y * axis.z + axis.x * s, one_minus_c * axis.z * axis.z + c
    );
    return rotMat * pos;
}

vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}

void main () {
    vec3 fillAmount = u_fillAmount;
    fillAmount.y += 0.8 * u_impulse * u_foam;
    vec3 pos = position;
    vec3 worldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
    vec3 worldPosOffset = worldPosition - (u_position + fillAmount);

    vec3 worldPosX= rotateAroundAxis(worldPosOffset, vec3(0.0, 0.0, 1.0), 90.0);
    vec3 worldPosZ = rotateAroundAxis(worldPosOffset, vec3(1.0, 0.0, 0.0), 90.0);
    vec3 worldPosAdjusted = worldPosition + (worldPosX  * u_wobbleX)+ (worldPosZ * u_wobbleZ); 

    v_fillPosition = worldPosAdjusted - u_position - fillAmount;

    float wobbleIntensity = abs(u_wobbleX) + abs(u_wobbleZ);
    
    float freq = 0.5;
    float amplitude = 4.5; 
    v_wobble = sin((v_fillPosition.x * freq) + (v_fillPosition.z * freq) + 0.5 * u_time);
    
    freq = 0.734;
    amplitude = 0.5; 
    v_wobble += cos((v_fillPosition.x * freq) - (v_fillPosition.z * freq) + 2.0 * u_time);
    
    freq = 1.2532;
    amplitude = 0.1; 
    v_wobble += cos((v_fillPosition.x * freq) + (v_fillPosition.z * freq) + 4.0 * u_time);
    v_wobble *= amplitude * wobbleIntensity;
    
    vec4 viewPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    
    v_viewNormal = normalMatrix * normal;
    v_uv = uv;
    v_modelPosition = position;
    v_worldPosition = worldPosition;
    v_viewPosition = -viewPosition.xyz;

    v_highPrecisionZW = gl_Position.zw;
}`

export const fragmentLiquidShader = `
varying vec3 v_viewNormal;
varying vec2 v_uv;
varying vec3 v_modelPosition;
varying vec3 v_worldPosition;
varying vec3 v_viewPosition;
varying vec3 v_worldInnerNormal;
varying vec3 v_innerNormal;
varying vec3 v_fillPosition;
varying float v_wobble;

uniform vec2 u_resolution;
uniform sampler2D u_sceneMap;
uniform sampler2D u_diffuse;
uniform sampler2D u_specular;
uniform sampler2D u_lut;
uniform vec3 u_fillAmount;
uniform float u_wobbleX;
uniform float u_wobbleZ;
uniform float u_time;
uniform float u_impulse;
uniform vec3 u_color;
uniform float u_foam;
uniform float u_bubbles;
uniform float u_semitransparency;

uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;

const float PI = 3.14159265359;
const float RECIPROCAL_PI = 0.31830988618;
const float RECIPROCAL_PI2 = 0.15915494;
const float LN2 = 0.6931472;
const float ENV_LODS = 6.0;

${snoise}

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

    float movingFillPosition = v_fillPosition.y + v_wobble;
    float cutoffTop = step(0.0, movingFillPosition);
    
    if (cutoffTop > 0.5) {
        discard;
    }
    
    vec3 viewNormal = faceDirection * normalize(v_viewNormal);
    vec3 N = inverseTransformDirection(viewNormal, viewMatrix);

    vec3 worldPosition = v_worldPosition;
    if (!gl_FrontFacing) {
        worldPosition.y += 2.0 * v_modelPosition.y * u_wobbleX;
        worldPosition.y += 2.0 * v_modelPosition.y * u_wobbleZ;
    }
    
    float foam = clamp(u_foam * u_impulse * smoothstep(-4.0, 0.0, movingFillPosition), 0.0, 1.0);
    
    vec3 noisePos = worldPosition;
    noisePos.y -= u_time;
    float noiseScale = 0.1 + 0.9 * smoothstep(-12.0 * u_impulse, 0.0, movingFillPosition);
    noiseScale *= u_bubbles;
    noiseScale *= 1.0 - 0.7 * foam;
    float noise = noiseScale * clamp(snoise(vec4(8.0 * noisePos, 2.0 * u_time)), 0.0, 1.0);
    float noiseLowFreq = noiseScale * clamp(snoise(vec4(0.1 * v_modelPosition, 0.025 * u_time)), 0.0, 1.0);
    
    float permanentFoam = u_foam * (0.5 + 0.1 * u_impulse) * smoothstep(-0.5, 0.0, noiseLowFreq + movingFillPosition);
    float totalFoam = max( foam , permanentFoam);
    totalFoam *= 0.2 + 0.8 * u_semitransparency;

    if (!gl_FrontFacing) {
        totalFoam += u_impulse * 4.0 * (0.5 + 0.5 * noiseLowFreq) + 0.2 * noise;
        N = normalize(vec3(
            .5 * v_wobble,
            1.0,
            .5 * v_wobble
        ));
    }
    totalFoam = clamp(totalFoam, 0.0, 1.0);
    N += noise * 0.5;
    N = normalize(N);

    vec3 V = normalize(cameraPosition - worldPosition);
    vec3 R = normalize(reflect(-V, N));
    float NdV = clamp(abs(dot(N, V)), 0.001, 1.0);
    float fresnel = pow(1.0 - NdV, 5.0);

    vec3 baseColor = pow(u_color, vec3(2.2)) + 0.05 * noise;
    vec3 albedo = baseColor + 0.75 * totalFoam;

    // Reflection
    float roughness = clamp(totalFoam + 1.0 - u_semitransparency, 0.0, 1.0);
    float metallic = 0.0;
    vec3 f0 = vec3(0.04);
    vec3 diffuseColor = albedo * (vec3(1.0) - f0) * (1.0 - metallic);
    vec3 specularColor = mix(f0, albedo, metallic);

    vec3 reflectionColor;
    getIBLContribution(reflectionColor, NdV, roughness, N, R, specularColor);

    // Refraction
    float ior = 1.325;
    float thickness = 10.0;
    float refractionRatio = 1.0 / ior;
    vec3 refractionVector = refract( -V, N, refractionRatio );
    vec3 transmissionRay = refractionVector * thickness;
    vec3 refractedRayExit = worldPosition + transmissionRay;

    vec4 ndcPos = projectionMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
    vec2 refractionCoords = ndcPos.xy / ndcPos.w;
    refractionCoords += 1.0;
    refractionCoords /= 2.0;

    vec3 refractionColor = baseColor * SRGBtoLinear(texture2D(u_sceneMap, refractionCoords)).rgb;

    vec3 color = mix(refractionColor + 0.3 * fresnel * reflectionColor, albedo + 0.1 * noise, totalFoam);
    color = mix(albedo, color, u_semitransparency);

    gl_FragColor = vec4(linearToSRGB(color), 0.0);
}`

export const fragmentDepthLiquidShader = `
    varying vec2 v_highPrecisionZW;
    varying float v_wobble;
    varying vec3 v_fillPosition;
    varying vec3 v_viewNormal;
    varying vec3 v_worldPosition;
    varying vec3 v_modelPosition;

    uniform sampler2D u_caustic;
    uniform mat4 modelMatrix;
    uniform mat4 projectionMatrix;
    uniform float u_wobbleX;
    uniform float u_wobbleZ;

    vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
      return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
    }

    void main() {
        float movingFillPosition = v_fillPosition.y + v_wobble;
        float cutoffTop = step(0.0, movingFillPosition);
        
        if (cutoffTop > 0.5) {
            discard;
        }

        vec3 worldPosition = v_worldPosition;
        if (!gl_FrontFacing) {
            worldPosition.y += 2.0 * v_modelPosition.y * u_wobbleX;
            worldPosition.y += 2.0 * v_modelPosition.y * u_wobbleZ;
        }
        
        float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
        vec3 viewNormal = normalize(v_viewNormal);
        vec3 N = inverseTransformDirection(viewNormal, viewMatrix);
        vec3 V = normalize(cameraPosition - worldPosition);

        if (!gl_FrontFacing) {
          N = normalize(vec3(
              .5 * v_wobble,
              1.0,
              .5 * v_wobble
          ));
        }

        float NdV = clamp(abs(dot(N, V)), 0.001, 1.0);

        // Refraction
        float ior = 1.325;
        float thickness = 10.0;
        float refractionRatio = 1.0 / ior;
        vec3 refractionVector = refract( -V, N, refractionRatio );
        vec3 transmissionRay = refractionVector * thickness;
        vec3 refractedRayExit = v_fillPosition + transmissionRay;

        vec4 ndcPos = projectionMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
        vec2 refractionCoords = ndcPos.xy / ndcPos.w;
        refractionCoords += 1.0;
        refractionCoords /= 2.0;

        float caustic = (1.0 - NdV) * texture2D(u_caustic, 3.0 * refractionCoords).r;

        float distFromFloor = 1.0 - clamp((worldPosition.y + 12.0) / 16.0, 0.0, 1.0);

        float fragCoordZ = 0.5 * v_highPrecisionZW[0] / v_highPrecisionZW[1] + 0.5;
        gl_FragColor = vec4(0.0, fragCoordZ, 0.0, -mix(0.5 * NdV + 1.5 * caustic, 1.0, 1.0 - 0.9 * distFromFloor) );
    }
`
