export type MobileInteractionMode =
  | "idle"
  | "camera_pan"
  | "camera_pinch"
  | "layer_select"
  | "layer_drag"
  | "layer_resize"
  | "selection_net";

export type MobileInputState = {
  mode: MobileInteractionMode;
  touchCount: number;
  startPoint: { x: number; y: number } | null;
  lastPoint: { x: number; y: number } | null;
  targetLayerId: string | null;
};

export type MobileInputAction =
  | {
      type: "TOUCH_START";
      touchCount: number;
      point: { x: number; y: number } | null;
      targetLayerId?: string | null;
    }
  | { type: "TOUCH_MOVE"; touchCount: number; point: { x: number; y: number } | null }
  | { type: "TOUCH_END"; touchCount: number }
  | { type: "RESET" };

const DRAG_START_THRESHOLD_PX = 8;

const distanceBetween = (
  a: { x: number; y: number } | null,
  b: { x: number; y: number } | null,
) => {
  if (!a || !b) return 0;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
};

export const createMobileInputState = (): MobileInputState => ({
  mode: "idle",
  touchCount: 0,
  startPoint: null,
  lastPoint: null,
  targetLayerId: null,
});

export const reduceMobileInputState = (
  state: MobileInputState,
  action: MobileInputAction,
): MobileInputState => {
  switch (action.type) {
    case "TOUCH_START": {
      if (action.touchCount >= 2) {
        return {
          mode: "camera_pinch",
          touchCount: action.touchCount,
          startPoint: action.point,
          lastPoint: action.point,
          targetLayerId: null,
        };
      }
      if (action.touchCount === 1) {
        if (action.targetLayerId) {
          return {
            mode: "layer_select",
            touchCount: action.touchCount,
            startPoint: action.point,
            lastPoint: action.point,
            targetLayerId: action.targetLayerId,
          };
        }
        return {
          mode: "camera_pan",
          touchCount: action.touchCount,
          startPoint: action.point,
          lastPoint: action.point,
          targetLayerId: null,
        };
      }
      return createMobileInputState();
    }
    case "TOUCH_MOVE": {
      if (action.touchCount >= 2) {
        return {
          mode: "camera_pinch",
          touchCount: action.touchCount,
          startPoint: state.startPoint,
          lastPoint: action.point,
          targetLayerId: null,
        };
      }

      if (action.touchCount === 1) {
        if (
          (state.mode === "layer_select" || state.mode === "layer_drag") &&
          state.targetLayerId
        ) {
          const distance = distanceBetween(state.startPoint, action.point);
          const nextMode =
            distance >= DRAG_START_THRESHOLD_PX ? "layer_drag" : "layer_select";
          return {
            mode: nextMode,
            touchCount: action.touchCount,
            startPoint: state.startPoint,
            lastPoint: action.point,
            targetLayerId: state.targetLayerId,
          };
        }

        if (state.mode === "camera_pan" || state.mode === "camera_pinch") {
          return {
            mode: "camera_pan",
            touchCount: action.touchCount,
            startPoint: state.startPoint,
            lastPoint: action.point,
            targetLayerId: null,
          };
        }
      }

      return createMobileInputState();
    }
    case "TOUCH_END": {
      if (action.touchCount >= 2) {
        return {
          mode: "camera_pinch",
          touchCount: action.touchCount,
          startPoint: state.startPoint,
          lastPoint: state.lastPoint,
          targetLayerId: null,
        };
      }

      if (action.touchCount === 1) {
        if (state.mode === "camera_pinch") {
          return {
            mode: "camera_pan",
            touchCount: action.touchCount,
            startPoint: state.startPoint,
            lastPoint: state.lastPoint,
            targetLayerId: null,
          };
        }

        if (state.targetLayerId) {
          return {
            mode: "layer_select",
            touchCount: action.touchCount,
            startPoint: state.startPoint,
            lastPoint: state.lastPoint,
            targetLayerId: state.targetLayerId,
          };
        }
      }

      return createMobileInputState();
    }
    case "RESET":
      return createMobileInputState();
    default:
      return state;
  }
};

export const isCameraMode = (mode: MobileInteractionMode) =>
  mode === "camera_pan" || mode === "camera_pinch";

export const isLayerMode = (mode: MobileInteractionMode) =>
  mode === "layer_select" || mode === "layer_drag" || mode === "layer_resize";
