import React, { useMemo, useState, useEffect, useRef } from 'react';
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
        <img src={comment.authorAvatar} alt={comment.authorName} className="w-7 h-7 rounded-full mt-0.5" />
        <div className="flex-1">
            <div className="flex items-baseline space-x-2">
                <span className="font-semibold text-white text-sm">{comment.authorName}</span>
                <span className="text-xs text-gray-400">{timeAgo(comment.createdAt)}</span>
            </div>
            <p
              className="text-sm text-gray-300 break-words whitespace-pre-wrap"
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
    }
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
    <div ref={popoverRef} style={style} className="w-80 bg-gray-900 rounded-xl shadow-2xl border border-gray-700/50 flex flex-col relative max-w-[90vw]" onClick={e => e.stopPropagation()}>
        {/* Caret */}
        <div className="absolute left-1/2 -top-[5px] -ml-[5px] w-2.5 h-2.5 bg-gray-900 border-t border-l border-gray-700/50 transform rotate-45"></div>

        <div className="flex items-center justify-between p-2 border-b border-gray-700/50">
            <span className="text-xs font-semibold text-gray-400 pl-1">Thread</span>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-white rounded-full hover:bg-gray-700 transition-colors" title="Close">
                <X size={16} />
            </button>
        </div>

        <div className="p-3 space-y-3 max-h-[60vh] overflow-y-auto">
            {thread.map(c => <CommentThreadItem key={c.id} comment={c} />)}
        </div>

        <div className="p-2 bg-gray-950/30 border-t border-gray-700/50">
            <form onSubmit={handleReplySubmit} className="flex gap-2 items-center">
                 <img src={avatar} alt="You" className="w-7 h-7 rounded-full" />
                 <input 
                    type="text"
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Reply..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-full px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
                <button type="submit" className="bg-cyan-600 hover:bg-cyan-500 p-2 rounded-full text-sm text-white flex-shrink-0" title="Reply">
                    <CornerDownRight size={16} />
                </button>
            </form>
        </div>
    </div>
  );
};

export default CommentPopover;
