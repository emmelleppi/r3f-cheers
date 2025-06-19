import { createRef } from "react";


export const BOTTLE_BODY_ARGS = [2.5, 3, 20, 32];
export const BOTTLE_BODY_PROPS = {
  mass: 1,
  args: BOTTLE_BODY_ARGS,
  position: [0, 20, 0],
  rotation: [0, -1.8, 0],
  linearDamping: 0.0,
  angularDamping: 0.75,
};

export const LIQUID_PARAMS = {
  recovery: 10,
  wobbleSpeed: 0.1,
  maxWobble: 0.03,
};

export const PLUG_TOP = {
  color: "green",
  metalness: 1,
  roughness: 1,
};

export const PLUG_BOTTOM = {
  metalness: 1,
  roughness: 0,
  clearcoat: 1,
};

export const BOTTLE = {
  metalness: 1,
  roughness: 0,
  clearcoat: 1,
  opacity: 0.15,
};

export const LABEL = {
  metalness: 0.2,
  roughness: 1,
  clearcoat: 0.5,
  clearcoatRoughness: 0.8,
  "map-center": [0.5, 0.5],
  "map-rotation": -Math.PI / 2,
  "map-repeat": [-1, 1],
};

export const savePassEnv = createRef();
export const savePassBackface = createRef();
