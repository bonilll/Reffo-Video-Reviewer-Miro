import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Comment } from '../types';
import { MessageSquare, CornerDownRight, CheckCircle2, Circle, Trash2 } from 'lucide-react';

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
        className={`p-3 border-b border-gray-800 transition-colors ${isActive ? 'bg-cyan-900/30' : 'hover:bg-gray-850'}`}
        onClick={setActive}
    >
      <div className="flex items-start space-x-3">
        <img src={comment.authorAvatar} alt={comment.authorName} className="w-8 h-8 rounded-full" />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-white text-sm">{comment.authorName}</span>
            <span className="text-xs text-gray-400">{timeAgo(comment.createdAt)}</span>
          </div>
          <p
            className="text-sm text-gray-300 mt-1 whitespace-pre-wrap break-words"
            style={{ hyphens: 'auto', wordBreak: 'break-word', overflowWrap: 'anywhere' }}
          >
            {comment.text}
          </p>
          <div className="flex items-center space-x-4 text-xs text-gray-400 mt-2">
            {comment.frame !== undefined && (
              <button onClick={() => onJumpToFrame(comment.frame)} className="hover:text-cyan-400">Frame {comment.frame}</button>
            )}
            <button onClick={() => setShowReply(s => !s)} className="hover:text-cyan-400">Reply</button>
            <button onClick={() => onToggleResolve(comment.id)} className={`flex items-center gap-1 ${comment.resolved ? 'text-green-500' : 'hover:text-cyan-400'}`}>
              {comment.resolved ? <CheckCircle2 size={14} /> : <Circle size={14} />}
              {comment.resolved ? 'Resolved' : 'Resolve'}
            </button>
            <button onClick={() => onDeleteComment(comment.id)} className="hover:text-red-400 flex items-center gap-1">
              <Trash2 size={14}/> Delete
            </button>
          </div>
        </div>
      </div>
      {showReply && (
        <form onSubmit={handleReplySubmit} className="ml-11 mt-2 flex gap-2">
            <input 
                type="text"
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder="Write a reply..."
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
            <button type="submit" className="bg-cyan-600 hover:bg-cyan-500 px-3 rounded-md text-sm">Send</button>
        </form>
      )}
      {replies.length > 0 && (
        <div className="ml-6 mt-3 pl-4 border-l-2 border-gray-700 space-y-3">
          {replies.map(reply => (
            <CommentItem 
              key={reply.id} 
              comment={reply}
              replies={[]} 
              onAddComment={onAddComment} 
              onToggleResolve={onToggleResolve}
              onJumpToFrame={onJumpToFrame}
              onDeleteComment={onDeleteComment}
              isActive={false} // Replies are not individually selectable for now
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
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-gray-800">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2"><MessageSquare size={20}/> Comments</h2>
        <div className="mt-3 flex gap-2 text-sm">
            <button onClick={() => setFilter('all')} className={`px-3 py-1 rounded-full ${filter === 'all' ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300'}`}>All</button>
            <button onClick={() => setFilter('open')} className={`px-3 py-1 rounded-full ${filter === 'open' ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300'}`}>Open</button>
            <button onClick={() => setFilter('resolved')} className={`px-3 py-1 rounded-full ${filter === 'resolved' ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300'}`}>Resolved</button>
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
      <div className="p-4 border-t border-gray-800">
        <form onSubmit={handleSubmitComment}>
          <textarea
            value={newCommentText}
            onChange={(e) => setNewCommentText(e.target.value)}
            placeholder={`Add general comment at frame ${currentFrame}...`}
            className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500 resize-none"
            rows={3}
          />
          <button type="submit" className="w-full mt-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-2 rounded-md transition-colors">
            Add Comment
          </button>
        </form>
      </div>
    </div>
  );
};

export default CommentsPane;