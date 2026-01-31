"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Copy, Mail, Trash2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useOrigin } from "@/hooks/use-origin";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

type SharingMember = {
  id: string;
  userId?: string | null;
  name: string;
  email: string;
  imageUrl?: string | null;
  role: "viewer" | "editor";
};

type SharingInfo = {
  owner: {
    userId: string;
    name: string;
    email: string;
    imageUrl?: string | null;
    role: "owner";
  };
  members: SharingMember[];
  isOwner: boolean;
};

type ShareBoardModalProps = {
  boardId: string;
  isOpen: boolean;
  onClose: () => void;
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const ShareBoardModal = ({ boardId, isOpen, onClose }: ShareBoardModalProps) => {
  const origin = useOrigin();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const shareBoard = useMutation(api.boards.shareBoard);
  const updateBoardMemberRole = useMutation(api.boards.updateBoardMemberRole);
  const removeBoardSharing = useMutation(api.boards.removeBoardSharing);

  const sharingInfo = useQuery(
    api.boards.getBoardSharing,
    boardId ? { id: boardId as Id<"boards"> } : "skip"
  ) as SharingInfo | null | undefined;

  const url = useMemo(() => {
    if (!origin) return "";
    return `${origin}/board/${boardId}`;
  }, [origin, boardId]);

  const isOwner = sharingInfo?.isOwner ?? false;

  useEffect(() => {
    if (sharingInfo === null && isOpen) {
      toast.error("Board not found");
      onClose();
    }
  }, [sharingInfo, isOpen, onClose]);

  const onCopy = useCallback(() => {
    if (!url) return;
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success("Link copied"))
      .catch(() => toast.error("Unable to copy link"));
  }, [url]);

  const onShare = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeEmail(email);
    if (!normalized) {
      toast.error("Email required");
      return;
    }

    try {
      setIsSubmitting(true);
      await shareBoard({
        id: boardId as Id<"boards">,
        email: normalized,
        role,
      });
      setEmail("");
      toast.success("Invitation sent");
    } catch (error) {
      console.error(error);
      toast.error("Unable to share board");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onRoleChange = async (memberId: string, newRole: "viewer" | "editor") => {
    try {
      setProcessingId(memberId);
      await updateBoardMemberRole({
        id: boardId as Id<"boards">,
        memberId: memberId as Id<"boardSharing">,
        role: newRole,
      });
      toast.success("Role updated");
    } catch (error) {
      console.error(error);
      toast.error("Unable to update role");
    } finally {
      setProcessingId(null);
    }
  };

  const onRemove = async (memberId: string) => {
    try {
      setProcessingId(memberId);
      await removeBoardSharing({
        id: boardId as Id<"boards">,
        memberId: memberId as Id<"boardSharing">,
      });
      toast.success("Access revoked");
    } catch (error) {
      console.error(error);
      toast.error("Unable to revoke access");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (!open ? onClose() : null)}>
      <DialogContent className="max-w-xl bg-white text-slate-900 border border-slate-200/80 shadow-xl">
        <DialogHeader>
          <DialogTitle>Share board</DialogTitle>
          <DialogDescription>
            Invite collaborators to view or edit this board.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-slate-50 px-4 py-3 text-sm">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Share link</span>
              <span className="font-medium text-slate-700">{url || "—"}</span>
            </div>
            <Button variant="secondary" size="sm" onClick={onCopy} disabled={!url}>
              <Copy className="mr-2 h-4 w-4" /> Copy
            </Button>
          </div>

          <Separator />

          <form onSubmit={onShare} className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex-1">
                <Input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="email@studio.com"
                  type="email"
                  disabled={!isOwner}
                />
              </div>
              <Select value={role} onValueChange={(value) => setRole(value as "viewer" | "editor")} disabled={!isOwner}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" disabled={!isOwner || isSubmitting} className="sm:w-[140px]">
                <Mail className="mr-2 h-4 w-4" />
                Invite
              </Button>
            </div>
            {!isOwner && (
              <p className="text-xs text-muted-foreground">
                Only the board owner can invite new members.
              </p>
            )}
          </form>

          <Separator />

          <div className="space-y-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Owner</p>
              <div className="mt-2 flex items-center justify-between rounded-xl border border-slate-200/70 bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{sharingInfo?.owner?.name ?? "Owner"}</p>
                  <p className="text-xs text-slate-500">{sharingInfo?.owner?.email ?? ""}</p>
                </div>
                <Badge variant="secondary">Owner</Badge>
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Members</p>
              <div className="mt-2 space-y-2">
                {(sharingInfo?.members ?? []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                    No members yet.
                  </div>
                ) : (
                  (sharingInfo?.members ?? []).map((member) => (
                    <div
                      key={member.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-slate-50 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{member.name || member.email}</p>
                        <p className="text-xs text-slate-500">{member.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isOwner ? (
                          <Select
                            value={member.role}
                            onValueChange={(value) => onRoleChange(member.id, value as "viewer" | "editor")}
                            disabled={processingId === member.id}
                          >
                            <SelectTrigger className="w-[120px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="viewer">Viewer</SelectItem>
                              <SelectItem value="editor">Editor</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="secondary">{member.role}</Badge>
                        )}
                        {isOwner ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onRemove(member.id)}
                            disabled={processingId === member.id}
                            aria-label="Remove member"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
