import { useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { debounce } from "lodash";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Camera } from "@/types/canvas";

interface UseCameraPersistenceProps {
  boardId: string;
  camera: Camera;
  onCameraLoad?: (camera: Camera) => void;
}

export const useCameraPersistence = ({ 
  boardId, 
  camera, 
  onCameraLoad 
}: UseCameraPersistenceProps) => {
  const hasCameraLoaded = useRef(false);
  
  // Query to get saved camera position
  const savedCamera = useQuery(api.board.getBoardCamera, { 
    id: boardId as Id<"boards"> 
  });
  
  // Mutation to save camera position
  const saveCameraMutation = useMutation(api.board.saveBoardCamera);
  
  // Debounced save function to avoid too many database writes
  const debouncedSaveCamera = useCallback(
    debounce(async (cameraState: Camera) => {
      try {
        await saveCameraMutation({
          id: boardId as Id<"boards">,
          camera: {
            x: cameraState.x,
            y: cameraState.y,
            scale: cameraState.scale
          }
        });
        console.log("📷 Camera position saved to Convex:", cameraState);
      } catch (error) {
        console.error("❌ Error saving camera position:", error);
      }
    }, 1000), // Save after 1 second of inactivity
    [boardId, saveCameraMutation]
  );
  
  // Load saved camera position on component mount
  useEffect(() => {
    if (savedCamera && !hasCameraLoaded.current && onCameraLoad) {
      console.log("📷 Loading saved camera position from Convex:", savedCamera);
      onCameraLoad(savedCamera);
      hasCameraLoaded.current = true;
    }
  }, [savedCamera, onCameraLoad]);
  
  // Save camera position when it changes
  useEffect(() => {
    // Only save if camera has been loaded to avoid overwriting with initial values
    if (hasCameraLoaded.current) {
      debouncedSaveCamera(camera);
    }
  }, [camera, debouncedSaveCamera]);
  
  // Cleanup debounced function on unmount
  useEffect(() => {
    return () => {
      debouncedSaveCamera.cancel();
    };
  }, [debouncedSaveCamera]);
  
  return {
    savedCamera,
    hasCameraLoaded: hasCameraLoaded.current
  };
}; 