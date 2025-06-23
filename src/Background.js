import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useState } from "react";

function Background() {
  const bgTexture = useTexture('/bg.png')

  const uniforms = useState(
    () => ({
      u_imageAspect: {value: 1},
      u_resolution: {value: new THREE.Vector2()},
      u_texture: { value: bgTexture },
    })
  )[0]

  useFrame(({viewport}) => {
    uniforms.u_resolution.value.set(Math.floor(window.innerWidth * viewport.dpr), Math.floor(window.innerHeight * viewport.dpr));
    uniforms.u_imageAspect.value = bgTexture.image.width / bgTexture.image.height;
  })

  return (
    <mesh renderOrder={-1}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={`
          varying vec2 v_uv;
          void main() {
            v_uv = position.xy * 0.5 + 0.5;
            gl_Position = vec4(position.xy, 0.0, 1.0);
          }
        `}
        fragmentShader={`
          varying vec2 v_uv;
          uniform sampler2D u_texture;
          uniform vec2 u_resolution;
          uniform float u_imageAspect;
          
          void main() {
    
            vec2 aspect = vec2(u_resolution.x / u_resolution.y / u_imageAspect, 1.0);
            if ((u_resolution.x / u_resolution.y) > u_imageAspect) {
              aspect = vec2(1.0, u_resolution.y / u_resolution.x * u_imageAspect);
            }

            vec2 uv = (v_uv - 0.5) * aspect + 0.5;
            gl_FragColor = texture2D(u_texture, uv);
            gl_FragColor.rgb = pow(gl_FragColor.rgb, vec3(2.2));
          }
        `}
        uniforms={uniforms}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}

export default Background;