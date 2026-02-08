"use client";

import type { DropdownMenuContentProps } from "@radix-ui/react-dropdown-menu";
import { Link2, Pencil, Trash2, Image as ImageIcon, Share, Archive, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";
import { useState, useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useRenameModal } from "@/store/use-rename-modal";
import { compressImage } from "@/lib/image-compression";

type ActionsProps = {
  children: React.ReactNode;
  side?: DropdownMenuContentProps["side"];
  sideOffset?: DropdownMenuContentProps["sideOffset"];
  id: string;
  title: string;
  align?: DropdownMenuContentProps["align"];
  onShare?: () => void;
  isOwner?: boolean;
};

export const Actions = ({
  children,
  side,
  sideOffset,
  id,
  title,
  align,
  onShare,
  isOwner = false,
}: ActionsProps) => {
  const { onOpen } = useRenameModal();
  const { mutate: removeBoard, pending: removePending } = useApiMutation(api.board.remove);
  const { mutate: archiveBoard, pending: archivePending } = useApiMutation(api.board.archive);
  const { mutate: updateImage, pending: updatePending } = useApiMutation(api.board.updateImage);
  const { mutate: deleteMedia } = useApiMutation(api.media.deleteByBoard);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  
  const onCopyLink = () => {
    navigator.clipboard
      .writeText(`${window.location.origin}/board/${id}`)
      .then(() => toast.success("Link copied successfully."))
      .catch(() => toast.error("Unable to copy link."));
  };

  const onDelete = async () => {
    try {
      // Check if user is owner - if not, this will just remove them from sharing
      await removeBoard({ id });
      
      // Show appropriate success message
      toast.success("Removed from board successfully.");
      
      // Close the modal
      setIsDeleteModalOpen(false);
      
      // Delay navigation to allow toast to show and state to update
      setTimeout(() => {
        window.location.href = "/workspaces";
      }, 300);
    } catch (error) {
      console.error("Error removing board:", error);
      const errorMessage = error instanceof Error ? error.message : "Unable to remove board.";
      toast.error(errorMessage);
    }
  };

  const onArchive = async () => {
    try {
      // Close the dropdown menu first
      setIsMenuOpen(false);
      
      await archiveBoard({ id });
      toast.success("Board archived successfully.");
      
      // Delay navigation to allow toast to show and state to update
      setTimeout(() => {
        window.location.href = "/workspaces";
      }, 300);
    } catch (error) {
      console.error("Error archiving board:", error);
      const errorMessage = error instanceof Error ? error.message : "Unable to archive board.";
      toast.error(errorMessage);
    }
  };
  
  const handleDeleteClick = () => {
    // Close the dropdown menu first
    setIsMenuOpen(false);
    // Then open the delete confirmation modal
    setTimeout(() => {
      setIsDeleteModalOpen(true);
    }, 100);
  };
  
  const onUploadImage = () => {
    // Close the menu after clicking on the element
    setIsMenuOpen(false);
    
    // Simulate click on hidden input to open file selector
    fileInputRef.current?.click();
  };
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Check file type
    if (!file.type.startsWith('image/')) {
      toast.error("Please upload only images.");
      return;
    }
    
    // Check file size (limit to 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image is too large. Limit is 5MB.");
      return;
    }
    
    try {
      toast.loading("Uploading image...");
      
      // Compress the image before uploading
      const compressedBlob = await compressImage(file);
      
      // Convert the image to a base64 string
      const reader = new FileReader();
      reader.onload = async (event) => {
        if (!event.target?.result) return;
        
        try {
          const imageUrl = event.target.result.toString();
          await updateImage({ id, imageUrl });
          toast.dismiss();
          toast.success("Cover image updated.");
          
          // Reload the page to show the new image
          setTimeout(() => {
            window.location.reload();
          }, 300);
        } catch (error) {
          console.error("Error updating image:", error);
          toast.dismiss();
          toast.error("Unable to update cover image.");
        }
      };
      
      reader.readAsDataURL(compressedBlob);
    } catch (error) {
      console.error("Error processing image:", error);
      toast.dismiss();
      toast.error("An error occurred while processing the image.");
    } finally {
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  
  const handleShareClick = () => {
    setIsMenuOpen(false);
    if (onShare) {
      onShare();
    }
  };

  return (
    <>
      <input 
        type="file" 
        ref={fileInputRef} 
        accept="image/*" 
        onChange={handleFileChange} 
        className="hidden" 
        aria-label="Upload cover image"
      />
      <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent
          onClick={(e) => e.stopPropagation()}
          side={side}
          sideOffset={sideOffset}
          align={align}
          className="w-60 rounded-xl border border-slate-200 bg-white text-slate-900 shadow-xl"
          data-a11y-fix="true"
        >
          {onShare && (
            <DropdownMenuItem onClick={handleShareClick} className="p-3 cursor-pointer text-slate-700 hover:text-slate-900 hover:bg-slate-50">
              <Share className="h-4 w-4 mr-2" />
              Share board
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onCopyLink} className="p-3 cursor-pointer text-slate-700 hover:text-slate-900 hover:bg-slate-50">
            <Link2 className="h-4 w-4 mr-2" />
            Copy board link
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onOpen(id, title)}
            className="p-3 cursor-pointer text-slate-700 hover:text-slate-900 hover:bg-slate-50"
          >
            <Pencil className="h-4 w-4 mr-2" />
            Rename
          </DropdownMenuItem>
          {isOwner && (
          <DropdownMenuItem
            onClick={onUploadImage}
            className="p-3 cursor-pointer text-slate-700 hover:text-slate-900 hover:bg-slate-50"
            disabled={updatePending}
          >
            <ImageIcon className="h-4 w-4 mr-2" />
            Change image
          </DropdownMenuItem>
          )}
          <DropdownMenuSeparator className="bg-slate-200" />
          {isOwner && (
            <DropdownMenuItem
              onClick={onArchive}
              className="p-3 cursor-pointer text-slate-700 hover:text-slate-900 hover:bg-slate-50"
              disabled={archivePending}
            >
              <Archive className="h-4 w-4 mr-2" />
              Archive
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={handleDeleteClick}
            className="p-3 cursor-pointer text-red-600 hover:text-red-700 hover:bg-red-50"
            disabled={removePending}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {isOwner ? "Delete" : "Leave"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete confirmation dialog - outside of the dropdown */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="sm:max-w-md bg-white text-slate-900 border border-slate-200" style={{ zIndex: 10000 }}>
          <DialogHeader>
            <DialogTitle>{isOwner ? "Delete board?" : "Leave board?"}</DialogTitle>
            <DialogDescription>
              {isOwner 
                ? "This action will permanently delete the board and all its contents." 
                : "This action will remove you from the board. Other members will still have access."
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
            <Button
              variant="outline"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={removePending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onDelete}
              disabled={removePending}
            >
              {removePending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  {isOwner ? "Deleting..." : "Leaving..."}
                </>
              ) : (
                isOwner ? "Delete" : "Leave"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
