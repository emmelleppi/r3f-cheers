export const vertexFloorShader = `
varying vec3 v_viewNormal;
varying vec2 v_uv;
varying vec3 v_modelPosition;
varying vec3 v_worldPosition;
varying vec3 v_viewPosition;
varying vec3 v_worldNormal;

#if defined( USE_SHADOWMAP )
    uniform mat4 directionalShadowMatrix[1];
    varying vec4 vDirectionalShadowCoord[1];
    varying vec4 v_goboCoord;

    struct DirectionalLightShadow {
        float shadowBias;
        float shadowNormalBias;
        float shadowRadius;
        vec2 shadowMapSize;
    };

    uniform DirectionalLightShadow directionalLightShadows[1];
#endif

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
    
    #if defined( USE_SHADOWMAP )
        vDirectionalShadowCoord[0] = directionalShadowMatrix[0] * vec4(v_worldPosition, 1.0) + vec4(v_worldNormal * directionalLightShadows[0].shadowNormalBias, 0. );
    #endif
}`

export const fragmentFloorShader = `
varying vec3 v_viewNormal;
varying vec2 v_uv;
varying vec3 v_modelPosition;
varying vec3 v_worldPosition;
varying vec3 v_viewPosition;

uniform vec3 u_color;
uniform vec3 u_liquidColor;
uniform vec3 u_glassColor;
uniform sampler2D u_bgTexture;
uniform vec2 u_resolution;
uniform float u_imageAspect;

uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;

vec4 SRGBtoLinear(vec4 srgb) {
	vec3 linOut = pow(srgb.xyz, vec3(2.2));
	return vec4(linOut, srgb.w);;
}

vec3 linearToSRGB(vec3 color) {
    return pow(color, vec3(1.0 / 2.2));
}

vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}

#if defined( USE_SHADOWMAP )
  uniform sampler2D directionalShadowMap[ 1 ];
  varying vec4 vDirectionalShadowCoord[ 1 ];
  struct DirectionalLightShadow {
      float shadowBias;
      float shadowNormalBias;
      float shadowRadius;
      vec2 shadowMapSize;
  };
  uniform DirectionalLightShadow directionalLightShadows[ 1 ];

  vec3 texture2DCompare( sampler2D shadowMap, vec2 uv, float compare ) {
    
    vec4 shadowMapInfos = texture2D( shadowMap, uv );

    if (shadowMapInfos.a < 0.0) {
      float opacity = abs(shadowMapInfos.a);
      float glass = step( compare, 1.0 - shadowMapInfos.r );
      float liquid = step( compare, 1.0 - shadowMapInfos.g );
      float cap = step( compare, 1.0 - shadowMapInfos.b );
      vec3 glassColor = pow(u_glassColor, vec3(2.2));
      vec3 liquidColor = pow(u_liquidColor, vec3(2.2));
      
      if (cap < 0.5) {
        return vec3(opacity);
      } else {
          return mix(
            (0.75 + 0.25 * opacity) * (2.0 * glassColor + 0.5 * (1.0 - liquid) * liquidColor),
            vec3(opacity),
            opacity
          );
      }
    }

    return vec3(1.0);
  }

  vec3 getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
      vec3 shadow = vec3(1.0);

      shadowCoord.xyz /= shadowCoord.w;
      shadowCoord.z += shadowBias;

      bvec4 inFrustumVec = bvec4 ( shadowCoord.x >= 0.0, shadowCoord.x <= 1.0, shadowCoord.y >= 0.0, shadowCoord.y <= 1.0 );
      bool inFrustum = all( inFrustumVec );

      bvec2 frustumTestVec = bvec2( inFrustum, shadowCoord.z <= 1.0 );

      bool frustumTest = all( frustumTestVec );

      if ( frustumTest ) {
          vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
          float dx = texelSize.x;
          float dy = texelSize.y;

          vec2 uv = shadowCoord.xy;
          vec2 f = fract( uv * shadowMapSize + 0.5 );
          uv -= f * texelSize;

          // shadow = texture2DCompare( shadowMap, uv, shadowCoord.z );
          shadow = (
            texture2DCompare( shadowMap, uv, shadowCoord.z ) +
            texture2DCompare( shadowMap, uv + vec2( dx, 0.0 ), shadowCoord.z ) +
            texture2DCompare( shadowMap, uv + vec2( 0.0, dy ), shadowCoord.z ) +
            texture2DCompare( shadowMap, uv + texelSize, shadowCoord.z ) +
            mix( texture2DCompare( shadowMap, uv + vec2( -dx, 0.0 ), shadowCoord.z ),
              texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 0.0 ), shadowCoord.z ),
              f.x ) +
            mix( texture2DCompare( shadowMap, uv + vec2( -dx, dy ), shadowCoord.z ),
              texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, dy ), shadowCoord.z ),
              f.x ) +
            mix( texture2DCompare( shadowMap, uv + vec2( 0.0, -dy ), shadowCoord.z ),
              texture2DCompare( shadowMap, uv + vec2( 0.0, 2.0 * dy ), shadowCoord.z ),
              f.y ) +
            mix( texture2DCompare( shadowMap, uv + vec2( dx, -dy ), shadowCoord.z ),
              texture2DCompare( shadowMap, uv + vec2( dx, 2.0 * dy ), shadowCoord.z ),
              f.y ) +
            mix( mix( texture2DCompare( shadowMap, uv + vec2( -dx, -dy ), shadowCoord.z ),
                  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, -dy ), shadowCoord.z ),
                  f.x ),
              mix( texture2DCompare( shadowMap, uv + vec2( -dx, 2.0 * dy ), shadowCoord.z ),
                  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 2.0 * dy ), shadowCoord.z ),
                  f.x ),
              f.y )
          ) * ( 1.0 / 9.0 );
      }

      return shadow;
  }

  vec3 getShadowMask() {
    vec3 blueNoise = vec3(0.0);
    DirectionalLightShadow directionalLight = directionalLightShadows[0];
    return getShadow( directionalShadowMap[0], directionalLight.shadowMapSize, directionalLight.shadowBias - blueNoise.z * 0.0005, directionalLight.shadowRadius, vDirectionalShadowCoord[0] + vec4((blueNoise.xy - 0.5) / directionalLight.shadowMapSize, 0.0, 0.0));
  }
#endif

void main() {
    float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
    
    vec2 screenUV = gl_FragCoord.xy / u_resolution;
    
    vec2 aspect = vec2(u_resolution.x / u_resolution.y / u_imageAspect, 1.0);
    if ((u_resolution.x / u_resolution.y) > u_imageAspect) {
      aspect = vec2(1.0, u_resolution.y / u_resolution.x * u_imageAspect);
    }

    vec2 uv = (screenUV - 0.5) * aspect + 0.5;
    vec3 bgColor = texture2D(u_bgTexture, uv).rgb;
    vec3 color = bgColor;
    color = mix(color, vec3(1.0), 1.0 - pow(screenUV.y, 2.0));
    color *= 0.75 + 0.25 * getShadowMask();

    gl_FragColor = vec4(color, 1.0);
    gl_FragColor.rgb = pow(gl_FragColor.rgb, vec3(2.2));
}`
