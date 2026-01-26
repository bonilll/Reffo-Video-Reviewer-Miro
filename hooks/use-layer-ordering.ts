import { useSelf, useMutation } from "@/liveblocks.config";
import { LayerType } from "@/types/canvas";

export const useLayerOrdering = () => {
  const selection = useSelf((me) => me.presence.selection);

  // Sposta il layer selezionato in primo piano
  const bringToFront = useMutation(
    ({ storage }) => {
      if (selection.length === 0) return;

      const liveLayerIds = storage.get("layerIds");
      const liveLayers = storage.get("layers");
      
      // Separate frames from non-frames
      const allLayerIds = [...liveLayerIds.toArray()];
      const frames: string[] = [];
      const nonFrames: string[] = [];
      
      for (const layerId of allLayerIds) {
        const layer = liveLayers.get(layerId);
        if (layer && layer.get("type") === LayerType.Frame) {
          frames.push(layerId);
        } else {
          nonFrames.push(layerId);
        }
      }
      
      // Handle frame and non-frame selections differently
      for (const layerId of selection) {
        const layer = liveLayers.get(layerId);
        if (!layer) continue;
        
        if (layer.get("type") === LayerType.Frame) {
          // For frames: move to front among frames only (but still behind non-frames)
          const frameIndex = frames.indexOf(layerId);
          if (frameIndex !== -1) {
            frames.splice(frameIndex, 1);
            frames.push(layerId); // Move to end of frames array
          }
        } else {
          // For non-frames: move to front among non-frames
          const nonFrameIndex = nonFrames.indexOf(layerId);
          if (nonFrameIndex !== -1) {
            nonFrames.splice(nonFrameIndex, 1);
            nonFrames.push(layerId); // Move to end of non-frames array
          }
        }
      }
      
      // Rebuild layerIds with frames first, then non-frames
      liveLayerIds.clear();
      for (const frameId of frames) {
        liveLayerIds.push(frameId);
      }
      for (const nonFrameId of nonFrames) {
        liveLayerIds.push(nonFrameId);
      }
    },
    [selection]
  );

  // Sposta il layer selezionato in secondo piano
  const sendToBack = useMutation(
    ({ storage }) => {
      if (selection.length === 0) return;

      const liveLayerIds = storage.get("layerIds");
      const liveLayers = storage.get("layers");
      
      // Separate frames from non-frames
      const allLayerIds = [...liveLayerIds.toArray()];
      const frames: string[] = [];
      const nonFrames: string[] = [];
      
      for (const layerId of allLayerIds) {
        const layer = liveLayers.get(layerId);
        if (layer && layer.get("type") === LayerType.Frame) {
          frames.push(layerId);
        } else {
          nonFrames.push(layerId);
        }
      }
      
      // Handle frame and non-frame selections differently
      for (const layerId of selection) {
        const layer = liveLayers.get(layerId);
        if (!layer) continue;
        
        if (layer.get("type") === LayerType.Frame) {
          // For frames: move to back among frames only
          const frameIndex = frames.indexOf(layerId);
          if (frameIndex !== -1) {
            frames.splice(frameIndex, 1);
            frames.unshift(layerId); // Move to beginning of frames array
          }
        } else {
          // For non-frames: move to back among non-frames
          const nonFrameIndex = nonFrames.indexOf(layerId);
          if (nonFrameIndex !== -1) {
            nonFrames.splice(nonFrameIndex, 1);
            nonFrames.unshift(layerId); // Move to beginning of non-frames array
          }
        }
      }
      
      // Rebuild layerIds with frames first, then non-frames
      liveLayerIds.clear();
      for (const frameId of frames) {
        liveLayerIds.push(frameId);
      }
      for (const nonFrameId of nonFrames) {
        liveLayerIds.push(nonFrameId);
      }
    },
    [selection]
  );

  return {
    bringToFront,
    sendToBack
  };
}; 