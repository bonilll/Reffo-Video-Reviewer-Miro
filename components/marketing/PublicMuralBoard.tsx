import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { BoardRuntimeSwitch } from "@/app/board/[boardId]/_components/board-runtime-switch";
import { InfoButton } from "@/app/board/[boardId]/_components/info-button";
import { BoardSettingsProvider } from "@/app/contexts/BoardSettingsContext";
import { CameraProvider } from "@/app/contexts/CameraContext";
import { UploadOverlay } from "@/components/UploadOverlay";
import { Room } from "@/components/room";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const PUBLIC_MURAL_TITLE = "The Mural";

export function PublicMuralBoard() {
  const muralBoard = useQuery(api.publicMural.getPublicMuralBoard, {});
  const ensurePublicMuralBoard = useMutation(api.publicMural.ensurePublicMuralBoard);
  const [localBoardId, setLocalBoardId] = useState<Id<"boards"> | null>(null);
  const isCreatingRef = useRef(false);

  const activeBoardId = muralBoard?._id ?? localBoardId ?? null;

  useEffect(() => {
    if (muralBoard?._id) {
      setLocalBoardId(muralBoard._id);
    }
  }, [muralBoard?._id]);

  useEffect(() => {
    if (muralBoard !== null || isCreatingRef.current || localBoardId) {
      return;
    }
    isCreatingRef.current = true;
    void ensurePublicMuralBoard({ title: PUBLIC_MURAL_TITLE })
      .then((boardId) => {
        setLocalBoardId(boardId);
      })
      .finally(() => {
        isCreatingRef.current = false;
      });
  }, [ensurePublicMuralBoard, localBoardId, muralBoard]);

  if (!activeBoardId) {
    return <div className="h-full w-full bg-[#f4f6fa]" />;
  }

  return (
    <Room
      roomId={activeBoardId}
      fallback={<div className="h-full w-full bg-[#f4f6fa]" />}
    >
      <CameraProvider>
        <BoardSettingsProvider boardId={activeBoardId}>
          <BoardRuntimeSwitch
            boardId={activeBoardId}
            userRole="editor"
            publicHomeMode
          />
          <UploadOverlay boardId={activeBoardId} userRole="editor" />
          <InfoButton />
        </BoardSettingsProvider>
      </CameraProvider>
    </Room>
  );
}
