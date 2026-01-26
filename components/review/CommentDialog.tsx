"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ReviewComment } from "@/types/canvas";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  X, 
  Send, 
  CheckCircle, 
  Clock, 
  User, 
  Reply,
  Trash2,
  MoreHorizontal,
  MessageSquare
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { enUS } from "date-fns/locale";
import { ReviewDeleteConfirmation } from "./ReviewDeleteConfirmation";

interface CommentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  comment: ReviewComment;
  replies: ReviewComment[];
  sessionId: string;
  position: { x: number; y: number };
  theme?: 'dark' | 'light';
  onCommentUpdate?: () => void;
}

export function CommentDialog({
  isOpen,
  onClose,
  comment,
  replies,
  sessionId,
  position,
  theme = 'light',
  onCommentUpdate
}: CommentDialogProps) {
  const [replyText, setReplyText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Convex mutations
  const createComment = useMutation(api.review.createComment);
  const resolveComment = useMutation(api.review.resolveComment);
  const deleteComment = useMutation(api.review.deleteComment);
  
  // Theme classes
  const themeClasses = {
    dialog: theme === 'dark' 
      ? 'bg-gray-800 border-gray-700 text-white shadow-xl' 
      : 'bg-white border-gray-200 text-gray-900 shadow-xl',
    input: theme === 'dark' 
      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500',
    button: theme === 'dark' 
      ? 'text-gray-300 hover:text-white hover:bg-gray-700' 
      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
    text: {
      primary: theme === 'dark' ? 'text-white' : 'text-gray-900',
      secondary: theme === 'dark' ? 'text-gray-200' : 'text-gray-700',
      muted: theme === 'dark' ? 'text-gray-400' : 'text-gray-500',
    }
  };
  
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);
  
  if (!isOpen) return null;
  
  const handleReply = async () => {
    if (!replyText.trim() || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      await createComment({
        sessionId: sessionId as any,
        assetId: comment.assetId,
        frameNumber: comment.frameNumber,
        frameTimestamp: comment.frameTimestamp,
        content: replyText.trim(),
        position: comment.position,
        parentCommentId: comment._id,
        threadId: comment.threadId
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
    try {
      await resolveComment({
        commentId: comment._id as any,
        status: comment.status === 'resolved' ? 'open' : 'resolved'
      });
      onCommentUpdate?.();
    } catch (error) {
      console.error("Error resolving comment:", error);
    }
  };
  
  const handleDelete = async () => {
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    try {
      await deleteComment({
        commentId: comment._id as any
      });
      onClose();
      onCommentUpdate?.();
    } catch (error) {
      console.error("Error deleting comment:", error);
    }
  };
  
  // Status info
  const StatusIcon = comment.status === 'resolved' ? CheckCircle : 
                    comment.status === 'acknowledged' ? User : Clock;
  const statusText = comment.status === 'resolved' ? 'Risolto' : 
                    comment.status === 'acknowledged' ? 'Preso in carico' : 'Aperto';
  const statusColor = comment.status === 'resolved' ? 'text-green-600' : 
                     comment.status === 'acknowledged' ? 'text-blue-600' : 'text-orange-600';
  
  // Calculate dialog position (avoid screen edges)
  const dialogWidth = 400;
  const dialogHeight = 500;
  const dialogX = Math.min(position.x, window.innerWidth - dialogWidth - 20);
  const dialogY = Math.min(position.y, window.innerHeight - dialogHeight - 20);
  
  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />
      
      {/* Dialog */}
      <div
        className={`fixed z-50 ${themeClasses.dialog} rounded-lg border max-w-sm w-96`}
        style={{
          left: dialogX,
          top: dialogY,
          maxHeight: 'calc(100vh - 40px)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-current/10">
          <div className="flex items-center gap-2">
            <StatusIcon className={`w-4 h-4 ${statusColor}`} />
            <span className={`text-sm font-medium ${statusColor}`}>
              {statusText}
            </span>
            {comment.frameNumber !== undefined && (
              <Badge variant="outline" className="text-xs">
                Frame {comment.frameNumber}
              </Badge>
            )}
          </div>
          
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onClose}
            className={themeClasses.button}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
        
        {/* Content */}
        <div className="flex flex-col max-h-96">
          {/* Main Comment */}
          <div className="p-4 border-b border-current/5">
            <div className="flex items-start gap-3">
              <Avatar className="h-8 w-8 bg-blue-600 text-white text-sm">
                {comment.createdByName.charAt(0).toUpperCase()}
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-sm font-medium ${themeClasses.text.primary}`}>
                    {comment.createdByName}
                  </span>
                  <span className={`text-xs ${themeClasses.text.muted}`}>
                    {formatDistanceToNow(new Date(comment.createdAt), { 
                      addSuffix: true, 
                      locale: enUS 
                    })}
                  </span>
                </div>
                <p className={`text-sm ${themeClasses.text.secondary}`}>
                  {comment.content}
                </p>
              </div>
            </div>
            
            {/* Main comment actions */}
            <div className="flex items-center gap-2 mt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResolve}
                className={`text-xs ${themeClasses.button}`}
              >
                {comment.status === 'resolved' ? 'Riapri' : 'Risolvi'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                className={`text-xs text-red-600 hover:text-red-700 hover:bg-red-50`}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
          
          {/* Replies */}
          {replies.length > 0 && (
            <ScrollArea className="flex-1 max-h-48">
              <div className="p-4 space-y-3">
                {replies.map((reply) => (
                  <div key={reply._id} className="flex items-start gap-3 pl-4 border-l-2 border-current/10">
                    <Avatar className="h-6 w-6 bg-gray-600 text-white text-xs">
                      {reply.createdByName.charAt(0).toUpperCase()}
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-medium ${themeClasses.text.primary}`}>
                          {reply.createdByName}
                        </span>
                        <span className={`text-xs ${themeClasses.text.muted}`}>
                          {formatDistanceToNow(new Date(reply.createdAt), { 
                            addSuffix: true, 
                            locale: enUS 
                          })}
                        </span>
                      </div>
                      <p className={`text-xs ${themeClasses.text.secondary}`}>
                        {reply.content}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
        
        {/* Reply Form */}
        <div className="p-4 border-t border-current/10">
          <div className="space-y-3">
            <Textarea
              ref={textareaRef}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Scrivi una risposta..."
              className={`min-h-[80px] text-sm ${themeClasses.input}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleReply();
                }
              }}
            />
            
            <div className="flex items-center justify-between">
              <span className={`text-xs ${themeClasses.text.muted}`}>
                Premi Enter per inviare, Shift+Enter per nuova riga
              </span>
              
              <Button
                size="sm"
                onClick={handleReply}
                disabled={!replyText.trim() || isSubmitting}
                className="gap-2"
              >
                <Send className="w-3 h-3" />
                {isSubmitting ? 'Invio...' : 'Invia'}
              </Button>
            </div>
          </div>
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