import React, { useState, useEffect, useRef } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Point } from '../types';
import { RenderedRect, normalizedToCanvas } from '../utils/geometry';

interface NewCommentPopoverProps {
  position: Point;
  renderedRect: RenderedRect;
  onSubmit: (text: string) => void;
  onCancel: () => void;
  isDark?: boolean;
}

const NewCommentPopover: React.FC<NewCommentPopoverProps> = ({ position, renderedRect, onSubmit, onCancel, isDark = true }) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const { user } = useUser();
  const avatar = user?.imageUrl || '';
  const displayName = user?.fullName || user?.primaryEmailAddress?.emailAddress || 'You';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      onSubmit(text.trim());
    } else {
      onCancel();
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        // Only cancel if text is empty, otherwise user might lose their draft
        if (!textareaRef.current?.value.trim()) {
            onCancel();
        }
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };

    setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
    }, 0);
    
    textareaRef.current?.focus();

    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onCancel]);
  
  const canvasPos = normalizedToCanvas(position, renderedRect);
  
  const style: React.CSSProperties = {
    position: 'absolute',
    top: `${canvasPos.y + 15}px`, // Position slightly below the click point
    left: `${canvasPos.x}px`,
    transform: 'translateX(-50%)',
    zIndex: 40,
  };
  
  // Auto-grow textarea height with content
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.5)) + 'px';
  }, [text]);

  return (
    <div ref={popoverRef} style={style} className={`w-80 rounded-2xl shadow-2xl flex flex-col relative max-w-[90vw] backdrop-blur border ${isDark ? 'bg-black/80 border-white/10' : 'bg-white border-gray-200'}`} onClick={e => e.stopPropagation()}>
        <div className={`absolute left-1/2 -top-[5px] -ml-[5px] w-2.5 h-2.5 transform rotate-45 ${isDark ? 'bg-black/80 border-t border-l border-white/10' : 'bg-white border-t border-l border-gray-200'}`}></div>
        
        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-4">
            <div className="flex items-start gap-3">
                <img src={avatar} alt={displayName} className="w-8 h-8 rounded-full border border-white/10" />
                <div className="flex-1">
                    <div className="font-semibold text-white text-sm">{displayName}</div>
                    <textarea
                        ref={textareaRef}
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder="Add comment..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 mt-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white resize-none max-h-[50vh]"
                        style={{ height: 'auto' }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                handleSubmit(e);
                            }
                        }}
                    />
                </div>
            </div>
            <div className="flex justify-end items-center gap-3">
                 <button type="button" onClick={onCancel} className="px-4 py-2 rounded-full text-xs font-semibold text-white/70 bg-white/10 hover:bg-white/20">
                    Cancel
                </button>
                <button type="submit" className="px-4 py-2 rounded-full text-xs font-semibold text-black bg-white hover:bg-white/90 disabled:opacity-40" disabled={!text.trim()}>
                    Post
                </button>
            </div>
        </form>
    </div>
  );
};

export default NewCommentPopover;
