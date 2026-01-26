"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ReviewSession, ReviewComment } from "@/types/canvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { 
  MessageSquare, 
  Send, 
  CheckCircle, 
  Clock,
  MapPin,
  Filter,
  Search,
  MoreHorizontal,
  Reply,
  Eye,
  EyeOff,
  Users,
  Calendar,
  Edit,
  Save,
  Trash2
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { enUS } from "date-fns/locale";

interface ReviewCommentsSidebarProps {
  session: ReviewSession;
  comments: ReviewComment[];
  currentFrame?: number;
  showComments: boolean;
  theme?: 'dark' | 'light';
  onFrameJump?: (frameNumber: number) => void;
}

export function ReviewCommentsSidebar({
  session,
  comments,
  currentFrame,
  showComments,
  theme = 'light',
  onFrameJump
}: ReviewCommentsSidebarProps) {
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "resolved">("all");
  const [frameFilter, setFrameFilter] = useState<"current" | "all">("all"); // Filter per frame - default: tutti i frame
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const resolveComment = useMutation(api.review.resolveComment);
  const createComment = useMutation(api.review.createComment);
  const updateComment = useMutation(api.review.updateComment);
  const deleteComment = useMutation(api.review.deleteComment);

  // Modern monochromatic theme system - compact and clean
  const themeClasses: any = {
    container: theme === 'dark' 
      ? 'bg-gray-950 border-gray-800 text-gray-100' 
      : 'bg-white border-gray-200 text-gray-900',
    header: theme === 'dark' 
      ? 'bg-gray-900/80 border-gray-800' 
      : 'bg-gray-50/80 border-gray-200',
    card: theme === 'dark' 
      ? 'bg-gray-900/40 border-gray-800 hover:bg-gray-900/60' 
      : 'bg-gray-50/40 border-gray-200 hover:bg-gray-50/60',
    input: theme === 'dark' 
      ? 'bg-gray-900 border-gray-700 text-gray-100 placeholder-gray-500' 
      : 'bg-gray-100 border-gray-300 text-gray-900 placeholder-gray-500',
    text: {
      primary: theme === 'dark' ? 'text-gray-100' : 'text-gray-900',
      secondary: theme === 'dark' ? 'text-gray-400' : 'text-gray-600',
      muted: theme === 'dark' ? 'text-gray-500' : 'text-gray-500',
    },
    button: theme === 'dark' 
      ? 'text-gray-500 hover:text-gray-200 hover:bg-gray-800' 
      : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100',
    badge: {
      open: theme === 'dark' ? 'bg-gray-800 text-gray-300 border-gray-700' : 'bg-gray-200 text-gray-700 border-gray-300',
      resolved: theme === 'dark' ? 'bg-gray-800 text-gray-400 border-gray-700' : 'bg-gray-100 text-gray-600 border-gray-300',
      frame: theme === 'dark' ? 'bg-gray-800 text-gray-300 border-gray-700 cursor-pointer hover:bg-gray-700' : 'bg-gray-200 text-gray-700 border-gray-300 cursor-pointer hover:bg-gray-300',
    }
  };

  // Filter and search comments
  const filteredComments = comments.filter(comment => {
    // Status filter
    if (filterStatus !== "all" && comment.status !== filterStatus) return false;
    
    // Frame filter - NEW: Use frameFilter state
    if (frameFilter === "current" && currentFrame !== undefined && comment.frameNumber !== currentFrame) {
      return false;
    }
    
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return (
        comment.content.toLowerCase().includes(query) ||
        comment.createdByName.toLowerCase().includes(query)
      );
    }
    
    return true;
  });

  // Group comments by thread with better logic
  const commentThreads: any = {};
  
  filteredComments.forEach(comment => {
    // Find the main comment (earliest in the thread)
    const threadComments = filteredComments.filter(c => c.threadId === comment.threadId);
    const mainComment = threadComments.sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )[0];
    
    // Only process if this is the main comment
    if (comment._id === mainComment._id) {
      commentThreads[comment.threadId] = {
        main: comment,
        replies: threadComments.filter(c => 
          c._id !== comment._id && 
          c.createdAt > comment.createdAt
        ).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      };
    }
  });

  const handleResolve = async (commentId: string) => {
    try {
      await resolveComment({
        commentId: commentId as any,
        status: "resolved"
      });
    } catch (error) {
      console.error("Error resolving comment:", error);
    }
  };

  const handleReply = async (parentComment: ReviewComment) => {
    if (!replyText.trim()) return;

    try {
      await createComment({
        sessionId: session._id as any,
        assetId: session.primaryAssetId,
        frameNumber: parentComment.frameNumber,
        frameTimestamp: parentComment.frameTimestamp,
        content: replyText,
        position: parentComment.position,
        threadId: parentComment.threadId
      });

      setReplyText("");
      setReplyingTo(null);
    } catch (error) {
      console.error("Error creating reply:", error);
    }
  };

  const toggleThreadExpansion = (threadId: string) => {
    const newExpanded = new Set(expandedThreads);
    if (newExpanded.has(threadId)) {
      newExpanded.delete(threadId);
    } else {
      newExpanded.add(threadId);
    }
    setExpandedThreads(newExpanded);
  };

  const handleEdit = (commentId: string, currentContent: string) => {
    setEditingCommentId(commentId);
    setEditText(currentContent);
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
    } catch (error) {
      console.error("Error updating comment:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm("Are you sure you want to delete this comment?")) return;
    
    setIsDeleting(true);
    try {
      await deleteComment({
        commentId: commentId as any
      });
    } catch (error) {
      console.error("Error deleting comment:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (!showComments) {
    return (
      <div className={`${themeClasses.container} p-6 text-center h-full flex items-center justify-center`}>
        <div className="space-y-4">
          <div className={`w-16 h-16 mx-auto rounded-full ${themeClasses.button} flex items-center justify-center`}>
            <EyeOff className="h-8 w-8" />
          </div>
          <div>
            <h3 className={`font-semibold text-lg ${themeClasses.text.primary}`}>
              Comments hidden
            </h3>
            <p className={`text-sm ${themeClasses.text.muted} mt-1`}>
              Enable visibility to see comments
            </p>
          </div>
        </div>
      </div>
    );
  }

  const threadCount = Object.keys(commentThreads).length;
  const totalReplies = Object.values(commentThreads).reduce((sum: number, thread: any) => sum + thread.replies.length, 0);

  return (
    <div className={`${themeClasses.container} flex flex-col h-full`}>
      {/* Modern Header - Compact */}
      <div className={`${themeClasses.header} px-4 py-2 border-b backdrop-blur-sm`}>
        <div className="space-y-4">
          {/* Title and Stats */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-gray-700 to-gray-800 rounded-lg flex items-center justify-center">
                <MessageSquare className="h-4 w-4 text-white" />
              </div>
              <div>
                <h3 className={`font-semibold text-base ${themeClasses.text.primary}`}>
                  Comments
                  {frameFilter === "current" && currentFrame !== undefined && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      Frame {currentFrame}
                    </Badge>
                  )}
                </h3>
                <div className="flex items-center gap-1 text-xs">
                  <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                    {threadCount} thread{threadCount !== 1 ? 's' : ''}
                  </Badge>
                  <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                    {totalReplies} replies
                  </Badge>
                  {frameFilter === "current" && currentFrame !== undefined && (
                    <Badge variant="outline" className={`px-2 py-0.5 ${themeClasses.badge.frame}`}>
                      Current frame only
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFiltersOpen(!isFiltersOpen)}
              className={`${isFiltersOpen ? 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200' : themeClasses.button} rounded-lg transition-all duration-300 h-7 w-7 p-0`}
            >
              <Filter className="h-3 w-3" />
            </Button>
          </div>

          {/* Search Bar - Compact */}
          <div className="relative">
            <Search className={`absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3 w-3 ${themeClasses.text.muted}`} />
            <Input
              placeholder="Search comments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`${themeClasses.input} pl-8 rounded-lg border-0 focus:ring-2 focus:ring-gray-400/20 text-sm h-8`}
            />
          </div>

          {/* Filters */}
          {isFiltersOpen && (
            <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700">
              {/* Status Filters */}
              <div className="space-y-2">
                <label className={`text-xs font-semibold ${themeClasses.text.secondary} uppercase tracking-wide`}>
                  Status
                </label>
                <div className="flex gap-2">
                  {[
                    { key: "all", label: "All", count: comments.length },
                    { key: "open", label: "Open", count: comments.filter(c => c.status === "open").length },
                    { key: "resolved", label: "Resolved", count: comments.filter(c => c.status === "resolved").length }
                  ].map((status) => (
                    <Button
                      key={status.key}
                      variant={filterStatus === status.key ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setFilterStatus(status.key as any)}
                      className="text-xs gap-2 rounded-lg"
                    >
                      <span>{status.label}</span>
                      <Badge variant="secondary" className="text-xs px-1.5 py-0">
                        {status.count}
                      </Badge>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Frame Filters */}
              {currentFrame !== undefined && (
                <div className="space-y-2">
                  <label className={`text-xs font-semibold ${themeClasses.text.secondary} uppercase tracking-wide`}>
                    Frame
                  </label>
                  <div className="flex gap-2">
                    <Button
                      variant={frameFilter === "current" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setFrameFilter("current")}
                      className="text-xs gap-2 rounded-lg"
                    >
                      <MapPin className="h-3 w-3" />
                      <span>Current frame ({currentFrame})</span>
                      <Badge variant="secondary" className="text-xs px-1.5 py-0">
                        {comments.filter(c => c.frameNumber === currentFrame).length}
                      </Badge>
                    </Button>
                    <Button
                      variant={frameFilter === "all" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setFrameFilter("all")}
                      className="text-xs gap-2 rounded-lg"
                    >
                      <span>All frames</span>
                      <Badge variant="secondary" className="text-xs px-1.5 py-0">
                        {comments.length}
                      </Badge>
                    </Button>
                  </div>
                </div>
              )}

              {/* Frame Info */}
              {currentFrame !== undefined && (
                <div className="flex items-center gap-2 text-xs">
                  <MapPin className="h-3 w-3" />
                  <span className={themeClasses.text.muted}>
                    Viewing Frame {currentFrame}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Comments List - Compact */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {threadCount === 0 ? (
            <div className={`text-center py-8 space-y-3`}>
              <div className={`w-12 h-12 mx-auto rounded-full ${themeClasses.button} flex items-center justify-center`}>
                <MessageSquare className="h-6 w-6" />
              </div>
              <div>
                <h4 className={`font-medium text-sm ${themeClasses.text.primary}`}>
                  {searchQuery ? 'No results' : 'No comments'}
                </h4>
                <p className={`text-sm ${themeClasses.text.muted} mt-1`}>
                  {searchQuery 
                    ? 'Try modifying search terms' 
                    : 'Double-click on content to add a comment'
                  }
                </p>
              </div>
            </div>
          ) : (
            Object.values(commentThreads).map((thread: any) => {
              const { main, replies } = thread;
              const isExpanded = expandedThreads.has(main.threadId);
              const hasReplies = replies.length > 0;
              
              return (
                <div 
                  key={main._id} 
                  className={`${themeClasses.card} rounded-lg border transition-all duration-300 hover:shadow-md`}
                >
                  {/* Main Comment - Compact */}
                  <div className="p-3">
                    <div className="flex items-start gap-3">
                      {/* Avatar - Compact */}
                      <div className="w-8 h-8 bg-gradient-to-br from-gray-600 to-gray-700 rounded-full flex items-center justify-center text-white text-xs font-medium shadow-md flex-shrink-0">
                        {getInitials(main.createdByName)}
                      </div>
                      
                      <div className="flex-1 min-w-0 space-y-2">
                        {/* Header */}
                        <div className="flex items-start justify-between">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <h5 className={`font-medium text-xs ${themeClasses.text.primary}`}>
                                {main.createdByName}
                              </h5>
                              <span className={`text-xs ${themeClasses.text.muted}`}>
                                {formatDistanceToNow(new Date(main.createdAt), { 
                                  addSuffix: true, 
                                  locale: enUS 
                                })}
                              </span>
                            </div>
                            
                            {/* Metadata - Compact */}
                            <div className="flex items-center gap-1.5">
                              {main.frameNumber !== undefined && (
                                <Badge 
                                  variant="outline" 
                                  className={`text-xs ${themeClasses.badge.frame}`}
                                  onClick={() => onFrameJump && onFrameJump(main.frameNumber!)}
                                >
                                  <MapPin className="h-2.5 w-2.5 mr-0.5" />
                                  Frame {main.frameNumber}
                                </Badge>
                              )}
                              
                              <Badge 
                                variant="outline"
                                className={`text-xs h-5 ${main.status === "resolved" ? themeClasses.badge.resolved : themeClasses.badge.open}`}
                              >
                                {main.status === "resolved" ? (
                                  <CheckCircle className="h-2.5 w-2.5 mr-0.5" />
                                ) : (
                                  <Clock className="h-2.5 w-2.5 mr-0.5" />
                                )}
                                {main.status === "resolved" ? "Resolved" : "Open"}
                              </Badge>
                            </div>
                          </div>
                          
                          {/* Actions */}
                          <div className="flex items-center gap-1">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleEdit(main._id, main.content)}
                              className={`${themeClasses.button} h-6 w-6 p-0 rounded-md`}
                              title="Edit comment"
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleDelete(main._id)}
                              disabled={isDeleting}
                              className={`h-6 w-6 p-0 rounded-md text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-300`}
                              title="Delete comment"
                            >
                              {isDeleting ? (
                                <div className="w-2.5 h-2.5 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        </div>

                        {/* Content */}
                        {editingCommentId === main._id ? (
                          <div className="space-y-3">
                            <Input
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              className={`${themeClasses.input} border rounded-lg p-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500`}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  handleSaveEdit(main._id);
                                }
                                if (e.key === "Escape") {
                                  handleCancelEdit();
                                }
                              }}
                            />
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleSaveEdit(main._id)}
                                disabled={!editText.trim() || isUpdating}
                                className="gap-1 text-xs"
                              >
                                {isUpdating ? (
                                  <>
                                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>Saving...</span>
                                  </>
                                ) : (
                                  <>
                                    <Save className="w-3 h-3" />
                                    <span>Save</span>
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleCancelEdit}
                                className="text-xs"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className={`text-xs leading-relaxed ${themeClasses.text.secondary}`}>
                            {main.content}
                          </div>
                        )}

                        {/* Actions Bar - Compact */}
                        <div className="flex items-center justify-between pt-1.5">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setReplyingTo(replyingTo === main._id ? null : main._id)}
                              className={`text-xs gap-0.5 ${themeClasses.button} rounded-md h-6`}
                            >
                              <Reply className="h-2.5 w-2.5" />
                              <span>Reply</span>
                            </Button>
                            
                            {main.status === "open" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleResolve(main._id)}
                                className={`text-xs gap-0.5 ${themeClasses.button} rounded-md h-6`}
                              >
                                <CheckCircle className="h-2.5 w-2.5" />
                                <span>Resolve</span>
                              </Button>
                            )}
                          </div>
                          
                          {hasReplies && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleThreadExpansion(main.threadId)}
                              className={`text-xs gap-0.5 ${themeClasses.button} rounded-md h-6`}
                            >
                              {isExpanded ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
                              <span>
                                {replies.length} repl{replies.length === 1 ? 'y' : 'ies'}
                              </span>
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Reply Form - Compact */}
                    {replyingTo === main._id && (
                      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                        <div className="flex gap-2">
                          <div className="w-6 h-6 bg-gradient-to-br from-gray-400 to-gray-500 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                            U
                          </div>
                          <div className="flex-1 space-y-2">
                            <Input
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value)}
                              placeholder="Write a reply..."
                              className={`${themeClasses.input} border-0 focus:ring-2 focus:ring-gray-400/20 rounded-lg text-sm h-8`}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  handleReply(main);
                                }
                              }}
                            />
                            <div className="flex justify-between items-center">
                              <span className={`text-xs ${themeClasses.text.muted}`}>
                                Press Enter to send
                              </span>
                              <div className="flex gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setReplyingTo(null);
                                    setReplyText("");
                                  }}
                                  className="text-xs rounded-md h-6"
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleReply(main)}
                                  disabled={!replyText.trim()}
                                  className="text-xs gap-1 rounded-md bg-gray-700 hover:bg-gray-800 h-6"
                                >
                                  <Send className="h-3 w-3" />
                                  <span>Send</span>
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Replies - Compact */}
                  {hasReplies && isExpanded && (
                    <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                      <div className="p-3 space-y-3">
                        {replies.map((reply: any) => (
                          <div key={reply._id} className="flex items-start gap-2 group">
                            <div className="w-6 h-6 bg-gradient-to-br from-gray-400 to-gray-500 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                              {getInitials(reply.createdByName)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className={`font-medium text-xs ${themeClasses.text.primary}`}>
                                  {reply.createdByName}
                                </span>
                                <span className={`text-xs ${themeClasses.text.muted}`}>
                                  {formatDistanceToNow(new Date(reply.createdAt), { 
                                    addSuffix: true, 
                                    locale: enUS 
                                  })}
                                </span>
                                
                                {/* Reply actions - visible on hover */}
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEdit(reply._id, reply.content)}
                                    className="text-xs h-5 w-5 p-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                    title="Edit"
                                  >
                                    <Edit className="w-2.5 h-2.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(reply._id)}
                                    className="text-xs h-5 w-5 p-0 text-red-400 hover:text-red-600"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-2.5 h-2.5" />
                                  </Button>
                                </div>
                              </div>
                              
                              {editingCommentId === reply._id ? (
                                <div className="space-y-1.5">
                                  <Input
                                    value={editText}
                                    onChange={(e) => setEditText(e.target.value)}
                                    className={`${themeClasses.input} text-xs border rounded-lg p-2 focus:ring-2 focus:ring-gray-400/20 focus:border-gray-500 h-7`}
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
                                      className="gap-1 text-xs h-6"
                                    >
                                      {isUpdating ? (
                                        <>
                                          <div className="w-2 h-2 border border-white/30 border-t-white rounded-full animate-spin" />
                                          <span>Saving...</span>
                                        </>
                                      ) : (
                                        <>
                                          <Save className="w-2 h-2" />
                                          <span>Save</span>
                                        </>
                                      )}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={handleCancelEdit}
                                      className="text-xs h-6"
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className={`text-xs leading-relaxed ${themeClasses.text.secondary}`}>
                                  {reply.content}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
