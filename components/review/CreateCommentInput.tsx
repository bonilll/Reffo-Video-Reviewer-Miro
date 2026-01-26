"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ReviewComment } from "@/types/canvas";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  MoreHorizontal,
  Send,
  Trash2,
  X,
  Check,
  MessageSquare,
  Edit,
  Save,
  CheckCircle
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { enUS } from "date-fns/locale";
import { ReviewDeleteConfirmation } from "./ReviewDeleteConfirmation";

interface CreateCommentInputProps {
  sessionId: string;
  assetId: string;
  frameNumber?: number;
  frameTimestamp?: number;
  position: { x: number; y: number };
  // If provided with normalize=true, position will be saved normalized [0,1]
  canvasSize?: { width: number; height: number };
  normalize?: boolean;
  onCommentCreated?: () => void;
  onCancel?: () => void;
  theme?: 'dark' | 'light';
  // New props for existing comment mode
  mode?: 'create' | 'view';
  existingComment?: ReviewComment;
  replies?: ReviewComment[];
  onCommentUpdate?: () => void;
  scale?: number;
}

export function CreateCommentInput({
  sessionId,
  assetId,
  frameNumber,
  frameTimestamp,
  position,
  onCommentCreated,
  onCancel,
  theme = 'light',
  mode = 'create',
  existingComment,
  replies = [],
  onCommentUpdate,
  scale = 1,
  canvasSize,
  normalize = false
}: CreateCommentInputProps) {
  const [commentText, setCommentText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isResolved, setIsResolved] = useState(existingComment?.status === 'resolved');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState<string | null>(null);
  
  // Convex mutations
  const createComment = useMutation(api.review.createComment);
  const resolveComment = useMutation(api.review.resolveComment);
  const updateComment = useMutation(api.review.updateComment);
  const deleteComment = useMutation(api.review.deleteComment);
  
  // Auto-focus and click outside handler
  useEffect(() => {
    if (mode === 'create' && textareaRef.current) {
      textareaRef.current.focus();
    } else if (mode === 'view' && replyTextareaRef.current) {
      setTimeout(() => replyTextareaRef.current?.focus(), 100);
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        // Check if the click is on a comment bubble to avoid closing when clicking bubble
        const target = event.target as HTMLElement;
        const isClickOnBubble = target.closest('.comment-bubble') !== null;
        
        // Don't close if clicking on the bubble itself
        if (!isClickOnBubble) {
          // Use setTimeout to allow click events to complete first
          setTimeout(() => {
            onCancel?.();
          }, 0);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onCancel, mode]);

  // Update resolved state when comment changes
  useEffect(() => {
    if (existingComment) {
      setIsResolved(existingComment.status === 'resolved');
    }
  }, [existingComment?._id, existingComment?.status]);

  // Escape key handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel?.();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onCancel]);
  
  const handleSubmit = async () => {
    if (!commentText.trim() || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      const posToSave = normalize && canvasSize
        ? { x: position.x / Math.max(canvasSize.width, 1), y: position.y / Math.max(canvasSize.height, 1) }
        : position;
      await createComment({
        sessionId: sessionId as any,
        assetId,
        frameNumber,
        frameTimestamp,
        content: commentText.trim(),
        position: posToSave
      });
      
      setCommentText("");
      onCommentCreated?.();
    } catch (error) {
      console.error("Error creating comment:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reply handling
  const handleReply = async () => {
    if (!replyText.trim() || isSubmitting || !existingComment) return;
    
    setIsSubmitting(true);
    try {
      await createComment({
        sessionId: sessionId as any,
        assetId: existingComment.assetId,
        frameNumber: existingComment.frameNumber,
        frameTimestamp: existingComment.frameTimestamp,
        content: replyText.trim(),
        position: existingComment.position,
        threadId: existingComment.threadId
      });
      
      setReplyText("");
      onCommentUpdate?.();
    } catch (error) {
      console.error("Error creating reply:", error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleResolve = async () => {
    if (!existingComment) return;
    try {
      const newStatus = isResolved ? 'acknowledged' : 'resolved';
      await resolveComment({
        commentId: existingComment._id as any,
        status: newStatus
      });
      setIsResolved(!isResolved);
      onCommentUpdate?.();
    } catch (error) {
      console.error("Error resolving comment:", error);
    }
  };
  
  const handleEdit = (commentId: string, currentContent: string) => {
    setEditingCommentId(commentId);
    setEditText(currentContent);
    setTimeout(() => editTextareaRef.current?.focus(), 100);
  };

  const handleCancelEdit = () => {
    setEditingCommentId(null);
    setEditText("");
  };

  const handleSaveEdit = async (commentId: string) => {
    if (!editText.trim() || isUpdating) return;
    
    setIsUpdating(true);
    try {
      await updateComment({
        commentId: commentId as any,
        content: editText.trim()
      });
      
      setEditingCommentId(null);
      setEditText("");
      onCommentUpdate?.();
    } catch (error) {
      console.error("Error updating comment:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    setCommentToDelete(commentId);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!commentToDelete) return;
    
    setIsDeleting(true);
    try {
      await deleteComment({
        commentId: commentToDelete as any
      });
      
      onCommentUpdate?.();
      onCancel?.(); // Close popup if main comment is deleted
    } catch (error) {
      console.error("Error deleting comment:", error);
    } finally {
      setIsDeleting(false);
      setCommentToDelete(null);
    }
  };
  
  // User initials helper
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Theme classes
  const themeClasses = {
    container: theme === 'dark' 
      ? 'bg-gray-900 border-gray-700 text-white shadow-2xl' 
      : 'bg-white border-gray-200 text-gray-900 shadow-xl',
    input: theme === 'dark' 
      ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-400' 
      : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-500',
    textPrimary: theme === 'dark' ? 'text-white' : 'text-gray-900',
    textSecondary: theme === 'dark' ? 'text-gray-300' : 'text-gray-600',
    textMuted: theme === 'dark' ? 'text-gray-500' : 'text-gray-500',
    button: theme === 'dark' 
      ? 'text-gray-400 hover:text-white hover:bg-gray-700' 
      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
  };

  // Ultra-compact popup sizing - match dropdown design
  const getPopupDimensions = () => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Mobile
    if (viewportWidth < 640) {
      return {
        width: Math.min(280, viewportWidth - 32),
        maxHeight: Math.min(200, viewportHeight - 100),
        padding: 8
      };
    }
    
    // Tablet
    if (viewportWidth < 1024) {
      return {
        width: 300,
        maxHeight: Math.min(220, viewportHeight - 100),
        padding: 12
      };
    }
    
    // Desktop - expand for existing comments
    return {
      width: mode === 'view' ? 320 : 320,
      maxHeight: Math.min(mode === 'view' ? 400 : 240, viewportHeight - 100),
      padding: 12
    };
  };

  // Intelligent positioning - uniform distance above/below like dropdown
  const getOptimalPosition = () => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const { width, maxHeight } = getPopupDimensions();
    const offset = 8; // Distance from click point (uniform for above/below)
    
    // Center horizontally around click point
    let x = position.x - width / 2;
    
    // Ensure it stays within viewport horizontally
    x = Math.max(16, Math.min(x, viewportWidth - width - 16));
    
    // Calculate space above and below
    const spaceAbove = position.y;
    const spaceBelow = viewportHeight - position.y;
    
    let y;
    let placement = 'below';
    
    // Try below first (more natural)
    if (spaceBelow >= maxHeight + offset + 20) {
      y = position.y + offset;
      placement = 'below';
    }
    // If not enough space below, try above with same offset distance
    else if (spaceAbove >= maxHeight + offset + 20) {
      y = position.y - offset - maxHeight;
      placement = 'above';
    }
    // Fallback: where there's more space
    else {
      if (spaceAbove > spaceBelow) {
        y = 16; // Top of viewport
        placement = 'above';
      } else {
        y = viewportHeight - maxHeight - 16; // Bottom of viewport
        placement = 'below';
      }
    }
    
    return { x, y, placement };
  };

  const { width, maxHeight } = getPopupDimensions();
  
  // Organize comments for view mode
  const allThreadComments = mode === 'view' && existingComment ? 
    [existingComment, ...replies].sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    ) : [];
  
  const mainComment = allThreadComments[0];
  const threadReplies = allThreadComments.slice(1);
  
  return (
    <>
      {/* Main Container - Ultra-compact design - positioned relatively by parent */}
      <div 
        ref={containerRef}
        className={`${themeClasses.container} rounded-2xl border backdrop-blur-sm transform transition-all duration-300 ease-out shadow-xl`}
        style={{
          width,
          maxHeight
        }}
      >
          {/* Header - Ultra compact */}
          <div className={`px-3 py-2 border-b ${theme === 'dark' ? 'border-gray-700 bg-gray-800/50' : 'border-gray-100 bg-gray-50/50'} backdrop-blur-sm rounded-t-lg`}>
            <div className="flex items-center justify-between">
              {mode === 'create' ? (
                /* Create Mode Header */
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white text-xs font-semibold shadow-lg">
                    <span>YU</span>
                  </div>
                  <div>
                    <h4 className={`font-medium text-xs ${themeClasses.textPrimary}`}>
                      New Comment
                    </h4>
                    <p className={`text-xs ${themeClasses.textMuted}`}>
                      Frame {frameNumber}
                    </p>
                  </div>
                </div>
              ) : (
                /* View Mode Header */
                <div className="flex items-center gap-3">
                  {/* Status Badge */}
                  <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all duration-300 ${
                    isResolved 
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' 
                      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      isResolved ? 'bg-emerald-500' : 'bg-blue-500'
                    }`}></div>
                    <span>{isResolved ? 'Resolved' : 'Open'}</span>
                  </div>
                  
                  {/* Comment Info */}
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <MessageSquare className="w-3 h-3" />
                    <span>Frame {mainComment?.frameNumber}</span>
                    {threadReplies.length > 0 && (
                      <>
                        <span>•</span>
                        <span>{threadReplies.length} {threadReplies.length === 1 ? 'reply' : 'replies'}</span>
                      </>
                    )}
                  </div>
                </div>
              )}
              
              {/* Right side actions */}
              <div className="flex items-center gap-1">
                {mode === 'view' && mainComment && (
                  <>
                    {/* Resolve Toggle */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleResolve}
                      className={`h-6 px-2 text-xs font-medium rounded-md transition-all duration-300 ${
                        isResolved 
                          ? 'text-emerald-700 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/30' 
                          : 'text-blue-700 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-900/30'
                      }`}
                      title={isResolved ? 'Mark as Open' : 'Mark as Resolved'}
                    >
                      {isResolved ? 'Reopen' : 'Resolve'}
                    </Button>
                    
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleEdit(mainComment._id, mainComment.content)}
                      className={`h-6 w-6 p-0 ${themeClasses.button} rounded-md transition-all duration-300`}
                      title="Edit comment"
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleDelete(mainComment._id)}
                      disabled={isDeleting}
                      className={`h-6 w-6 p-0 rounded-md transition-all duration-300 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20`}
                      title="Delete comment"
                    >
                      {isDeleting ? (
                        <div className="w-3 h-3 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </Button>
                  </>
                )}
                
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={onCancel}
                  className={`h-6 w-6 p-0 ${themeClasses.button} rounded-md transition-all duration-300`}
                  title="Close"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className={`${themeClasses.content} flex-1 overflow-hidden`}>
            {mode === 'create' ? (
              /* Create Mode Content */
              <div className="px-3 py-2">
                <div className={`${themeClasses.input} border rounded-md p-2 focus-within:ring-1 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all duration-300`}>
                  <Textarea
                    ref={textareaRef}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Write your comment..."
                    className="border-none bg-transparent resize-none focus:ring-0 focus:outline-none p-0 min-h-[48px] max-h-[96px] text-xs"
                    rows={2}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                  />
                </div>
              </div>
            ) : (
              /* View Mode Content */
              <>
                {/* Main Comment */}
                {mainComment && (
                  <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white text-xs font-semibold shadow-lg">
                        {getInitials(mainComment.createdByName)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-1">
                          <h4 className={`font-medium text-xs ${themeClasses.textPrimary}`}>
                            {mainComment.createdByName}
                          </h4>
                          <span className={`text-xs ${themeClasses.textMuted}`}>
                            {formatDistanceToNow(new Date(mainComment.createdAt), { 
                              addSuffix: true, 
                              locale: enUS 
                            })}
                          </span>
                        </div>
                        
                        {/* Content */}
                        {editingCommentId === mainComment._id ? (
                          <div className="space-y-3">
                            <Textarea
                              ref={editTextareaRef}
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              className="text-sm border border-gray-200 dark:border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                              rows={3}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  handleSaveEdit(mainComment._id);
                                }
                                if (e.key === "Escape") {
                                  handleCancelEdit();
                                }
                              }}
                            />
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleSaveEdit(mainComment._id)}
                                disabled={!editText.trim() || isUpdating}
                                className="gap-1 text-xs"
                              >
                                {isUpdating ? (
                                  <>
                                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>Salvataggio...</span>
                                  </>
                                ) : (
                                  <>
                                    <Save className="w-3 h-3" />
                                    <span>Salva</span>
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleCancelEdit}
                                className="text-xs"
                              >
                                Annulla
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className={`text-xs leading-relaxed ${themeClasses.textSecondary}`}>
                            {mainComment.content}
                          </div>
                        )}
                        
                        {/* Metadata */}
                        <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
                          <MessageSquare className="w-2.5 h-2.5" />
                          <span>Frame {mainComment.frameNumber}</span>
                          {threadReplies.length > 0 && (
                            <>
                              <span>•</span>
                              <span>{threadReplies.length} rispost{threadReplies.length === 1 ? 'a' : 'e'}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Replies */}
                {threadReplies.length > 0 && (
                  <div className="max-h-32 overflow-y-auto border-b border-gray-100 dark:border-gray-700">
                    <div className="px-3 py-2 space-y-2">
                      {threadReplies.map((reply) => (
                        <div key={reply._id} className="flex items-start gap-3 group">
                          {/* Avatar */}
                          <div className="w-5 h-5 bg-gradient-to-br from-gray-400 to-gray-500 rounded-full flex items-center justify-center text-white text-xs font-semibold shadow-md">
                            {getInitials(reply.createdByName)}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-1">
                              <span className={`font-medium text-xs ${themeClasses.textPrimary}`}>
                                {reply.createdByName}
                              </span>
                              <span className={`text-xs ${themeClasses.textMuted}`}>
                                {formatDistanceToNow(new Date(reply.createdAt), { 
                                  addSuffix: true, 
                                  locale: enUS 
                                })}
                              </span>
                            </div>
                            
                            {/* Content */}
                            {editingCommentId === reply._id ? (
                              <div className="space-y-2">
                                <Textarea
                                  ref={editTextareaRef}
                                  value={editText}
                                  onChange={(e) => setEditText(e.target.value)}
                                  className="text-sm border border-gray-200 dark:border-gray-600 rounded-lg p-2 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                  rows={2}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                      e.preventDefault();
                                      handleSaveEdit(reply._id);
                                    }
                                    if (e.key === "Escape") {
                                      handleCancelEdit();
                                    }
                                  }}
                                />
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    onClick={() => handleSaveEdit(reply._id)}
                                    disabled={!editText.trim() || isUpdating}
                                    className="gap-1 text-xs h-7"
                                  >
                                    {isUpdating ? (
                                      <>
                                        <div className="w-2 h-2 border border-white/30 border-t-white rounded-full animate-spin" />
                                        <span>Salvataggio...</span>
                                      </>
                                    ) : (
                                      <>
                                        <Save className="w-2 h-2" />
                                        <span>Salva</span>
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleCancelEdit}
                                    className="text-xs h-7"
                                  >
                                    Annulla
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <div className={`text-xs leading-relaxed ${themeClasses.textSecondary}`}>
                                  {reply.content}
                                </div>
                                {/* Reply actions */}
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEdit(reply._id, reply.content)}
                                    className="text-xs h-4 w-4 p-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                    title="Modifica"
                                  >
                                    <Edit className="w-2.5 h-2.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(reply._id)}
                                    className="text-xs h-4 w-4 p-0 text-red-400 hover:text-red-600"
                                    title="Elimina"
                                  >
                                    <Trash2 className="w-2.5 h-2.5" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer - Actions */}
          <div className={`px-3 py-2 border-t ${theme === 'dark' ? 'border-gray-700 bg-gray-800/50' : 'border-gray-100 bg-gray-50/50'} backdrop-blur-sm rounded-b-lg`}>
            {mode === 'create' ? (
              /* Create Mode Footer */
              <div className="flex items-center justify-between">
                <span className={`text-xs ${themeClasses.textMuted}`}>
                  Shift+Enter
                </span>
                
                <Button
                  onClick={handleSubmit}
                  disabled={!commentText.trim() || isSubmitting}
                  className="gap-1 rounded-md bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 text-xs transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  size="sm"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3 h-3" />
                      <span>Send</span>
                    </>
                  )}
                </Button>
              </div>
            ) : (
              /* View Mode Footer - Reply Input */
              <div className="space-y-2">
                {/* Textarea */}
                <div className={`${themeClasses.input} border rounded-md p-2 focus-within:ring-1 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all duration-300`}>
                  <Textarea
                    ref={replyTextareaRef}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write a reply..."
                    className="border-none bg-transparent resize-none focus:ring-0 focus:outline-none p-0 min-h-[32px] max-h-[64px] text-xs"
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleReply();
                      }
                    }}
                  />
                </div>
                
                {/* Actions */}
                <div className="flex items-center justify-between">
                  <span className={`text-xs ${themeClasses.textMuted}`}>
                    Shift+Enter
                  </span>
                  
                  <Button
                    onClick={handleReply}
                    disabled={!replyText.trim() || isSubmitting}
                    className="gap-1 rounded-md bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 text-xs transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    size="sm"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3 h-3" />
                        <span>Send</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ReviewDeleteConfirmation
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        itemType="comment"
        itemCount={1}
      />
    </>
  );
} 