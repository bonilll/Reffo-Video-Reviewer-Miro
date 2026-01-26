"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { User, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { Id } from "@/convex/_generated/dataModel";

interface ProposeAuthorDialogProps {
  assetId: Id<"assets">;
  currentAuthor?: string;
}

export function ProposeAuthorDialog({ assetId, currentAuthor }: ProposeAuthorDialogProps) {
  const [open, setOpen] = useState(false);
  const [proposedAuthor, setProposedAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const proposeAuthor = useMutation(api.reports.proposeAuthor);

  const handleSubmit = async () => {
    if (!proposedAuthor.trim()) {
      toast.error("Please enter an author name");
      return;
    }

    setIsSubmitting(true);
    try {
      await proposeAuthor({
        assetId,
        proposedAuthor: proposedAuthor.trim(),
        description: description.trim() || undefined,
      });

      toast.success("Author proposal submitted successfully. Thank you for helping identify creators!");
      setOpen(false);
      setProposedAuthor("");
      setDescription("");
    } catch (error: any) {
      if (error.message.includes("already proposed")) {
        toast.error("You have already proposed an author for this image");
      } else {
        toast.error("Failed to submit proposal. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-300"
        >
          <User className="h-4 w-4 mr-2" />
          Know the Author?
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-blue-500" />
            Propose Author
          </DialogTitle>
          <DialogDescription>
            Help us credit the right creator! If you know who made this image, 
            please share the information with us.
            {currentAuthor && (
              <span className="block mt-2 text-sm text-muted-foreground">
                Current author: <span className="font-medium">{currentAuthor}</span>
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Author name *</label>
            <Input
              placeholder="Enter the artist/creator name..."
              value={proposedAuthor}
              onChange={(e) => setProposedAuthor(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Source or additional info (optional)
            </label>
            <Textarea
              placeholder="Where did you find this information? Any links or additional context..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !proposedAuthor.trim()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSubmitting ? (
              <>
                <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                Submitting...
              </>
            ) : (
              "Submit Proposal"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 