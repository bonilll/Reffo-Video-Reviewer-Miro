import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Point, MentionOption } from '../types';
import { RenderedRect, normalizedToCanvas } from '../utils/geometry';

interface NewCommentPopoverProps {
  position: Point;
  renderedRect: RenderedRect;
  onSubmit: (text: string) => void;
  onCancel: () => void;
  isDark?: boolean;
  mentionOptions?: MentionOption[];
}

const NewCommentPopover: React.FC<NewCommentPopoverProps> = ({ position, renderedRect, onSubmit, onCancel, isDark = true, mentionOptions = [] }) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
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

  // Measured/clamped placement – keeps popover within the renderedRect bounds and flips vertically when needed
  const [placement, setPlacement] = useState<{ top: number; left: number; flipY: boolean }>({ top: canvasPos.y + 15, left: canvasPos.x, flipY: false });

  const recalcPlacement = () => {
    const pad = 8;
    const offset = 15;
    const w = popoverRef.current?.offsetWidth ?? 320;
    const h = popoverRef.current?.offsetHeight ?? 160;
    // Clamp horizontally
    let left = canvasPos.x;
    left = Math.max(w / 2 + pad, Math.min(renderedRect.width - w / 2 - pad, left));
    // Prefer below; flip above if no space
    let top = canvasPos.y + offset;
    let flipY = false;
    if (top + h > renderedRect.height - pad) {
      top = canvasPos.y - offset - h;
      flipY = true;
      if (top < pad) top = Math.min(renderedRect.height - pad - h, Math.max(pad, top));
    }
    setPlacement({ top, left, flipY });
  };

  useEffect(() => {
    recalcPlacement();
    const onResize = () => recalcPlacement();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasPos.x, canvasPos.y, renderedRect.width, renderedRect.height]);

  useEffect(() => {
    // Recalculate on content growth (typing/suggestions open)
    recalcPlacement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, mentionOpen]);

  const style: React.CSSProperties = {
    position: 'absolute',
    top: `${placement.top}px`,
    left: `${placement.left}px`,
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

  // Compute mention suggestions (friends + group members, unique by email)
  const suggestions = useMemo(() => {
    if (!mentionOpen) return [];
    if (!mentionQuery) return mentionOptions.slice(0, 5);
    const q = mentionQuery.toLowerCase();
    return mentionOptions.filter((option) =>
      option.label.toLowerCase().includes(q) || option.email.toLowerCase().includes(q)
    ).slice(0, 5);
  }, [mentionOpen, mentionQuery, mentionOptions]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    const pos = e.target.selectionStart ?? value.length;
    const upto = value.slice(0, pos);
    const at = upto.lastIndexOf('@');
    if (at >= 0) {
      const tail = upto.slice(at + 1);
      if (/^[\w .-]{0,32}$/.test(tail)) {
        setMentionQuery(tail.toLowerCase());
        setMentionOpen(true);
        return;
      }
    }
    setMentionOpen(false);
  };

  const applySuggestion = (label: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const value = text;
    const pos = el.selectionStart ?? value.length;
    const upto = value.slice(0, pos);
    const at = upto.lastIndexOf('@');
    if (at < 0) return;
    const before = value.slice(0, at + 1);
    const after = value.slice(pos);
    const next = `${before}${label} ${after}`;
    setText(next);
    setMentionOpen(false);
    requestAnimationFrame(() => {
      const caret = (before + label + ' ').length;
      el.setSelectionRange(caret, caret);
      el.focus();
    });
  };

  return (
    <div
      ref={popoverRef}
      style={style}
      className={`w-96 rounded-3xl shadow-2xl flex flex-col relative max-w-[90vw] backdrop-blur border ${isDark ? 'bg-black/80 border-white/10' : 'bg-white border-gray-200'}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Arrow: flips to bottom when popover is above the click point */}
      {!placement.flipY ? (
        <div className={`absolute left-1/2 -top-[5px] -ml-[5px] w-2.5 h-2.5 transform rotate-45 ${isDark ? 'bg-black/80 border-t border-l border-white/10' : 'bg-white border-t border-l border-gray-200'}`} />
      ) : (
        <div className={`absolute left-1/2 -bottom-[5px] -ml-[5px] w-2.5 h-2.5 transform rotate-45 ${isDark ? 'bg-black/80 border-b border-r border-white/10' : 'bg-white border-b border-r border-gray-200'}`} />
      )}
      <div className={`px-4 py-2 border-b ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
        <span className={`text-xs font-semibold uppercase ${isDark ? 'text-white/50' : 'text-gray-600'}`}>New comment</span>
      </div>
      <form onSubmit={handleSubmit} className="p-4 pt-3 flex flex-col gap-3 relative">
        <div className="flex items-start gap-3">
          <img src={avatar} alt={displayName} className={`w-8 h-8 rounded-full ${isDark ? 'border border-white/10' : 'border border-gray-200'}`} />
          <div className="flex-1">
            <div className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{displayName}</div>
            <div className="relative mt-2">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={handleTextChange}
                placeholder="Add comment..."
                className={`w-full rounded-xl px-3 py-2 text-sm resize-none max-h-[50vh] focus:outline-none focus:ring-2 ${isDark ? 'bg-white/5 border border-white/10 text-white focus:ring-white' : 'bg-gray-50 border border-gray-300 text-gray-900 focus:ring-gray-900'}`}
                style={{ height: 'auto' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleSubmit(e);
                  }
                }}
              />
              {mentionOpen && suggestions.length > 0 && (
                <div className={`absolute left-0 top-full mt-2 z-10 max-h-48 w-full overflow-auto rounded-xl border shadow-2xl ${isDark ? 'border-white/10 bg-black/90 text-white' : 'border-gray-200 bg-white text-gray-900'}`}>
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={() => applySuggestion(s.label)}
                      className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-50'}`}
                    >
                      <span className="min-w-0 truncate">{s.label}</span>
                      <span className={`${isDark ? 'text-white/40' : 'text-gray-500'} shrink-0`}>@{s.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className={`mt-1 text-[10px] ${isDark ? 'text-white/40' : 'text-gray-500'}`}>Press ⌘/Ctrl + Enter to post</div>
          </div>
        </div>
        <div className="flex justify-end items-center gap-2 pt-1">
          <button type="button" onClick={onCancel} className={`${isDark ? 'text-white/70 bg-white/10 hover:bg-white/20' : 'text-gray-700 bg-gray-200 hover:bg-gray-300'} px-4 py-2 rounded-full text-xs font-semibold`}>
            Cancel
          </button>
          <button
            type="submit"
            className={`${isDark ? 'text-black bg-white hover:bg-white/90' : 'text-black bg-white border border-gray-300 hover:bg-gray-50'} px-4 py-2 rounded-full text-xs font-semibold disabled:opacity-40`}
            disabled={!text.trim()}
          >
            Post
          </button>
        </div>
      </form>
    </div>
  );
};

export default NewCommentPopover;
