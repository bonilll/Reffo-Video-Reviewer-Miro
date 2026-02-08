"use client";

import { useState, useEffect, useRef } from "react";
import { ReviewComment } from "@/types/canvas";
import { CheckCircle } from "lucide-react";
import { CreateCommentInput } from "./CreateCommentInput";

interface CommentBubbleProps {
  comment: ReviewComment;
  replies: ReviewComment[];
  onClick: (e: React.MouseEvent) => void;
  isSelected?: boolean;
  theme?: 'dark' | 'light';
  scale?: number;
  category?: string;
  isDropdownOpen?: boolean;
  // New props for anchored popup
  showPopup?: boolean;
  onPopupClose?: () => void;
  onCommentUpdate?: () => void;
  sessionId?: string;
  assetId?: string;
  // Drag state
  isDragging?: boolean;
  // Canvas state for tool detection
  canvasState?: any;
}

export function CommentBubble({
  comment,
  replies,
  onClick,
  isSelected = false,
  theme = 'light',
  scale = 1,
  category = 'default',
  isDropdownOpen = false,
  showPopup = false,
  onPopupClose,
  onCommentUpdate,
  sessionId,
  assetId,
  isDragging = false,
  canvasState
}: CommentBubbleProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ placement: 'bottom', transform: 'translateX(-50%)', verticalAdjustment: '' });
  const bubbleRef = useRef<HTMLDivElement>(null);
  
  // Calculate optimal popup position when showPopup changes
  useEffect(() => {
    if (showPopup && bubbleRef.current) {
      const calculatePosition = () => {
        const bubbleRect = bubbleRef.current!.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // Popup dimensions (estimated)
        const popupWidth = 320;
        const popupHeight = 400;
        const offset = 8;
        
        // Calculate available space in all directions
        const spaceRight = viewportWidth - bubbleRect.right - offset;
        const spaceLeft = bubbleRect.left - offset;
        const spaceBelow = viewportHeight - bubbleRect.bottom - offset;
        const spaceAbove = bubbleRect.top - offset;
        
        
        // For horizontal placements, check if we have enough vertical space
        const bubbleCenter = bubbleRect.top + bubbleRect.height / 2;
        const spaceAboveCenter = bubbleCenter - offset;
        const spaceBelowCenter = viewportHeight - bubbleCenter - offset;
        const minVerticalSpaceNeeded = popupHeight / 2;
        
        let placement = 'bottom';
        let transform = 'translateX(-50%)';
        let verticalAdjustment = '';
        
        // Determine best placement based on available space
        // Priority: try to fit completely in preferred order: below > above > right > left
        
        // First try horizontal placement if bubble is close to edges
        const distanceFromLeft = bubbleRect.left;
        const distanceFromRight = viewportWidth - bubbleRect.right;
        const distanceFromTop = bubbleRect.top;
        const distanceFromBottom = viewportHeight - bubbleRect.bottom;
        
        // If bubble is close to left or right edge, prioritize horizontal placement
        const closeToLeftEdge = distanceFromLeft < viewportWidth * 0.3;
        const closeToRightEdge = distanceFromRight < viewportWidth * 0.3;
        
        if ((closeToLeftEdge || closeToRightEdge) && (spaceRight >= popupWidth || spaceLeft >= popupWidth)) {
          // Prioritize horizontal placement for edge bubbles
          if (spaceRight >= popupWidth && (!closeToRightEdge || spaceRight > spaceLeft)) {
            placement = 'right';
            transform = 'translateY(-50%)';
          } else if (spaceLeft >= popupWidth) {
            placement = 'left';
            transform = 'translateY(-50%)';
          }
        }
        // Standard priority: below > above > right > left
        else if (spaceBelow >= popupHeight + 20) {
          placement = 'bottom';
          transform = 'translateX(-50%)';
        } 
        else if (spaceAbove >= popupHeight + 20) {
          placement = 'top';
          transform = 'translateX(-50%)';
        }
        else if (spaceRight >= popupWidth + 20) {
          placement = 'right';
          transform = 'translateY(-50%)';
        }
        else if (spaceLeft >= popupWidth + 20) {
          placement = 'left';
          transform = 'translateY(-50%)';
        }
        // Fallback: use the direction with most space, even if it gets cut off
        else {
          const maxSpace = Math.max(spaceBelow, spaceAbove, spaceRight, spaceLeft);
          if (maxSpace === spaceRight) {
            placement = 'right';
            transform = 'translateY(-50%)';
          } else if (maxSpace === spaceLeft) {
            placement = 'left';
            transform = 'translateY(-50%)';
          } else if (maxSpace === spaceBelow) {
            placement = 'bottom';
            transform = 'translateX(-50%)';
          } else {
            placement = 'top';
            transform = 'translateX(-50%)';
          }
        }
        
        setPopupPosition({ placement, transform, verticalAdjustment });
      };
      
      calculatePosition();
      window.addEventListener('resize', calculatePosition);
      return () => window.removeEventListener('resize', calculatePosition);
    }
  }, [showPopup]);
  
  // Get position styles based on placement
  const getPopupStyles = () => {
    const baseStyles = {
      position: 'absolute' as const,
      zIndex: 999999, // Maximum z-index for visibility
    };
    
    switch (popupPosition.placement) {
      case 'bottom':
        return {
          ...baseStyles,
          top: '100%',
          left: '50%',
          transform: popupPosition.transform,
          marginTop: '8px',
        };
      case 'top':
        return {
          ...baseStyles,
          bottom: '100%',
          left: '50%',
          transform: popupPosition.transform,
          marginBottom: '8px',
        };
      case 'right':
        return {
          ...baseStyles,
          left: '100%',
          top: '50%',
          transform: popupPosition.transform,
          marginLeft: '8px',
          maxHeight: '400px',
          overflow: 'hidden',
        };
      case 'left':
        return {
          ...baseStyles,
          right: '100%',
          top: '50%',
          transform: popupPosition.transform,
          marginRight: '8px',
          maxHeight: '400px',
          overflow: 'hidden',
        };
      default:
        return {
          ...baseStyles,
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginTop: '8px',
        };
    }
  };
  
  // Smaller, more elegant sizing
  const getSize = () => {
    const viewportWidth = window.innerWidth;
    const baseSize = viewportWidth < 640 ? 24 : viewportWidth < 1024 ? 28 : 32;
    const scaledSize = baseSize / Math.max(scale, 0.3);
    return {
      size: Math.max(20, Math.min(36, scaledSize)),
      fontSize: Math.max(8, Math.min(12, scaledSize * 0.35)),
      badgeSize: Math.max(12, Math.min(18, scaledSize * 0.45))
    };
  };

  const { size, fontSize, badgeSize } = getSize();
  
  // Modern color system with better accessibility
  const categoryColors: any = {
    default: {
      bg: 'bg-gradient-to-br from-blue-500 to-blue-600',
      border: 'border-blue-400/50',
      hover: 'hover:from-blue-600 hover:to-blue-700',
      glow: 'shadow-blue-500/25'
    },
    red: {
      bg: 'bg-gradient-to-br from-red-500 to-red-600',
      border: 'border-red-400/50',
      hover: 'hover:from-red-600 hover:to-red-700',
      glow: 'shadow-red-500/25'
    },
    green: {
      bg: 'bg-gradient-to-br from-emerald-500 to-emerald-600',
      border: 'border-emerald-400/50',
      hover: 'hover:from-emerald-600 hover:to-emerald-700',
      glow: 'shadow-emerald-500/25'
    },
    yellow: {
      bg: 'bg-gradient-to-br from-amber-500 to-amber-600',
      border: 'border-amber-400/50',
      hover: 'hover:from-amber-600 hover:to-amber-700',
      glow: 'shadow-amber-500/25'
    },
    purple: {
      bg: 'bg-gradient-to-br from-purple-500 to-purple-600',
      border: 'border-purple-400/50',
      hover: 'hover:from-purple-600 hover:to-purple-700',
      glow: 'shadow-purple-500/25'
    },
    pink: {
      bg: 'bg-gradient-to-br from-pink-500 to-pink-600',
      border: 'border-pink-400/50',
      hover: 'hover:from-pink-600 hover:to-pink-700',
      glow: 'shadow-pink-500/25'
    },
    orange: {
      bg: 'bg-gradient-to-br from-orange-500 to-orange-600',
      border: 'border-orange-400/50',
      hover: 'hover:from-orange-600 hover:to-orange-700',
      glow: 'shadow-orange-500/25'
    },
    gray: {
      bg: 'bg-gradient-to-br from-gray-500 to-gray-600',
      border: 'border-gray-400/50',
      hover: 'hover:from-gray-600 hover:to-gray-700',
      glow: 'shadow-gray-500/25'
    }
  };
  
  const colorScheme = categoryColors[category] || categoryColors.default;
  const replyCount = replies.length;
  const hasReplies = replyCount > 0;
  const isResolved = comment.status === 'resolved';
  
  // User initials helper
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };
  
  const userInitials = getInitials(comment.createdByName);

  // Check if selection tool is active
  const isSelectionToolActive = canvasState && canvasState.tool === "select";

  // Debug log for popup state
  
  return (
    <div 
      ref={bubbleRef}
      className="relative group comment-bubble"
      data-comment-id={comment._id}
      style={{ 
        zIndex: 20,
        // Make the entire container the expanded area (reduced by 25%)
        width: size + 22,
        height: size + 22,
        left: -11,
        top: -11,
        position: 'relative'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Drag Area Indicator - Shows on hover */}
      {isHovered && !isDragging && !showPopup && (
        <div
          className="absolute inset-0 rounded-full transition-all duration-300 ease-out"
          style={{
            width: size + 22,
            height: size + 22,
            left: 0,
            top: 0,
            pointerEvents: 'none',
            background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 70%, transparent 100%)',
            border: '2px solid rgba(255,255,255,0.25)',
            backdropFilter: 'blur(4px)',
            boxShadow: `
              0 0 0 1px rgba(255,255,255,0.1),
              inset 0 0 20px rgba(255,255,255,0.05),
              0 4px 15px rgba(0,0,0,0.1)
            `
          }}
        >
          {/* Inner ring for better definition */}
          <div
            className="absolute inset-2 rounded-full border border-white/15"
            style={{
              background: 'radial-gradient(circle, transparent 60%, rgba(255,255,255,0.02) 100%)'
            }}
          />
        </div>
      )}

      {/* Active Drag Indicator */}
      {isDragging && (
        <div
          className="absolute rounded-full transition-all duration-200 ease-out"
          style={{
            width: size + 26,
            height: size + 26,
            left: -2,
            top: -2,
            pointerEvents: 'none',
            background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, rgba(59,130,246,0.05) 70%, transparent 100%)',
            border: '3px solid rgba(59,130,246,0.4)',
            backdropFilter: 'blur(6px)',
            boxShadow: `
              0 0 0 2px rgba(59,130,246,0.2),
              inset 0 0 25px rgba(59,130,246,0.08),
              0 6px 20px rgba(59,130,246,0.15),
              0 0 40px rgba(59,130,246,0.1)
            `
          }}
        >
          {/* Inner ring with pulse effect */}
          <div
            className="absolute inset-3 rounded-full border-2 border-blue-300/30"
            style={{
              background: 'radial-gradient(circle, transparent 50%, rgba(59,130,246,0.03) 100%)',
              animation: 'pulse 2s infinite'
            }}
          />
        </div>
      )}

      {/* Main Comment Bubble */}
      <div
        className={`
          absolute rounded-full border-2 flex items-center justify-center
          text-white font-bold transition-all duration-300 ease-out
          backdrop-blur-sm select-none
          cursor-pointer
          ${colorScheme.bg} ${colorScheme.border} ${colorScheme.hover}
          ${isSelected 
            ? `ring-4 ring-blue-400/40 ring-offset-2 ring-offset-white/10 scale-110 ${colorScheme.glow} shadow-xl` 
            : `shadow-lg ${colorScheme.glow} hover:shadow-xl`
          }
          ${isDragging 
            ? 'scale-105 opacity-90 ring-2 ring-white/60 shadow-2xl' 
            : isHovered || isSelected ? 'scale-110' : 'hover:scale-105'
          }
          ${isDragging ? '' : 'active:scale-95'} transform-gpu
        `}
        style={{
          width: size,
          height: size,
          fontSize: fontSize,
          left: 11, // Center in the reduced expanded container
          top: 11,
          transform: isDragging 
            ? `scale(1.05)` 
            : isSelected || isHovered ? `scale(1.1)` : undefined,
        }}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          
          // Prevent click if currently dragging or just finished dragging
          if (isDragging) {
            return;
          }
          
          
          // SEMPRE apri il popup quando si clicca su un comment bubble
          // indipendentemente dal tool attivo
          const rect = e.currentTarget.getBoundingClientRect();
          const tooltipX = rect.left + rect.width / 2;
          const tooltipY = rect.top - 16; // Sopra la bubble come il tooltip
          
          // Crea un evento personalizzato con le coordinate del tooltip
          const customEvent = {
            ...e,
            tooltipPosition: { x: tooltipX, y: tooltipY }
          } as any;
          
          onClick(customEvent);
        }}
        onPointerDown={(e) => {
          // Previeni anche i pointer events per maggiore sicurezza
          e.stopPropagation();
          e.preventDefault();
        }}
        onMouseDown={(e) => {
          // Previeni sempre che il selector intercetti i click sui commenti
          e.stopPropagation();
          e.preventDefault();
        }}
        onPointerDown={(e) => {
          // Previeni anche i pointer events per maggiore sicurezza
          e.stopPropagation();
          e.preventDefault();
        }}
        title={`${comment.createdByName}: ${comment.content}`}
      >
        {/* Gradient overlay for depth */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-white/10 rounded-full pointer-events-none" />
        
        {/* User initials */}
        <span className="relative z-10 drop-shadow-sm">
          {userInitials}
        </span>
      </div>
      
      {/* Reply Count Badge */}
      {hasReplies && (
        <div
          className={`
            absolute bg-white text-gray-800 rounded-full 
            border-2 border-gray-100 flex items-center justify-center font-bold
            shadow-lg backdrop-blur-sm transition-all duration-300
            min-w-[${badgeSize}px] h-[${badgeSize}px]
            ${isHovered || isSelected ? 'scale-110' : ''}
            transform-gpu
          `}
          style={{
            fontSize: Math.max(10, badgeSize * 0.5),
            minWidth: badgeSize,
            height: badgeSize,
            left: 11 + size - 1, // Position relative to the centered bubble: 11px (bubble left) + size (bubble width) - 1px (overlap)
            top: 11 - 1, // Position relative to bubble top: 11px (bubble top) - 1px (slight overlap)
          }}
        >
          {replyCount > 99 ? '99+' : replyCount}
        </div>
      )}
      
      {/* Resolved Status Indicator */}
      {isResolved && (
        <div
          className={`
            absolute bg-emerald-500 rounded-full 
            border-2 border-white flex items-center justify-center
            shadow-lg transition-all duration-300
            ${isHovered || isSelected ? 'scale-110' : ''}
            transform-gpu
          `}
          style={{
            width: badgeSize * 0.75,
            height: badgeSize * 0.75,
            left: 11 + size - 1, // Position relative to the centered bubble: 11px (bubble left) + size (bubble width) - 1px (overlap)
            top: 11 + size - 1, // Position relative to bubble bottom: 11px (bubble top) + size (bubble height) - 1px (overlap)
          }}
        >
          <CheckCircle 
            className="text-white" 
            style={{ 
              width: badgeSize * 0.5, 
              height: badgeSize * 0.5 
            }} 
          />
        </div>
      )}
      
      
      {/* Intelligently Positioned Popup */}
      {showPopup && (
        <div 
          style={{
            ...getPopupStyles(),
            // Adjust positioning to be relative to the centered bubble
            left: getPopupStyles().left === '50%' ? 11 + size/2 : getPopupStyles().left, // 11px (bubble left) + size/2 (bubble center)
            top: getPopupStyles().top === '50%' ? 11 + size/2 : getPopupStyles().top,
            zIndex: 1000,
            pointerEvents: 'auto'
          }}
        >
          <CreateCommentInput
            mode="view"
            sessionId={sessionId || ""}
            assetId={assetId || ""}
            frameNumber={comment.frameNumber}
            frameTimestamp={comment.frameTimestamp}
            position={comment.position}
            existingComment={comment}
            replies={replies}
            onCancel={onPopupClose || (() => {})}
            onCommentUpdate={onCommentUpdate || (() => {})}
            theme={theme}
          />
        </div>
      )}
    </div>
  );
} 