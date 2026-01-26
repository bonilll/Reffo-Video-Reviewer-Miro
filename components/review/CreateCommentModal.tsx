"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MessageSquare } from "lucide-react";

interface CreateCommentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (content: string) => Promise<void>;
  position: { x: number; y: number } | null;
}

export function CreateCommentModal({
  isOpen,
  onClose,
  onSubmit,
  position
}: CreateCommentModalProps) {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(content);
      setContent("");
    } catch (error) {
      console.error("Error creating comment:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-blue-600" />
            Aggiungi Commento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {position && (
            <div className="text-sm text-gray-600">
              Posizione: ({Math.round(position.x)}, {Math.round(position.y)})
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="comment-content">Commento</Label>
            <Textarea
              id="comment-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Scrivi il tuo commento qui..."
              rows={4}
              className="resize-none"
              autoFocus
            />
            <div className="text-xs text-gray-500">
              Premi Ctrl+Enter per inviare
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button 
              variant="outline" 
              onClick={onClose}
              disabled={isSubmitting}
            >
              Annulla
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!content.trim() || isSubmitting}
            >
              {isSubmitting ? "Invio..." : "Invia Commento"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
