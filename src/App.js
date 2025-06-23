import React, { Suspense, useRef } from "react";
import { Canvas, useResource, useThree } from "@react-three/fiber";
import { Physics, usePlane } from "@react-three/cannon";
import Bottle from "./Bottle";
import { Mouse } from "./mouse";
import usePostprocessing from "./use-postprocessing";
import Background from "./Background";

function PhyPlane(props) {
  usePlane(() => ({
    mass: 0,
    ...props,
  }));
  return null;
}

function PhyPlanes() {
  const viewport = useThree((state) => state.viewport);
  console.log(viewport);

  return (
    <>
      <PhyPlane rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.3, 0]} />
      <PhyPlane position={[0, 0, -50]} />
      <PhyPlane rotation={[Math.PI, 0, 0]} position={[0, 0, 20]} />
      <PhyPlane rotation={[0, -Math.PI / 2, 0]} position={[0.5 * viewport.width, 0, 0]} />
      <PhyPlane rotation={[0, Math.PI / 2, 0]} position={[-0.5 * viewport.width, 0, 0]} />
    </>
  );
}

function Scene() {
  const contactShadowRef = useRef();
  usePostprocessing();

  return (
    <>
      <group position={[0, -12, 0]}>
        <Physics allowSleep={false} iterations={15} gravity={[0, -100, 0]}>
          <Bottle />
          <Mouse />
          <PhyPlanes />
        </Physics>
      </group>
      <Background />
      {/* <OrbitControls /> */}
    </>
  );
}

export default function App() {
  return (
    <>
      <Canvas
        camera={{
          position: [0, 0, 60],
          fov: 30,
          near: 30,
          far: 200,
        }}
        shadows
        dpr={[1, 1.5]}
        gl={{
          powerPreference: "high-performance",
          antialias: false,
          stencil: false,
          alpha: false,
        }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </>
  );
}
