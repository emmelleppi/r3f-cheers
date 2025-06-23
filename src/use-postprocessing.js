import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  KernelSize,
  Resolution,
  SMAAEffect,
  VignetteEffect,
} from "postprocessing";

function usePostprocessing() {
  const { gl, scene, size, camera } = useThree();

  const [composer] = useMemo(() => {
    const composer = new EffectComposer(gl, {
      multisampling: 0,
      antialias: false,
      alpha: false,
    });
    const renderPass = new RenderPass(scene, camera);

    const BLOOM = new BloomEffect(
      {
        mipmapBlur:false,
        luminanceThreshold:0.9,
        luminanceSmoothing:0.05,
        intensity: 0,
        kernelSize: KernelSize.LARGE,
        resolutionScale: 0.5,
        resolutionX:Resolution.AUTO_SIZE,
        resolutionY:Resolution.AUTO_SIZE,
        width:Resolution.AUTO_SIZE,
        height:Resolution.AUTO_SIZE,
      }
    );

    composer.addPass(renderPass);
    composer.addPass(new EffectPass(camera, new SMAAEffect()));
    // composer.addPass(new EffectPass(camera, BLOOM));
    composer.addPass(new EffectPass(camera, new VignetteEffect()));

    return [composer, BLOOM];
  }, [gl, scene, camera]);

  useEffect(
    () => void composer.setSize(size.width, size.height),
    [composer, size]
  );

  useFrame((_, delta) => {
    composer.render(delta);
  }, 1);
}

export default usePostprocessing;
