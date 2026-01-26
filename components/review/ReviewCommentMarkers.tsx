"use client";

import { ReviewComment, ReviewCanvasState } from "@/types/canvas";
import { MessageSquare } from "lucide-react";

interface ReviewCommentMarkersProps {
  comments: ReviewComment[];
  canvasState: ReviewCanvasState;
  onCommentClick?: (comment: ReviewComment) => void;
  theme?: 'dark' | 'light';
}

export function ReviewCommentMarkers({
  comments,
  canvasState,
  onCommentClick,
  theme = 'light'
}: ReviewCommentMarkersProps) {
  // Dynamic theme classes
  const themeClasses = {
    markerBg: theme === 'dark' ? 'bg-blue-600' : 'bg-blue-500',
    markerText: 'text-white', // Sempre bianco per i marker per contrasto
    badgeBg: theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100',
    badgeText: theme === 'dark' ? 'text-white' : 'text-gray-900',
    badgeBorder: theme === 'dark' ? 'border-gray-600' : 'border-gray-300',
  };

  return (
    <div 
      className="absolute inset-0"
      style={{
        transform: `scale(${canvasState.zoom}) translate(${canvasState.pan.x}px, ${canvasState.pan.y}px)`,
        pointerEvents: 'none'
      }}
    >
      {comments.map((comment, index) => (
        <div
          key={comment._id}
          className={`absolute w-6 h-6 ${themeClasses.markerBg} rounded-full cursor-pointer hover:scale-110 transition-transform flex items-center justify-center shadow-lg pointer-events-auto comment-bubble`}
          style={{
            left: (() => {
              const el = document.querySelector('canvas') as HTMLCanvasElement | null;
              if (!el) return `${comment.position.x}px`;
              const rect = el.getBoundingClientRect();
              const isNormalized = comment.position.x >= 0 && comment.position.x <= 1 && comment.position.y >= 0 && comment.position.y <= 1;
              const px = isNormalized ? comment.position.x * rect.width : comment.position.x;
              return `${px}px`;
            })(),
            top: (() => {
              const el = document.querySelector('canvas') as HTMLCanvasElement | null;
              if (!el) return `${comment.position.y}px`;
              const rect = el.getBoundingClientRect();
              const isNormalized = comment.position.x >= 0 && comment.position.x <= 1 && comment.position.y >= 0 && comment.position.y <= 1;
              const py = isNormalized ? comment.position.y * rect.height : comment.position.y;
              return `${py}px`;
            })(),
            transform: 'translate(-50%, -50%)'
          }}
          onClick={() => {
            // Always allow direct click to open comment popup
            onCommentClick?.(comment);
          }}
          title={`Commento: ${comment.content.substring(0, 50)}...`}
        >
          <MessageSquare className={`h-3 w-3 ${themeClasses.markerText}`} />
          
          {/* Comment number badge */}
          <div className={`absolute -top-1 -right-1 w-4 h-4 ${themeClasses.badgeBg} ${themeClasses.badgeText} text-xs rounded-full flex items-center justify-center border ${themeClasses.badgeBorder}`}>
            {index + 1}
          </div>
        </div>
      ))}
    </div>
  );
}
