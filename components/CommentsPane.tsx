import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
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

const CommentItem: React.FC<CommentProps & { friends?: Array<{ id: string; contactEmail: string; contactName: string | null }> }>
 = ({ comment, replies, onAddComment, onToggleResolve, onJumpToFrame, onDeleteComment, isActive, setActive, friends }) => {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const sugg = useMemo(() => {
    if (!open) return [] as Array<{ id: string; label: string; email: string }>;
    const list = (friends ?? []).map((f) => ({ id: f.id, label: (f.contactName ?? f.contactEmail) as string, email: f.contactEmail }));
    if (!q) return list.slice(0, 5);
    const lq = q.toLowerCase();
    return list.filter((s) => s.label.toLowerCase().includes(lq) || s.email.toLowerCase().includes(lq)).slice(0, 5);
  }, [open, q, friends]);
  
  const handleReplySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (replyText.trim()) {
      onAddComment(replyText, comment.id);
      setReplyText('');
      setShowReply(false);
    }
  }

  const onReplyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setReplyText(value);
    const pos = e.target.selectionStart ?? value.length;
    const upto = value.slice(0, pos);
    const at = upto.lastIndexOf('@');
    if (at >= 0) {
      const tail = upto.slice(at + 1);
      if (/^[\w .-]{0,32}$/.test(tail)) {
        setQ(tail.toLowerCase());
        setOpen(true);
        return;
      }
    }
    setOpen(false);
  };

  const apply = (label: string) => {
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
    setOpen(false);
    requestAnimationFrame(() => {
      const caret = (before + label + ' ').length;
      inputRef.current?.setSelectionRange(caret, caret);
      inputRef.current?.focus();
    });
  };

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
        <form onSubmit={handleReplySubmit} className="ml-11 mt-3 flex gap-2 relative">
            <input 
                type="text"
                value={replyText}
                onChange={onReplyChange}
                placeholder="Write a reply..."
                className="w-full bg-white/5 border border-white/10 rounded-full px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white"
                ref={inputRef}
            />
            <button type="submit" className="bg-white text-black px-4 rounded-full text-xs font-semibold hover:bg-white/90">Send</button>
            {open && sugg.length > 0 && (
              <div className="absolute left-0 top-10 z-10 max-h-48 w-full overflow-auto rounded-xl border border-white/10 bg-black/80 text-sm text-white shadow-2xl">
                {sugg.map((s) => (
                  <button key={s.id} type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={() => apply(s.label)} className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-white/10">
                    <span>{s.label}</span>
                    <span className="text-white/40">@{s.email}</span>
                  </button>
                ))}
              </div>
            )}
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
  isDark?: boolean;
}

const CommentsPane: React.FC<CommentsPaneProps> = ({ comments, currentFrame, onAddComment, onToggleResolve, onJumpToFrame, activeCommentId, setActiveCommentId, onDeleteComment, isDark = true }) => {
  const [newCommentText, setNewCommentText] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const activeCommentRef = useRef<HTMLDivElement>(null);
  const friends = useQuery(api.friends.list, {});
  const groups = useQuery(api.shareGroups.list, {});
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
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
      setMentionOpen(false);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNewCommentText(value);
    const selectionStart = e.target.selectionStart ?? value.length;
    const uptoCursor = value.slice(0, selectionStart);
    const at = uptoCursor.lastIndexOf('@');
    if (at >= 0) {
      const after = uptoCursor.slice(at + 1);
      if (/^[\w .-]{0,32}$/.test(after)) {
        setMentionQuery(after.toLowerCase());
        setMentionOpen(true);
        return;
      }
    }
    setMentionOpen(false);
  };

  const suggestions = useMemo(() => {
    if (!mentionOpen) return [] as Array<{ id: string; label: string; email: string }>;
    const friendList = (friends ?? []).map((f: any) => ({ id: f.id, label: (f.contactName ?? f.contactEmail) as string, email: f.contactEmail }));
    const groupMembers = (groups ?? []).flatMap((g: any) => g.members.map((m: any) => ({ id: `${g.id}:${m.email}`, label: m.email.split('@')[0], email: m.email })));
    const merged = new Map<string, { id: string; label: string; email: string }>();
    [...friendList, ...groupMembers].forEach((p) => { if (!merged.has(p.email)) merged.set(p.email, p); });
    const list = Array.from(merged.values());
    if (!mentionQuery) return list.slice(0, 5);
    const q = mentionQuery.toLowerCase();
    return list.filter((f) => f.label.toLowerCase().includes(q) || f.email.toLowerCase().includes(q)).slice(0, 5);
  }, [mentionOpen, mentionQuery, friends, groups]);

  const applySuggestion = (label: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const value = newCommentText;
    const pos = el.selectionStart ?? value.length;
    const upto = value.slice(0, pos);
    const at = upto.lastIndexOf('@');
    if (at < 0) return;
    const before = value.slice(0, at + 1);
    const after = value.slice(pos);
    const inserted = `${label}`;
    const nextValue = `${before}${inserted} ${after}`;
    setNewCommentText(nextValue);
    setMentionOpen(false);
    requestAnimationFrame(() => {
      const caret = (before + inserted + ' ').length;
      el.setSelectionRange(caret, caret);
      el.focus();
    });
  };

  useEffect(() => {
    if (activeCommentId && activeCommentRef.current) {
        activeCommentRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeCommentId]);

  return (
    <div className={`h-full flex flex-col border-l ${isDark ? 'bg-black/60 border-white/10' : 'bg-white border-gray-200'}`}>
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
      <div className="flex-1 overflow-y-auto scroll-slim pr-1">
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
            onChange={handleTextareaChange}
            placeholder={`Add general comment at frame ${currentFrame}...`}
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white resize-none"
            rows={3}
            ref={textareaRef}
          />
          {mentionOpen && suggestions.length > 0 && (
            <div className="max-h-48 overflow-auto rounded-xl border border-white/10 bg-black/80 text-sm text-white shadow-2xl">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => applySuggestion(s.label)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-white/10"
                >
                  <span>{s.label}</span>
                  <span className="text-white/40">@{s.email}</span>
                </button>
              ))}
            </div>
          )}
          <button type="submit" className="w-full bg-white text-black font-semibold py-2.5 rounded-full hover:bg-white/90">
            Add Comment
          </button>
        </form>
      </div>
    </div>
  );
};

export default CommentsPane;
