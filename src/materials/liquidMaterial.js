export const vertexLiquidShader = `
varying vec3 v_viewNormal;
varying vec2 v_uv;
varying vec3 v_modelPosition;
varying vec3 v_worldPosition;
varying vec3 v_viewPosition;
varying vec3 v_worldInnerNormal;
varying vec3 v_innerNormal;
varying vec3 v_fillPosition;

uniform vec3 u_fillAmount;
uniform float u_wobbleX;
uniform float u_wobbleZ;
uniform vec3 u_position;
uniform float u_time;

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
    vec3 pos = position;
    vec3 worldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
    vec3 worldPosOffset = worldPosition - (u_position + u_fillAmount);

    vec3 worldPosX= rotateAroundAxis(worldPosOffset, vec3(0.0, 0.0, 1.0), 90.0);
    vec3 worldPosZ = rotateAroundAxis(worldPosOffset, vec3(1.0, 0.0, 0.0), 90.0);
    vec3 worldPosAdjusted = worldPosition + (worldPosX  * u_wobbleX)+ (worldPosZ* u_wobbleZ); 

    v_fillPosition = worldPosAdjusted - u_position - u_fillAmount;
    
    vec4 viewPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    
	v_viewNormal = normalMatrix * normal;
	v_uv = uv;
    v_modelPosition = position;
    v_worldPosition = worldPosition;
    v_viewPosition = -viewPosition.xyz;
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


uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;

const float PI = 3.14159265359;
const float RECIPROCAL_PI = 0.31830988618;
const float RECIPROCAL_PI2 = 0.15915494;
const float LN2 = 0.6931472;
const float ENV_LODS = 6.0;


//	Simplex 4D Noise 
//	by Ian McEwan, Stefan Gustavson (https://github.com/stegu/webgl-noise)
//
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
float permute(float x){return floor(mod(((x*34.0)+1.0)*x, 289.0));}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float taylorInvSqrt(float r){return 1.79284291400159 - 0.85373472095314 * r;}

vec4 grad4(float j, vec4 ip){
  const vec4 ones = vec4(1.0, 1.0, 1.0, -1.0);
  vec4 p,s;

  p.xyz = floor( fract (vec3(j) * ip.xyz) * 7.0) * ip.z - 1.0;
  p.w = 1.5 - dot(abs(p.xyz), ones.xyz);
  s = vec4(lessThan(p, vec4(0.0)));
  p.xyz = p.xyz + (s.xyz*2.0 - 1.0) * s.www; 

  return p;
}

float snoise(vec4 v){
  const vec2  C = vec2( 0.138196601125010504,  // (5 - sqrt(5))/20  G4
                        0.309016994374947451); // (sqrt(5) - 1)/4   F4
// First corner
  vec4 i  = floor(v + dot(v, C.yyyy) );
  vec4 x0 = v -   i + dot(i, C.xxxx);

// Other corners

// Rank sorting originally contributed by Bill Licea-Kane, AMD (formerly ATI)
  vec4 i0;

  vec3 isX = step( x0.yzw, x0.xxx );
  vec3 isYZ = step( x0.zww, x0.yyz );
//  i0.x = dot( isX, vec3( 1.0 ) );
  i0.x = isX.x + isX.y + isX.z;
  i0.yzw = 1.0 - isX;

//  i0.y += dot( isYZ.xy, vec2( 1.0 ) );
  i0.y += isYZ.x + isYZ.y;
  i0.zw += 1.0 - isYZ.xy;

  i0.z += isYZ.z;
  i0.w += 1.0 - isYZ.z;

  // i0 now contains the unique values 0,1,2,3 in each channel
  vec4 i3 = clamp( i0, 0.0, 1.0 );
  vec4 i2 = clamp( i0-1.0, 0.0, 1.0 );
  vec4 i1 = clamp( i0-2.0, 0.0, 1.0 );

  //  x0 = x0 - 0.0 + 0.0 * C 
  vec4 x1 = x0 - i1 + 1.0 * C.xxxx;
  vec4 x2 = x0 - i2 + 2.0 * C.xxxx;
  vec4 x3 = x0 - i3 + 3.0 * C.xxxx;
  vec4 x4 = x0 - 1.0 + 4.0 * C.xxxx;

// Permutations
  i = mod(i, 289.0); 
  float j0 = permute( permute( permute( permute(i.w) + i.z) + i.y) + i.x);
  vec4 j1 = permute( permute( permute( permute (
             i.w + vec4(i1.w, i2.w, i3.w, 1.0 ))
           + i.z + vec4(i1.z, i2.z, i3.z, 1.0 ))
           + i.y + vec4(i1.y, i2.y, i3.y, 1.0 ))
           + i.x + vec4(i1.x, i2.x, i3.x, 1.0 ));
// Gradients
// ( 7*7*6 points uniformly over a cube, mapped onto a 4-octahedron.)
// 7*7*6 = 294, which is close to the ring size 17*17 = 289.

  vec4 ip = vec4(1.0/294.0, 1.0/49.0, 1.0/7.0, 0.0) ;

  vec4 p0 = grad4(j0,   ip);
  vec4 p1 = grad4(j1.x, ip);
  vec4 p2 = grad4(j1.y, ip);
  vec4 p3 = grad4(j1.z, ip);
  vec4 p4 = grad4(j1.w, ip);

// Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  p4 *= taylorInvSqrt(dot(p4,p4));

// Mix contributions from the five corners
  vec3 m0 = max(0.6 - vec3(dot(x0,x0), dot(x1,x1), dot(x2,x2)), 0.0);
  vec2 m1 = max(0.6 - vec2(dot(x3,x3), dot(x4,x4)            ), 0.0);
  m0 = m0 * m0;
  m1 = m1 * m1;
  return 49.0 * ( dot(m0*m0, vec3( dot( p0, x0 ), dot( p1, x1 ), dot( p2, x2 )))
               + dot(m1*m1, vec2( dot( p3, x3 ), dot( p4, x4 ) ) ) ) ;

}

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

float hash13(vec3 p3) {
	p3  = fract(p3 * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
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

    float wobbleIntensity = abs(u_wobbleX) + abs(u_wobbleZ);

    float freq = 0.5;
    float amplitude = 1.5; 
    float wobble = sin((v_fillPosition.x * freq) + (v_fillPosition.z * freq) + 0.5 * u_time) * (amplitude * wobbleIntensity);
    
    freq = 0.734;
    amplitude = 0.0987; 
    wobble += cos((v_fillPosition.x * freq) - (v_fillPosition.z * freq) + 2.0 * u_time);
    
    freq = 1.2532;
    amplitude = 0.05876; 
    wobble += cos((v_fillPosition.x * freq) + (v_fillPosition.z * freq) + 4.0 * u_time);
    wobble *= amplitude * wobbleIntensity;

    float movingFillPosition = v_fillPosition.y + wobble;
    float cutoffTop = step(0.0, movingFillPosition);
    
    if (cutoffTop > 0.5) {
        discard;
    }
    
    vec3 viewNormal = faceDirection * normalize(v_viewNormal);
    vec3 N = inverseTransformDirection(viewNormal, viewMatrix);
    
    vec3 noisePos = v_worldPosition;
    noisePos.y -= u_time;
    float noiseScale = 0.1 + 0.9 * smoothstep(-12.0 * u_impulse, 0.0, v_fillPosition.y);
    float noise = noiseScale * clamp(snoise(vec4(8.0 * noisePos, 2.0 * u_time)), 0.0, 1.0);
    float noiseLowFreq = noiseScale * clamp(snoise(vec4(0.1 * v_modelPosition, 0.025 * u_time)), 0.0, 1.0);
    
    float foam = u_impulse * smoothstep(-4.0, 0.0, movingFillPosition);
    float permanentFoam = (0.5 + 0.5 * noise) * (0.5 + 0.1 * u_impulse) * smoothstep(-0.5, 0.0, noiseLowFreq + movingFillPosition);

    if (!gl_FrontFacing) {
        foam = u_impulse * 4.0 * (0.5 + 0.5 * noiseLowFreq) + 0.2 * noise;
        N = normalize(vec3(
            .5 * wobble,
            1.0,
            .5 * wobble
        ));
    }
    foam = clamp(foam, 0.0, 1.0);
    N += noise * 0.5;
    N = normalize(N);

    vec3 V = normalize(cameraPosition - v_worldPosition);
	vec3 R = normalize(reflect(-V, N));
    float NdV = clamp(abs(dot(N, V)), 0.001, 1.0);
    float fresnel = pow(1.0 - NdV, 5.0);

    vec3 albedo = pow(u_color, vec3(2.2)) + 0.05 * noise + foam;

    // Reflection
    float roughness = 0.0;
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
    vec3 refractedRayExit = v_worldPosition + transmissionRay;

    vec4 ndcPos = projectionMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
    vec2 refractionCoords = ndcPos.xy / ndcPos.w;
    refractionCoords += 1.0;
    refractionCoords /= 2.0;

    vec3 refractionColor = albedo * SRGBtoLinear(texture2D(u_sceneMap, refractionCoords)).rgb;

    float totalFoam = max( 0.5 * foam , permanentFoam);
    vec3 color = mix(refractionColor + 0.3 * fresnel * reflectionColor, 0.25 + 0.75 * albedo, totalFoam);
    color += 0.02 * noise;

    gl_FragColor = vec4(linearToSRGB(color), 0.0);
}`

