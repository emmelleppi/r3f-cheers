import * as THREE from "three";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, extend } from "@react-three/fiber";
import lerp from "lerp";
import { useCylinder } from "@react-three/cannon";
import { useDragConstraint } from "./mouse";
import { useGLTF, useHelper, useTexture } from "@react-three/drei";
import {
  BOTTLE_BODY_PROPS,
} from "./store";
import { CopyPass, KawaseBlurPass, KernelSize } from "postprocessing";
import { fragmentGlassShader, vertexGlassShader } from "./materials/glassMaterial";
import { fragmentLiquidShader, vertexLiquidShader } from "./materials/liquidMaterial";
import { fragmentCapShader, vertexCapShader } from "./materials/capMaterial";

const position = new THREE.Vector3();
const lastPos = new THREE.Vector3();
const rotation = new THREE.Quaternion();
const _rotTemp0 = new THREE.Quaternion();
const _rotTemp1 = new THREE.Quaternion();
const lastRot = new THREE.Quaternion();
const velocity = new THREE.Vector3();
const lastVelocity = new THREE.Vector3();
const angularVelocity = new THREE.Vector3();
const center = new THREE.Vector3();
const worldPos = new THREE.Vector3();
const fillAmount = new THREE.Vector3();
const compensation = new THREE.Vector3();
const _vTemp = new THREE.Vector3();
const vertex = new THREE.Vector3();


const getLowestPoint = (geometry, matrix) => {
  let lowestY = Infinity;
  const vertices = geometry.attributes.position.array;

  for (let i = 0; i < vertices.length; i += 3) {
    vertex.set(vertices[i], vertices[i + 1], vertices[i + 2]);
    vertex.applyMatrix4(matrix);

    if (vertex.y < lowestY) {
      lowestY = vertex.y;
    }
  }

  return lowestY;
};


function clamp(val, min, max) {
  return val < min ? min : val > max ? max : val;
}

function cUnMix(min, max, val) {
  return clamp((val - min) / (max - min), 0, 1);
}

function fit(val, min, max, toMin, toMax) {
  val = cUnMix(min, max, val);
  return toMin + val * (toMax - toMin);
}

function Bottle() {
  const time = useRef(0);
  const wobbleAmountToAddX = useRef(0);
  const wobbleAmountToAddZ = useRef(0);
  const sinewave = useRef(0);
  const light = useRef(null);
  const [shadowMap, setShadowMap] = useState(null);

  const { nodes } = useGLTF('/bottle.glb')
  useEffect(() => {
    nodes.Coca_Outside.geometry.computeBoundingBox();
    nodes.Coca_Outside.geometry.boundingBox.getCenter(center)
  }, [nodes])

  const tassoni = useTexture("/tassoni.png");
  const lut = useTexture("/lut.png");
  const diffuse = useTexture("/diffuse2.png");
  diffuse.generateMipmaps = false;
  const specular = useTexture("/specular2.png");
  specular.generateMipmaps = false;

  const copyPass = useState(() => new CopyPass())[0];

  const liquidUniforms = useState(
    () => ({
      u_resolution: {value: new THREE.Vector2()},
      u_sceneMap: {value: null},
      u_position: {value: new THREE.Vector3()},
      u_fillAmount: {value: new THREE.Vector3()},
      u_wobbleX: {value: 0},
      u_wobbleZ: {value: 0},
      u_time: {value: 0},
      u_diffuse: {value: null},
      u_specular: {value: null},
      u_lut: {value: null},
      u_impulse: {value: 0},
      u_color: {value: new THREE.Color("#FFD733")},
      ...THREE.UniformsUtils.merge([THREE.UniformsLib.lights])
    })
  )[0]
  
  const glassUniforms = useState(
    () => ({
      u_resolution: {value: new THREE.Vector2()},
      u_sceneMap: {value: null},
      u_diffuse: {value: null},
      u_specular: {value: null},
      u_lut: {value: null},
      u_color: {value: new THREE.Color("#aaCDaa")},
      ...THREE.UniformsUtils.merge([THREE.UniformsLib.lights])
    })
  )[0]

  const blurPass = useState(
    () => new KawaseBlurPass({ kernelSize: KernelSize.VERY_SMALL })
  )[0];
  const blurRT = useState(
    () => new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false })
  )[0];

  const [ref, api] = useCylinder(() => BOTTLE_BODY_PROPS);
  const bind = useDragConstraint(ref);
  useEffect(() => {
    const vel = new THREE.Vector3();
    const prevVel = new THREE.Vector3();
    const temp = new THREE.Vector3();
    if (api && api.velocity) {
      api.velocity.subscribe((v) => {
        vel.set(v[0], v[1], v[2]);
        temp.copy(prevVel).sub(vel);
        if (vel.y > 0 && prevVel.y < 0 && temp.length() > 10) {
          liquidUniforms.u_impulse.value += temp.length() / 30
        }
        prevVel.copy(vel);
      })
    }
  }, [api])

  const onBeforeRender = (gl) => {
    const currentRT = gl.getRenderTarget();
    if (!currentRT) return;
    const width = currentRT.width;
    const height = currentRT.height;

    
    copyPass.setSize(width, height);
    copyPass.fullscreenMaterial.inputBuffer = currentRT.texture;
		gl.setRenderTarget(copyPass.renderTarget);
		gl.render(copyPass.scene, copyPass.camera);
    gl.setRenderTarget(currentRT);

    glassUniforms.u_resolution.value.set(width, height);
    glassUniforms.u_sceneMap.value = copyPass.renderTarget.texture;
  };

  const onBeforeRenderBlur = (gl) => {
    const currentRT = gl.getRenderTarget();
    if (!currentRT) return;

    const width = Math.floor(0.5 * currentRT.width);
    const height = Math.floor(0.5 * currentRT.height);
    
    blurPass.setSize(width, height);
    blurRT.setSize(width, height);
    blurPass.render(gl, currentRT, blurRT);
    gl.setRenderTarget(currentRT);

    liquidUniforms.u_resolution.value.set(width, height);
    liquidUniforms.u_sceneMap.value = blurRT.texture;
  };


  console.log(shadowMap)

  useFrame((_, dt) => {
    if(light.current?.shadow?.map?.texture && !shadowMap) {
      setShadowMap(light.current?.shadow?.map?.texture)
    }

    ref.current.updateWorldMatrix(false, true);
    time.current += dt;
    const delta = dt
    
    const recovery = 2;
    const thickness = 0.05;
    const wobbleSpeed = 0.5;
    const maxWobble = 0.035;

    liquidUniforms.u_impulse.value *= 0.995

    wobbleAmountToAddX.current = lerp(wobbleAmountToAddX.current, 0, delta * recovery);
    wobbleAmountToAddZ.current = lerp(wobbleAmountToAddZ.current, 0, delta * recovery);
    
    const pulse = 2 * Math.PI * wobbleSpeed;
    sinewave.current = lerp(sinewave.current, Math.sin(pulse * time.current), delta * clamp(velocity.length() + angularVelocity.length(), thickness, 10));
    const wobbleAmountX = wobbleAmountToAddX.current * sinewave.current;
    const wobbleAmountZ = wobbleAmountToAddZ.current * sinewave.current;

    position.setFromMatrixPosition(ref.current.matrix);
    velocity.copy(lastPos).sub(position).divideScalar(delta);
    
    rotation.setFromRotationMatrix(ref.current.matrix);
    const q = _rotTemp0.copy(rotation).multiply(_rotTemp1.copy(lastRot).invert());

    // Check if there's significant rotation
    if (Math.abs(q.w) > 1023.5 / 1024.0) {
      angularVelocity.set(0, 0, 0);
    } else {
      let gain;
      let angle;
  
      // Handle negative and positive w cases
      if (q.w < 0) {
        angle = Math.acos(-q.w);
        gain = -2.0 * angle / (Math.sin(angle) * dt); // Assuming 60fps for deltaTime
      } else {
        angle = Math.acos(q.w);
        gain = 2.0 * angle / (Math.cos(angle) * dt);
      }
  
      // Calculate angular velocity components
      angularVelocity.set(
        q.x * gain,
        q.y * gain, 
        q.z * gain
      );
  
      // Check for NaN and return zero vector if found
      if (isNaN(angularVelocity.z)) {
        angularVelocity.set(0, 0, 0);
      }
    }

    wobbleAmountToAddX.current += clamp(
      (velocity.x + angularVelocity.z + 0.2 * angularVelocity.y) * maxWobble,
      -maxWobble,
      maxWobble
    );
    wobbleAmountToAddZ.current += clamp(
      (velocity.z + angularVelocity.x + 0.2 * angularVelocity.y) * maxWobble,
      -maxWobble,
      maxWobble
    );

    worldPos.copy(center).applyMatrix4(ref.current.matrix);
    const lowestPoint = getLowestPoint(nodes.Coca_Outside.geometry, ref.current.matrix);
    _vTemp.copy(worldPos)
    _vTemp.y -= lowestPoint;
    compensation.lerp(_vTemp, dt * 10);
    
    fillAmount.y =  fit(compensation.y, 10, 3, -10, -10.5);

    lastPos.copy(position);
    lastRot.copy(rotation);
    lastVelocity.copy(velocity);
    
    liquidUniforms.u_position.value.copy(position);
    liquidUniforms.u_fillAmount.value.copy(fillAmount);
    liquidUniforms.u_wobbleX.value = wobbleAmountX;
    liquidUniforms.u_wobbleZ.value = wobbleAmountZ;
    liquidUniforms.u_time.value = time.current;
    
    glassUniforms.u_diffuse.value = diffuse;
    glassUniforms.u_specular.value = specular;
    glassUniforms.u_lut.value = lut;

    liquidUniforms.u_diffuse.value = diffuse;
    liquidUniforms.u_specular.value = specular;
    liquidUniforms.u_lut.value = lut;
  });

  return (
    <>
      <group ref={ref} dispose={null} {...bind}>
        <group position={[0, 10.01, 0]}>
          <mesh geometry={nodes.Bottle_Cap.geometry} renderOrder={0}  >
            <shaderMaterial lights uniforms={glassUniforms} vertexShader={vertexCapShader} fragmentShader={fragmentCapShader} />
          </mesh>
          <mesh geometry={nodes.Bottle_Cap.geometry} renderOrder={5} castShadow >
            <shaderMaterial lights uniforms={glassUniforms} vertexShader={vertexCapShader} fragmentShader={fragmentCapShader} />
          </mesh>
        </group>
        <mesh visible={true} geometry={nodes.Coca_Outside.geometry} position={[0, -0.04, 0]} renderOrder={1} onBeforeRender={onBeforeRender} castShadow>
          <shaderMaterial lights uniforms={glassUniforms} vertexShader={vertexGlassShader} fragmentShader={fragmentGlassShader} side={THREE.BackSide} />
        </mesh>
        <mesh visible={true} geometry={nodes.Coca_Liquid.geometry} position={[0, -1.312, 0]} renderOrder={2} onBeforeRender={onBeforeRenderBlur} castShadow >
          <shaderMaterial lights uniforms={liquidUniforms} vertexShader={vertexLiquidShader} fragmentShader={fragmentLiquidShader} side={THREE.DoubleSide} />
        </mesh>
        <mesh visible={true} geometry={nodes.Coca_Outside.geometry} position={[0, -0.04, 0]} renderOrder={3} onBeforeRender={onBeforeRender}>
          <shaderMaterial lights uniforms={glassUniforms} vertexShader={vertexGlassShader} fragmentShader={fragmentGlassShader} />
        </mesh>
        {/* <mesh geometry={nodes.Label.geometry} renderOrder={5} position={[1.69, 0.84, -0.01]}>
          <meshBasicMaterial map={tassoni} {...LABEL} side={2}/>
        </mesh> */}
      </group>

      <mesh visible={true} lights rotation-x={-Math.PI / 2} renderOrder={0} receiveShadow >
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial  color="red" side={THREE.DoubleSide} />
      </mesh>
      {shadowMap && <mesh visible={true} renderOrder={100} position={[-10, 10, 0]}  >
        <planeGeometry args={[10, 10]} />
        <meshBasicMaterial map={shadowMap} />
      </mesh>}
      <directionalLight ref={light} castShadow position={[10, 40, 10]} shadow-mapSize={[1024, 1024]}>
        <orthographicCamera attach="shadow-camera" args={[-40, 40, 40, -40, 0.1, 45]}  />
      </directionalLight>
      {shadowMap && <primitive object={light.current.target} />}
      {shadowMap && <cameraHelper args={[light.current.shadow.camera]} />}
    </>
  );
}

export default function (props) {
  return (
    <group {...props} dispose={null}>
      <Bottle />
    </group>
  );
}


useGLTF.preload('/bottle.glb')