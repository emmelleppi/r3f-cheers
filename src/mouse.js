import { useEffect, useCallback, createRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { usePointToPointConstraint, useSphere } from "@react-three/cannon";

const cursor = createRef();

export function useDragConstraint(body) {
  const [a, b, api] = usePointToPointConstraint(cursor, body, {
    pivotA: [0, 10, 0],
    pivotB: [0, 10, 0],
  });
  
  const onPointerUp = useCallback((e) =>  {
    e.target.releasePointerCapture(e.pointerId)
    api.disable()
  }
  , [api]);

  const onPointerDown = useCallback(
    (e) => {
      e.stopPropagation();
      e.target.setPointerCapture(e.pointerId);
      api.enable();
    },
    [api]
  );

  useEffect(() => void api.disable(), []);

  return { onPointerUp, onPointerDown };
}

// A physical sphere tied to mouse coordinates without visual representation
export function Mouse() {
  const { viewport } = useThree();
  const [, api] = useSphere(() => ({ collisionFilterMask: 0, type: 'Kinematic', mass: 0, args: [0.5] }), cursor);
  return useFrame((state) => {
    api.position.set(
      (state.pointer.x * state.viewport.width) / 2,
      (state.pointer.y * state.viewport.height) / 2,
      0
    )
  }
  );
}
