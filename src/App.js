import * as THREE from "three";
import React, { Suspense, useRef } from "react";
import { Canvas, useResource } from "@react-three/fiber";
import { Physics, usePlane } from "@react-three/cannon";
import Bottle from "./Bottle";
import {
  Box,
  ContactShadows,
  PerspectiveCamera,
  Plane,
  useAspect,
  useTextureLoader,
  Environment,
  useTexture,
  OrbitControls
} from "@react-three/drei";
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
  return (
    <>
      <PhyPlane rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.3, 0]} />
      <PhyPlane position={[0, 0, -100]} />
      <PhyPlane rotation={[Math.PI, 0, 0]} position={[0, 0, 75]} />
      <PhyPlane rotation={[0, -Math.PI / 2, 0]} position={[30, 0, 0]} />
      <PhyPlane rotation={[0, Math.PI / 2, 0]} position={[-30, 0, 0]} />
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
          far: 150,
        }}
        shadows
        dpr={[1, 1.5]}
        gl={{
          powerPreference: "high-performance",
          antialias: false,
          stencil: false,
          alpha: true,
        }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </>
  );
}
