"use client";

import { useState } from "react";
import { Layer, LayerType, ImageLayer, VideoLayer } from "@/types/canvas";
import { ReviewSessionModal } from "./ReviewSessionModal";
import { 
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator
} from "@/components/ui/context-menu";
import { Play, Copy, Trash2, Edit, Image, Video } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";

interface LayerContextMenuProps {
  children: React.ReactNode;
  layer: Layer;
  boardId: Id<"boards">;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onEdit?: () => void;
}

export function LayerContextMenu({
  children,
  layer,
  boardId,
  onDelete,
  onDuplicate,
  onEdit
}: LayerContextMenuProps) {
  const [showReviewModal, setShowReviewModal] = useState(false);

  // Check if layer supports review (only image and video layers)
  const supportsReview = layer.type === LayerType.Image || layer.type === LayerType.Video;

  const getAssetInfo = () => {
    if (layer.type === LayerType.Image) {
      const imageLayer = layer as ImageLayer;
      const layerId = `${imageLayer.x}_${imageLayer.y}_${imageLayer.width}_${imageLayer.height}`;
      return {
        id: layerId,
        type: "image" as const,
        url: imageLayer.url || "",
        name: `Immagine ${layerId.slice(-4)}`
      };
    } else if (layer.type === LayerType.Video) {
      const videoLayer = layer as VideoLayer;
      const layerId = `${videoLayer.x}_${videoLayer.y}_${videoLayer.width}_${videoLayer.height}`;
      return {
        id: layerId,
        type: "video" as const,
        url: videoLayer.url || "",
        name: `Video ${layerId.slice(-4)}`
      };
    }
    return null;
  };

  const assetInfo = getAssetInfo();

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          {supportsReview && assetInfo && (
            <>
              <ContextMenuItem
                onClick={() => setShowReviewModal(true)}
                className="flex items-center gap-2"
              >
                <div className="w-4 h-4 bg-gradient-to-br from-gray-800 to-black rounded flex items-center justify-center text-white font-bold text-xs">
                  R
                </div>
                <span>Apri in Review Mode</span>
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          
          {onEdit && (
            <ContextMenuItem
              onClick={onEdit}
              className="flex items-center gap-2"
            >
              <Edit className="h-4 w-4" />
              <span>Modifica</span>
            </ContextMenuItem>
          )}
          
          {onDuplicate && (
            <ContextMenuItem
              onClick={onDuplicate}
              className="flex items-center gap-2"
            >
              <Copy className="h-4 w-4" />
              <span>Duplica</span>
            </ContextMenuItem>
          )}
          
          {onDelete && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                onClick={onDelete}
                className="flex items-center gap-2 text-red-600 focus:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
                <span>Elimina</span>
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {/* Review Session Modal */}
      {showReviewModal && assetInfo && (
        <ReviewSessionModal
          isOpen={showReviewModal}
          onClose={() => setShowReviewModal(false)}
          boardId={boardId}
          primaryAsset={assetInfo}
          availableAssets={[]} // TODO: Get other assets from board
        />
      )}
    </>
  );
}
