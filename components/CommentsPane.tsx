import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Comment } from '../types';
import { MessageSquare, CheckCircle2, Circle, Trash2, Pencil, ChevronDown, ChevronUp } from 'lucide-react';
import { useMutation } from 'convex/react';

interface CommentProps {
  comment: Comment;
  replies: Comment[];
  onAddComment: (text: string, parentId?: string) => void;
  onToggleResolve: (id: string) => void;
  onJumpToFrame: (frame: number | undefined) => void;
  onDeleteComment: (id: string) => void;
  isActive: boolean;
  setActive: () => void;
  isReply?: boolean;
}

const CommentItem: React.FC<CommentProps & { friends?: Array<{ id: string; contactEmail: string; contactName: string | null }> }>
 = ({ comment, replies, onAddComment, onToggleResolve, onJumpToFrame, onDeleteComment, isActive, setActive, friends, isReply = false }) => {
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);
  const [quickReply, setQuickReply] = useState('');
  const [saving, setSaving] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const updateText = useMutation(api.comments.updateText);
  const inputRef = useRef<HTMLInputElement>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState('');
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

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editText.trim() || saving) return;
    setSaving(true);
    const previous = comment.text;
    try {
      // Optimistic local text
      setEditText(editText.trim());
      await updateText({ commentId: comment.id as any, text: editText.trim() });
      setIsEditing(false);
    } catch (err) {
      // Revert local state on failure
      setEditText(previous);
    } finally {
      setSaving(false);
    }
  };

  const quickSuggestions = useMemo(() => {
    if (!quickOpen) return [] as Array<{ id: string; label: string; email: string }>;
    const base = (friends ?? []).map((f) => ({ id: f.id, label: (f.contactName ?? f.contactEmail) as string, email: f.contactEmail }));
    if (!quickQuery) return base.slice(0, 5);
    const q = quickQuery.toLowerCase();
    return base.filter((s) => s.label.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)).slice(0, 5);
  }, [friends, quickOpen, quickQuery]);

  const onQuickChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuickReply(value);
    const pos = e.target.selectionStart ?? value.length;
    const upto = value.slice(0, pos);
    const at = upto.lastIndexOf('@');
    if (at >= 0) {
      const tail = upto.slice(at + 1);
      if (/^[\w .-]{0,32}$/.test(tail)) {
        setQuickQuery(tail.toLowerCase());
        setQuickOpen(true);
        return;
      }
    }
    setQuickOpen(false);
  };

  const applyQuickSuggestion = (label: string, el: HTMLInputElement | null) => {
    if (!el) return;
    const value = quickReply;
    const pos = el.selectionStart ?? value.length;
    const upto = value.slice(0, pos);
    const at = upto.lastIndexOf('@');
    if (at < 0) return;
    const before = value.slice(0, at + 1);
    const after = value.slice(pos);
    const next = `${before}${label} ${after}`;
    setQuickReply(next);
    setQuickOpen(false);
    requestAnimationFrame(() => {
      const caret = (before + label + ' ').length;
      el.setSelectionRange(caret, caret);
      el.focus();
    });
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
        className={`${isReply ? 'p-2' : 'p-3'} border-b border-white/10 transition-colors ${isActive ? 'bg-white/10' : 'hover:bg-white/5'}`}
        onClick={setActive}
    >
      <div className="flex items-start gap-2.5">
        <img src={comment.authorAvatar} alt={comment.authorName} className={`${isReply ? 'w-6 h-6' : 'w-7 h-7'} rounded-full border border-white/10`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-white text-sm truncate">{comment.authorName}</span>
            <span className="text-[11px] text-white/40 whitespace-nowrap">{timeAgo(comment.createdAt)}</span>
          </div>
          {isEditing ? (
            <form onSubmit={handleEditSubmit} className="mt-1.5 flex flex-col gap-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white resize-none"
                rows={2}
              />
              <div className="flex items-center gap-2">
                <button type="submit" disabled={saving || !editText.trim()} className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-white text-black hover:bg-white/90 disabled:opacity-40">Save</button>
                <button type="button" onClick={() => { setIsEditing(false); setEditText(comment.text); }} className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-white/10 text-white/70 hover:bg-white/20">Cancel</button>
              </div>
            </form>
          ) : (
            <p
              className="text-sm text-white/80 mt-1 whitespace-pre-wrap break-words"
              style={{ hyphens: 'auto', wordBreak: 'break-word', overflowWrap: 'anywhere' }}
            >
              {editText}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/60 mt-2">
            {!isReply && comment.frame !== undefined && (
              <button onClick={() => onJumpToFrame(comment.frame)} className="hover:text-white">Frame {comment.frame}</button>
            )}
            {!isReply && (
              <button onClick={() => setShowReply((s) => !s)} className="hover:text-white">Reply</button>
            )}
            <button onClick={() => setIsEditing((v) => !v)} className="flex items-center gap-1 hover:text-white" title="Edit">
              <Pencil size={14} /> Edit
            </button>
            {!isReply && (
              <button onClick={() => onToggleResolve(comment.id)} className={`flex items-center gap-1 ${comment.resolved ? 'text-white' : 'hover:text-white'}`}>
                {comment.resolved ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                {comment.resolved ? 'Resolved' : 'Resolve'}
              </button>
            )}
            <button onClick={() => onDeleteComment(comment.id)} className="flex items-center gap-1 hover:text-red-300" title="Delete">
              <Trash2 size={14}/>
            </button>
          </div>
          {!isReply && replies.length > 0 && (
            <div className="mt-2">
              <button onClick={() => setShowReplies(v => !v)} className="inline-flex items-center gap-1 text-xs text-white/60 hover:text-white">
                {showReplies ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} {showReplies ? 'Hide replies' : `Show replies (${replies.length})`}
              </button>
            </div>
          )}
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
      {!isReply && replies.length > 0 && showReplies && (
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
              isReply
              friends={contacts}
            />
          ))}
          {/* Quick reply box after the first reply */}
          <form
            onSubmit={(e) => { e.preventDefault(); if (!quickReply.trim()) return; onAddComment(quickReply.trim(), comment.id); setQuickReply(''); setQuickOpen(false); }}
            className="flex items-end gap-2"
          >
            <div className="relative flex-1">
              <input
                type="text"
                value={quickReply}
                onChange={onQuickChange}
                placeholder="Write a reply..."
                className="w-full bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white"
              />
              {quickOpen && quickSuggestions.length > 0 && (
                <div className="absolute left-0 bottom-full mb-2 max-h-48 w-full overflow-auto rounded-xl border border-white/10 bg-black/90 text-sm text-white shadow-2xl z-40">
                  {quickSuggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={(ev) => applyQuickSuggestion(s.label, ev.currentTarget.parentElement?.previousElementSibling as HTMLInputElement)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-white/10"
                    >
                      <span>{s.label}</span>
                      <span className="text-white/40">@{s.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="submit" className="bg-white text-black px-3 py-1.5 rounded-full text-xs font-semibold hover:bg-white/90">Send</button>
          </form>
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
  const contacts = useMemo(() => {
    const map = new Map<string, { id: string; contactEmail: string; contactName: string | null }>();
    (friends ?? []).forEach((f: any) => {
      map.set(f.contactEmail, { id: f.id, contactEmail: f.contactEmail, contactName: f.contactName ?? null });
    });
    (groups ?? []).forEach((g: any) => {
      (g.members ?? []).forEach((m: any) => {
        if (!map.has(m.email)) map.set(m.email, { id: `${g.id}:${m.email}`, contactEmail: m.email, contactName: (m.email || '').split('@')[0] });
      });
    });
    return Array.from(map.values());
  }, [friends, groups]);
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
    <div className={`relative h-full flex flex-col border-l ${isDark ? 'bg-black/60 border-white/10' : 'bg-white border-gray-200'}`}>
      <div className="px-4 py-3 border-b border-white/10">
        <h2 className="text-sm font-semibold text-white/50 uppercase flex items-center gap-2">
          <MessageSquare size={18}/> Comments
        </h2>
        <div className="mt-4 inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full p-1">
            <button onClick={() => setFilter('all')} className={`px-4 py-1.5 rounded-full text-xs font-semibold ${filter === 'all' ? 'bg-white text-black' : 'text-white/60 hover:bg-white/10'}`}>All</button>
            <button onClick={() => setFilter('open')} className={`px-4 py-1.5 rounded-full text-xs font-semibold ${filter === 'open' ? 'bg-white text-black' : 'text-white/60 hover:bg-white/10'}`}>Open</button>
            <button onClick={() => setFilter('resolved')} className={`px-4 py-1.5 rounded-full text-xs font-semibold ${filter === 'resolved' ? 'bg-white text-black' : 'text-white/60 hover:bg-white/10'}`}>Resolved</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-scroll scroll-slim pr-1 pb-28">
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
                friends={contacts}
             />
          </div>
        ))}
      </div>
      <div className={`px-4 py-3 border-t sticky bottom-0 z-40 ${isDark ? 'border-white/10 bg-black/60' : 'border-gray-200 bg-white'}`}>
        <form onSubmit={handleSubmitComment} className="flex items-end gap-2">
          <div className="relative flex-1">
            <textarea
              value={newCommentText}
              onChange={handleTextareaChange}
              placeholder={`Add comment at frame ${currentFrame}…`}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white resize-none"
              rows={2}
              ref={textareaRef}
            />
            {mentionOpen && suggestions.length > 0 && (
              <div className={`absolute left-0 bottom-full mb-2 max-h-48 w-full overflow-auto rounded-xl border text-sm shadow-2xl z-40 ${isDark ? 'border-white/10 bg-black/90 text-white' : 'border-gray-200 bg-white text-gray-900'}`}>
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => applySuggestion(s.label)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-50'}`}
                  >
                    <span>{s.label}</span>
                    <span className={`${isDark ? 'text-white/40' : 'text-gray-500'}`}>@{s.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="submit" className="px-3 py-2 bg-white text-black font-semibold rounded-full hover:bg-white/90 text-xs">
            Send
          </button>
        </form>
      </div>
    </div>
  );
};

export default CommentsPane;
