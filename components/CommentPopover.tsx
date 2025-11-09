import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Comment, MentionOption } from '../types';
import { RenderedRect, normalizedToCanvas } from '../utils/geometry';
import { X, CornerDownRight } from 'lucide-react';
import { splitMentionSegments } from '../utils/mentions';

interface CommentPopoverProps {
  comment: Comment;
  comments: Comment[];
  onAddComment: (text: string, parentId: string) => void;
  onClose: () => void;
  renderedRect: RenderedRect;
  isDark?: boolean;
  mentionOptions?: MentionOption[];
}

const timeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m";
    return Math.floor(seconds) + "s";
}


const CommentThreadItem: React.FC<{ comment: Comment; isDark: boolean; mentionOptions?: MentionOption[] }> = ({ comment, isDark, mentionOptions }) => {
  const segments = useMemo(() => splitMentionSegments(comment.text, mentionOptions), [comment.text, mentionOptions]);
  const chipClass = isDark ? 'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold bg-white/10 text-white' : 'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold bg-black/10 text-gray-900';

  return (
    <div className="flex items-start space-x-2.5">
      <img src={comment.authorAvatar} alt={comment.authorName} className="w-7 h-7 rounded-full mt-0.5 border border-white/10" />
      <div className="flex-1">
        <div className="flex items-baseline space-x-2">
          <span className="font-semibold text-white text-sm">{comment.authorName}</span>
          <span className="text-xs text-white/40">{timeAgo(comment.createdAt)}</span>
        </div>
        <p
          className="text-sm text-white/70 break-words whitespace-pre-wrap"
          style={{ hyphens: 'auto', wordBreak: 'break-word', overflowWrap: 'anywhere' }}
        >
          {segments.map((segment, idx) =>
            segment.kind === 'mention' ? (
              <span key={`mention-${idx}`} className={chipClass}>
                @{segment.value}
              </span>
            ) : (
              <React.Fragment key={`text-${idx}`}>{segment.value}</React.Fragment>
            )
          )}
        </p>
      </div>
    </div>
  );
};


const CommentPopover: React.FC<CommentPopoverProps> = ({ comment, comments, onAddComment, onClose, renderedRect, isDark = true, mentionOptions = [] }) => {
  const [replyText, setReplyText] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestQuery, setSuggestQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useUser();
  const avatar = user?.imageUrl || '';
  
  const thread = useMemo(() => {
    const replies = comments.filter(c => c.parentId === comment.id)
                            .sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return [comment, ...replies];
  }, [comment, comments]);
  
  const handleReplySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (replyText.trim()) {
      onAddComment(replyText, comment.id);
      setReplyText('');
      setSuggestOpen(false);
    }
  };

  const onReplyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setReplyText(value);
    const pos = e.target.selectionStart ?? value.length;
    const upto = value.slice(0, pos);
    const at = upto.lastIndexOf('@');
    if (at >= 0) {
      const tail = upto.slice(at + 1);
      if (/^[\w .-]{0,32}$/.test(tail)) {
        setSuggestQuery(tail.toLowerCase());
        setSuggestOpen(true);
        return;
      }
    }
    setSuggestOpen(false);
  };

  const suggestions = useMemo(() => {
    if (!suggestOpen) return [];
    if (!suggestQuery) return mentionOptions.slice(0, 5);
    const q = suggestQuery.toLowerCase();
    return mentionOptions.filter((option) => option.label.toLowerCase().includes(q) || option.email.toLowerCase().includes(q)).slice(0, 5);
  }, [mentionOptions, suggestOpen, suggestQuery]);

  const applySuggestion = (label: string) => {
    const el = inputRef.current;
    const value = replyText;
    const pos = el?.selectionStart ?? value.length;
    const upto = value.slice(0, pos);
    const at = upto.lastIndexOf('@');
    if (at < 0) return;
    const before = value.slice(0, at + 1);
    const after = value.slice(pos);
    const next = `${before}${label} ${after}`;
    setReplyText(next);
    setSuggestOpen(false);
    requestAnimationFrame(() => {
      const caret = (before + label + ' ').length;
      inputRef.current?.setSelectionRange(caret, caret);
      inputRef.current?.focus();
    });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    // Use timeout to avoid closing immediately on the click that opened it
    setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);
  
  if (!comment.position) return null;

  const canvasPos = normalizedToCanvas(comment.position, renderedRect);

  // Keep within bounds and flip when needed
  const popoverRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ top: number; left: number; flipY: boolean }>({ top: canvasPos.y + 20, left: canvasPos.x, flipY: false });

  const recalcPlacement = useCallback(() => {
    const pad = 8;
    const offset = 20;
    const w = popoverRef.current?.offsetWidth ?? 320;
    const h = popoverRef.current?.offsetHeight ?? 240;
    let left = canvasPos.x;
    left = Math.max(w / 2 + pad, Math.min(renderedRect.width - w / 2 - pad, left));
    let top = canvasPos.y + offset;
    let flipY = false;
    if (top + h > renderedRect.height - pad) {
      top = canvasPos.y - offset - h;
      flipY = true;
      if (top < pad) top = Math.min(renderedRect.height - pad - h, Math.max(pad, top));
    }
    setPlacement({ top, left, flipY });
  }, [canvasPos.x, canvasPos.y, renderedRect.width, renderedRect.height]);

  useEffect(() => {
    recalcPlacement();
    const onResize = () => recalcPlacement();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [recalcPlacement]);

  const style: React.CSSProperties = {
    position: 'absolute',
    top: `${placement.top}px`,
    left: `${placement.left}px`,
    transform: 'translateX(-50%)',
    zIndex: 30,
  };
  
  return (
    <div
      ref={popoverRef}
      style={style}
      className={`w-80 rounded-2xl shadow-2xl flex flex-col relative max-w-[90vw] backdrop-blur border ${isDark ? 'bg-black/80 border-white/10' : 'bg-white border-gray-200'}`}
      onClick={e => e.stopPropagation()}
    >
        {!placement.flipY ? (
          <div className={`absolute left-1/2 -top-[5px] -ml-[5px] w-2.5 h-2.5 transform rotate-45 ${isDark ? 'bg-black/80 border-t border-l border-white/10' : 'bg-white border-t border-l border-gray-200'}`} />
        ) : (
          <div className={`absolute left-1/2 -bottom-[5px] -ml-[5px] w-2.5 h-2.5 transform rotate-45 ${isDark ? 'bg-black/80 border-b border-r border-white/10' : 'bg-white border-b border-r border-gray-200'}`} />
        )}

        <div className={`flex items-center justify-between px-3 py-2 border-b ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
            <span className={`text-xs font-semibold uppercase ${isDark ? 'text-white/40' : 'text-gray-600'}`}>Thread</span>
            <button onClick={onClose} className={`${isDark ? 'p-1 text-white/50 hover:text-white rounded-full hover:bg-white/10' : 'p-1 text-gray-600 hover:text-gray-900 rounded-full hover:bg-gray-100'} transition-colors`} title="Close">
                <X size={16} />
            </button>
        </div>

        <div className="px-3 py-3 space-y-3 max-h-[60vh] overflow-y-auto">
            {thread.map(c => (
              <CommentThreadItem key={c.id} comment={c} isDark={isDark} mentionOptions={mentionOptions} />
            ))}
        </div>

        <div className={`px-3 py-2 border-t ${isDark ? 'border-white/10 bg-black/70' : 'border-gray-200 bg-white'}`}>
            <form onSubmit={handleReplySubmit} className="flex gap-2 items-center relative">
                 <img src={avatar} alt="You" className={`w-7 h-7 rounded-full ${isDark ? 'border border-white/10' : 'border border-gray-200'}`} />
                 <input 
                    type="text"
                    value={replyText}
                    onChange={onReplyChange}
                    placeholder="Reply..."
                    className={`${isDark ? 'w-full bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white' : 'w-full bg-gray-50 border border-gray-300 rounded-full px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900'}`}
                    ref={inputRef}
                />
                <button type="submit" className={`${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'} p-2 rounded-full text-sm font-semibold flex-shrink-0`} title="Reply">
                    <CornerDownRight size={16} />
                </button>
                {suggestOpen && suggestions.length > 0 && (
                  <div className={`absolute left-3 right-3 bottom-12 z-10 max-h-48 overflow-auto rounded-xl border shadow-2xl ${isDark ? 'border-white/10 bg-black/90 text-white' : 'border-gray-200 bg-white text-gray-900'}`}>
                    {suggestions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={() => applySuggestion(s.label)}
                        className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-50'}`}
                      >
                        <span className="min-w-0 truncate">{s.label}</span>
                        <span className={isDark ? 'text-white/40' : 'text-gray-500'}>@{s.email}</span>
                      </button>
                    ))}
                  </div>
                )}
            </form>
        </div>
    </div>
  );
};

export default CommentPopover;
