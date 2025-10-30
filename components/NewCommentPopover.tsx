import React, { useState, useEffect, useRef } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Point } from '../types';
import { RenderedRect, normalizedToCanvas } from '../utils/geometry';

interface NewCommentPopoverProps {
  position: Point;
  renderedRect: RenderedRect;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

const NewCommentPopover: React.FC<NewCommentPopoverProps> = ({ position, renderedRect, onSubmit, onCancel }) => {
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
    <div ref={popoverRef} style={style} className="w-80 bg-gray-900 rounded-xl shadow-2xl border border-gray-700/50 flex flex-col relative max-w-[90vw]" onClick={e => e.stopPropagation()}>
        {/* Caret */}
        <div className="absolute left-1/2 -top-[5px] -ml-[5px] w-2.5 h-2.5 bg-gray-900 border-t border-l border-gray-700/50 transform rotate-45"></div>
        
        <form onSubmit={handleSubmit} className="p-3 flex flex-col gap-3">
            <div className="flex items-start space-x-2.5">
                <img src={avatar} alt={displayName} className="w-7 h-7 rounded-full mt-0.5" />
                <div className="flex-1">
                    <div className="font-semibold text-white text-sm">{displayName}</div>
                    <textarea
                        ref={textareaRef}
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder="Add comment..."
                        className="w-full bg-transparent focus:outline-none text-sm text-gray-300 resize-none mt-1 max-h-[50vh]"
                        style={{ height: 'auto' }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                handleSubmit(e);
                            }
                        }}
                    />
                </div>
            </div>
            <div className="flex justify-end items-center gap-2">
                 <button type="button" onClick={onCancel} className="px-3 py-1 rounded-md text-sm font-semibold text-gray-300 hover:bg-gray-800">
                    Cancel
                </button>
                <button type="submit" className="bg-cyan-600 hover:bg-cyan-500 px-3 py-1 rounded-md text-sm text-white font-semibold disabled:opacity-50" disabled={!text.trim()}>
                    Post
                </button>
            </div>
        </form>
    </div>
  );
};

export default NewCommentPopover;
