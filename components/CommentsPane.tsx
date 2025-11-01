import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Comment } from '../types';
import { MessageSquare, CheckCircle2, Circle, Trash2 } from 'lucide-react';

interface CommentProps {
  comment: Comment;
  replies: Comment[];
  onAddComment: (text: string, parentId?: string) => void;
  onToggleResolve: (id: string) => void;
  onJumpToFrame: (frame: number | undefined) => void;
  onDeleteComment: (id: string) => void;
  isActive: boolean;
  setActive: () => void;
}

const CommentItem: React.FC<CommentProps> = ({ comment, replies, onAddComment, onToggleResolve, onJumpToFrame, onDeleteComment, isActive, setActive }) => {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  
  const handleReplySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (replyText.trim()) {
      onAddComment(replyText, comment.id);
      setReplyText('');
      setShowReply(false);
    }
  }

  const timeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return Math.floor(seconds) + " seconds ago";
  }

  return (
    <div 
        className={`p-4 border-b border-white/10 transition-colors ${isActive ? 'bg-white/10' : 'hover:bg-white/5'}`}
        onClick={setActive}
    >
      <div className="flex items-start gap-3">
        <img src={comment.authorAvatar} alt={comment.authorName} className="w-8 h-8 rounded-full border border-white/10" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-white text-sm truncate">{comment.authorName}</span>
            <span className="text-xs text-white/40 whitespace-nowrap">{timeAgo(comment.createdAt)}</span>
          </div>
          <p
            className="text-sm text-white/70 mt-2 whitespace-pre-wrap break-words"
            style={{ hyphens: 'auto', wordBreak: 'break-word', overflowWrap: 'anywhere' }}
          >
            {comment.text}
          </p>
          <div className="flex flex-wrap items-center gap-4 text-xs text-white/50 mt-3">
            {comment.frame !== undefined && (
              <button onClick={() => onJumpToFrame(comment.frame)} className="hover:text-white">
                Frame {comment.frame}
              </button>
            )}
            <button onClick={() => setShowReply((s) => !s)} className="hover:text-white">
              Reply
            </button>
            <button onClick={() => onToggleResolve(comment.id)} className={`flex items-center gap-1 ${comment.resolved ? 'text-white' : 'hover:text-white'}`}>
              {comment.resolved ? <CheckCircle2 size={14} /> : <Circle size={14} />}
              {comment.resolved ? 'Resolved' : 'Resolve'}
            </button>
            <button onClick={() => onDeleteComment(comment.id)} className="flex items-center gap-1 hover:text-red-300">
              <Trash2 size={14}/> Delete
            </button>
          </div>
        </div>
      </div>
      {showReply && (
        <form onSubmit={handleReplySubmit} className="ml-11 mt-3 flex gap-2">
            <input 
                type="text"
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder="Write a reply..."
                className="w-full bg-white/5 border border-white/10 rounded-full px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white"
            />
            <button type="submit" className="bg-white text-black px-4 rounded-full text-xs font-semibold hover:bg-white/90">Send</button>
        </form>
      )}
      {replies.length > 0 && (
        <div className="ml-6 mt-4 pl-4 border-l border-white/10 space-y-3">
          {replies.map(reply => (
            <CommentItem 
              key={reply.id} 
              comment={reply}
              replies={[]} 
              onAddComment={onAddComment} 
              onToggleResolve={onToggleResolve}
              onJumpToFrame={onJumpToFrame}
              onDeleteComment={onDeleteComment}
              isActive={false}
              setActive={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface CommentsPaneProps {
  comments: Comment[];
  currentFrame: number;
  onAddComment: (text: string, parentId?: string) => void;
  onToggleResolve: (id: string) => void;
  onJumpToFrame: (frame: number | undefined) => void;
  activeCommentId: string | null;
  setActiveCommentId: (id: string | null) => void;
  onDeleteComment: (id: string) => void;
}

const CommentsPane: React.FC<CommentsPaneProps> = ({ comments, currentFrame, onAddComment, onToggleResolve, onJumpToFrame, activeCommentId, setActiveCommentId, onDeleteComment }) => {
  const [newCommentText, setNewCommentText] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const activeCommentRef = useRef<HTMLDivElement>(null);
  
  const commentTree = useMemo(() => {
    const commentMap = new Map<string, Comment & { replies: Comment[] }>();
    const rootComments: (Comment & { replies: Comment[] })[] = [];

    comments.forEach(comment => {
      commentMap.set(comment.id, { ...comment, replies: [] });
    });

    comments.forEach(comment => {
      if (comment.parentId && commentMap.has(comment.parentId)) {
        commentMap.get(comment.parentId)?.replies.push(commentMap.get(comment.id)!);
      } else {
        rootComments.push(commentMap.get(comment.id)!);
      }
    });

    return rootComments.sort((a,b) => (a.frame || Infinity) - (b.frame || Infinity));
  }, [comments]);
  
  const filteredComments = useMemo(() => {
    if (filter === 'all') return commentTree;
    const isOpen = filter === 'open';
    return commentTree.filter(c => c.resolved !== isOpen);
  }, [commentTree, filter]);

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCommentText.trim()) {
      onAddComment(newCommentText);
      setNewCommentText('');
    }
  };

  useEffect(() => {
    if (activeCommentId && activeCommentRef.current) {
        activeCommentRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeCommentId]);

  return (
    <div className="h-full flex flex-col bg-black/60 border-l border-white/10">
      <div className="px-6 py-5 border-b border-white/10">
        <h2 className="text-sm font-semibold text-white/50 uppercase flex items-center gap-2">
          <MessageSquare size={18}/> Comments
        </h2>
        <div className="mt-4 inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full p-1">
            <button onClick={() => setFilter('all')} className={`px-4 py-1.5 rounded-full text-xs font-semibold ${filter === 'all' ? 'bg-white text-black' : 'text-white/60 hover:bg-white/10'}`}>All</button>
            <button onClick={() => setFilter('open')} className={`px-4 py-1.5 rounded-full text-xs font-semibold ${filter === 'open' ? 'bg-white text-black' : 'text-white/60 hover:bg-white/10'}`}>Open</button>
            <button onClick={() => setFilter('resolved')} className={`px-4 py-1.5 rounded-full text-xs font-semibold ${filter === 'resolved' ? 'bg-white text-black' : 'text-white/60 hover:bg-white/10'}`}>Resolved</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filteredComments.map(comment => (
          <div ref={comment.id === activeCommentId ? activeCommentRef : null} key={comment.id}>
             <CommentItem
                comment={comment}
                replies={comment.replies}
                onAddComment={onAddComment}
                onToggleResolve={onToggleResolve}
                onJumpToFrame={onJumpToFrame}
                onDeleteComment={onDeleteComment}
                isActive={comment.id === activeCommentId}
                setActive={() => setActiveCommentId(comment.id)}
             />
          </div>
        ))}
      </div>
      <div className="px-6 py-5 border-t border-white/10">
        <form onSubmit={handleSubmitComment} className="space-y-3">
          <textarea
            value={newCommentText}
            onChange={(e) => setNewCommentText(e.target.value)}
            placeholder={`Add general comment at frame ${currentFrame}...`}
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white resize-none"
            rows={3}
          />
          <button type="submit" className="w-full bg-white text-black font-semibold py-2.5 rounded-full hover:bg-white/90">
            Add Comment
          </button>
        </form>
      </div>
    </div>
  );
};

export default CommentsPane;
