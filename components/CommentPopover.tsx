import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { useUser } from '@clerk/clerk-react';
import { Comment } from '../types';
import { RenderedRect, normalizedToCanvas } from '../utils/geometry';
import { X, CornerDownRight } from 'lucide-react';

interface CommentPopoverProps {
  comment: Comment;
  comments: Comment[];
  onAddComment: (text: string, parentId: string) => void;
  onClose: () => void;
  renderedRect: RenderedRect;
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


const CommentThreadItem: React.FC<{ comment: Comment }> = ({ comment }) => (
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
              {comment.text}
            </p>
        </div>
    </div>
);


const CommentPopover: React.FC<CommentPopoverProps> = ({ comment, comments, onAddComment, onClose, renderedRect }) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [replyText, setReplyText] = useState('');
  const friends = useQuery(api.friends.list, {});
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
    if (!suggestOpen) return [] as Array<{ id: string; label: string; email: string }>;
    const list = (friends ?? []).map((f) => ({ id: (f as any).id, label: ((f as any).contactName ?? (f as any).contactEmail) as string, email: (f as any).contactEmail }));
    if (!suggestQuery) return list.slice(0, 5);
    const q = suggestQuery.toLowerCase();
    return list.filter((s) => s.label.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)).slice(0, 5);
  }, [suggestOpen, suggestQuery, friends]);

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
  
  // Position the popover intelligently
  const style: React.CSSProperties = {
    position: 'absolute',
    top: `${canvasPos.y + 20}px`,
    left: `${canvasPos.x}px`,
    transform: 'translateX(-50%)',
    zIndex: 30,
  };
  
  return (
    <div
      ref={popoverRef}
      style={style}
      className="w-80 bg-black/80 border border-white/10 rounded-2xl shadow-2xl flex flex-col relative max-w-[90vw] backdrop-blur"
      onClick={e => e.stopPropagation()}
    >
        <div className="absolute left-1/2 -top-[5px] -ml-[5px] w-2.5 h-2.5 bg-black/80 border-t border-l border-white/10 transform rotate-45" />

        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <span className="text-xs font-semibold uppercase text-white/40">Thread</span>
            <button onClick={onClose} className="p-1 text-white/50 hover:text-white rounded-full hover:bg-white/10 transition-colors" title="Close">
                <X size={16} />
            </button>
        </div>

        <div className="px-3 py-3 space-y-3 max-h-[60vh] overflow-y-auto">
            {thread.map(c => <CommentThreadItem key={c.id} comment={c} />)}
        </div>

        <div className="px-3 py-2 border-t border-white/10 bg-black/70">
            <form onSubmit={handleReplySubmit} className="flex gap-2 items-center">
                 <img src={avatar} alt="You" className="w-7 h-7 rounded-full border border-white/10" />
                 <input 
                    type="text"
                    value={replyText}
                    onChange={onReplyChange}
                    placeholder="Reply..."
                    className="w-full bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white"
                    ref={inputRef}
                />
                <button type="submit" className="bg-white text-black p-2 rounded-full text-sm font-semibold flex-shrink-0 hover:bg-white/90" title="Reply">
                    <CornerDownRight size={16} />
                </button>
                {suggestOpen && suggestions.length > 0 && (
                  <div className="absolute left-3 right-3 bottom-12 z-10 max-h-48 overflow-auto rounded-xl border border-white/10 bg-black/90 text-sm text-white shadow-2xl">
                    {suggestions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={() => applySuggestion(s.label)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-white/10"
                      >
                        <span>{s.label}</span>
                        <span className="text-white/40">@{s.email}</span>
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
