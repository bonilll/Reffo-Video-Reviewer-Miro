"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { X, Play, Image, Video, Eye, Pencil, MessageSquare, Users, History, Plus, ExternalLink, Calendar, Clock, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { ReviewAssetType, ReviewCompareMode } from "@/types/canvas";
import { formatDistanceToNow } from "date-fns";
import { enUS } from "date-fns/locale";

interface ReviewSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  boardId: Id<"boards">;
  primaryAsset?: {
    id: string;
    type: ReviewAssetType;
    url: string;
    name?: string;
  };
  availableAssets?: Array<{
    id: string;
    type: ReviewAssetType;
    url: string;
    name?: string;
  }>;
  existingSessions?: Array<{
    _id: Id<"reviewSessions">;
    title: string;
    status: string;
    createdBy: string;
    createdByName: string;
    createdAt: string;
    primaryAssetId: string;
    primaryAssetType: ReviewAssetType;
    primaryAssetUrl: string;
    shareAccess?: {
      canView: boolean;
      canComment: boolean;
      canAnnotate: boolean;
    };
  }>;
}

const defaultDrawingTools = ["freehand", "rectangle", "circle", "arrow", "text", "comment"];

export function ReviewSessionModal({
  isOpen,
  onClose,
  boardId,
  primaryAsset,
  availableAssets = [],
  existingSessions = []
}: ReviewSessionModalProps) {
  const router = useRouter();
  const createSession = useMutation(api.review.createReviewSession);
  const deleteSession = useMutation(api.review.deleteReviewSession);

  // Using existingSessions passed as prop instead of internal query

  const [viewMode, setViewMode] = useState<"existing" | "create">("existing"); // Start by showing existing sessions
  const [formData, setFormData] = useState({
    title: `Review: ${primaryAsset?.name || 'Asset'}`,
    description: "",
    settings: {
      allowDrawing: true,
      allowComments: true,
      compareMode: "none" as ReviewCompareMode,
      videoSyncEnabled: true,
      drawingTools: [...defaultDrawingTools]
    }
  });

  const [selectedCompareAssets, setSelectedCompareAssets] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<any>(null);

  // Automatically switch view mode based on context
  useEffect(() => {
    if (existingSessions && existingSessions.length === 0 && primaryAsset) {
      // If no existing sessions but we have a selected asset, show create mode
      setViewMode("create");
    } else if (existingSessions && existingSessions.length > 0) {
      // If there are existing sessions, show them first
      setViewMode("existing");
    } else if (!primaryAsset) {
      // If no asset selected, can only view existing sessions
      setViewMode("existing");
    }
  }, [existingSessions, primaryAsset]);

  const handleOpenExisting = (sessionId: string) => {
    onClose();
    router.push(`/review/${sessionId}`);
  };

  const handleDeleteClick = (session: any) => {
    setSessionToDelete(session);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!sessionToDelete) return;

    setDeletingSessionId(sessionToDelete._id);
    try {
      await deleteSession({ sessionId: sessionToDelete._id });
      toast.success("Sessione eliminata con successo");
      setDeleteDialogOpen(false);
      setSessionToDelete(null);
      // La lista si aggiornerà automaticamente grazie al query
    } catch (error) {
      console.error("Error deleting session:", error);
      toast.error("Errore nell'eliminazione della sessione");
    } finally {
      setDeletingSessionId(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSessionToDelete(null);
  };

  const handleCreate = async () => {
    if (!formData.title.trim()) {
      toast.error("Il titolo è obbligatorio");
      return;
    }

    if (!primaryAsset) {
      toast.error("Nessun asset selezionato per creare la sessione");
      return;
    }

    setIsCreating(true);
    try {
      const compareAssets = selectedCompareAssets.map(id => {
        const asset = availableAssets.find(a => a.id === id);
        return asset ? {
          id: asset.id,
          type: asset.type,
          url: asset.url,
          name: asset.name
        } : null;
      }).filter(Boolean);

      const sessionId = await createSession({
        title: formData.title,
        description: formData.description || undefined,
        boardId,
        primaryAssetId: primaryAsset.id,
        primaryAssetType: primaryAsset.type,
        primaryAssetUrl: primaryAsset.url,
        compareAssets: compareAssets.length > 0 ? compareAssets : undefined,
        settings: formData.settings
      });

      toast.success("Sessione di review creata!");
      onClose();
      
      router.push(`/review/${sessionId}`);
    } catch (error) {
      console.error("Error creating review session:", error);
      toast.error("Errore nella creazione della sessione");
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    // Reset form state when closing
    setFormData({
      title: `Review: ${primaryAsset.name || 'Asset'}`,
      description: "",
      settings: {
        allowDrawing: true,
        allowComments: true,
        compareMode: "none" as ReviewCompareMode,
        videoSyncEnabled: true,
        drawingTools: [...defaultDrawingTools]
      }
    });
    setSelectedCompareAssets([]);
    setIsCreating(false);
    setViewMode("existing"); // Reset to existing sessions view
    setDeletingSessionId(null);
    setDeleteDialogOpen(false);
    setSessionToDelete(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()} modal={true}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onPointerDownOutside={handleClose} onEscapeKeyDown={handleClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-blue-600" />
            {existingSessions && existingSessions.length > 0 
              ? "Review - Apri o Crea Sessione" 
              : "Crea Sessione di Review"
            }
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Asset Info */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Asset</Label>
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              {primaryAsset.type === "image" ? (
                <Image className="h-5 w-5 text-gray-600" />
              ) : (
                <Video className="h-5 w-5 text-gray-600" />
              )}
              <div className="flex-1">
                <p className="font-medium text-sm">{primaryAsset.name || "Asset senza nome"}</p>
                <p className="text-xs text-gray-500 capitalize">{primaryAsset.type}</p>
              </div>
            </div>
          </div>

          {/* Mode Toggle */}
          {existingSessions && existingSessions.length > 0 && (
            <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-lg">
              <Button
                variant={viewMode === "existing" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("existing")}
                className={`gap-2 ${primaryAsset ? "flex-1" : "w-full"}`}
              >
                <History className="h-4 w-4" />
                Sessioni Esistenti ({existingSessions.length})
              </Button>
              {primaryAsset && (
                <Button
                  variant={viewMode === "create" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("create")}
                  className="flex-1 gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Nuova Sessione
                </Button>
              )}
            </div>
          )}

          {/* Existing Sessions View */}
          {viewMode === "existing" && existingSessions && existingSessions.length > 0 && (
            <div className="space-y-4">
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {existingSessions.map((session) => (
                  <div
                    key={session._id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-sm">{session.title}</h4>
                        <Badge 
                          variant={session.status === "active" ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {session.status === "active" ? "Attiva" : 
                           session.status === "completed" ? "Completata" : "Archiviata"}
                        </Badge>
                      </div>
                      {session.description && (
                        <p className="text-xs text-gray-600 mb-2">{session.description}</p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDistanceToNow(new Date(session.createdAt), { 
                            addSuffix: true, 
                            locale: enUS 
                          })}
                        </div>
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {session.collaborators.length} collaborator{session.collaborators.length !== 1 ? 'i' : 'e'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteClick(session)}
                        disabled={deletingSessionId === session._id}
                        className="gap-2"
                      >
                        {deletingSessionId === session._id ? (
                          <>
                            <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent" />
                            Eliminando...
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4" />
                            Elimina
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleOpenExisting(session._id)}
                        className="gap-2"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Apri
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Create New Session View */}
          {viewMode === "create" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Titolo della Sessione</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Es. Review UI Design v2.1"
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrizione (opzionale)</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Descrivi cosa deve essere revisionato..."
                  rows={3}
                  className="w-full resize-none"
                />
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={handleClose} disabled={isCreating}>
              Annulla
            </Button>
            {viewMode === "create" && (
              <Button onClick={handleCreate} disabled={isCreating}>
                {isCreating ? "Creazione..." : "Crea Sessione"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Eliminare la sessione?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare la sessione "{sessionToDelete?.title}"?
              <br />
              <strong>Questa azione non può essere annullata.</strong>
              <br />
              Verranno eliminati tutti i commenti e le annotazioni associate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDeleteCancel}>
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-500 hover:bg-red-600"
              disabled={deletingSessionId !== null}
            >
              {deletingSessionId ? "Eliminando..." : "Elimina Sessione"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
