import { useTexture } from "@react-three/drei";

function Background() {
  const bgTexture = useTexture('/test.png')

  return (
    <mesh renderOrder={-1}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={`
          varying vec2 v_uv;
          void main() {
            v_uv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
          }
        `}
        fragmentShader={`
        varying vec2 v_uv;
        uniform sampler2D u_texture;
          void main() {
            gl_FragColor = texture2D(u_texture, v_uv);
            gl_FragColor.rgb = pow(gl_FragColor.rgb, vec3(2.2));
          }
        `}
        uniforms={{
          u_texture: { value: bgTexture },
        }}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}

export default Background;