"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Share2, 
  Copy, 
  Users, 
  Link as LinkIcon, 
  Eye, 
  MessageSquare, 
  Pencil,
  Trash2,
  Calendar,
  Clock,
  ChevronDown,
  ChevronUp,
  Check,
  AlertCircle,
  Globe,
  UserCheck
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { enUS } from "date-fns/locale";

interface ReviewSharingModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: Id<"reviewSessions">;
  sessionTitle: string;
  isOwner: boolean;
}

export function ReviewSharingModal({
  isOpen,
  onClose,
  sessionId,
  sessionTitle,
  isOwner
}: ReviewSharingModalProps) {
  const [expandedSharing, setExpandedSharing] = useState<string | null>(null);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Queries
  const sharing = useQuery(api.review.getReviewSharing, 
    isOwner && isOpen ? { sessionId } : "skip"
  );

  // Mutations
  const createSharing = useMutation(api.review.createReviewSharing);
  const updateSharing = useMutation(api.review.updateReviewSharing);
  const deleteSharing = useMutation(api.review.deleteReviewSharing);

  // Create board users sharing (automatic access for board users)
  const handleCreateBoardUsersSharing = async () => {
    if (!isOwner) {
      toast.error("Solo il creatore può gestire la condivisione");
      return;
    }

    try {
      await createSharing({
        sessionId,
        shareType: "board_users",
        permissions: {
          canView: true,
          canComment: true,
          canAnnotate: true
        }
      });
      toast.success("Accesso abilitato per tutti gli utenti della board");
    } catch (error) {
      console.error("Error creating board users sharing:", error);
      toast.error("Errore nell'abilitazione dell'accesso");
    }
  };

  // Create public link sharing
  const handleCreatePublicLink = async (permissions: {
    canView: boolean;
    canComment: boolean;
    canAnnotate: boolean;
    requiresName?: boolean;
  }, expiresAt?: string) => {
    if (!isOwner) {
      toast.error("Solo il creatore può creare link pubblici");
      return;
    }

    setIsCreatingLink(true);
    try {
      const result = await createSharing({
        sessionId,
        shareType: "public_link",
        permissions,
        expiresAt
      });
      
      if (result.shareUrl) {
        await navigator.clipboard.writeText(window.location.origin + result.shareUrl);
        toast.success("Link pubblico creato e copiato negli appunti!");
      }
    } catch (error) {
      console.error("Error creating public link:", error);
      toast.error("Errore nella creazione del link pubblico");
    } finally {
      setIsCreatingLink(false);
    }
  };

  // Copy link to clipboard
  const handleCopyLink = async (shareUrl: string) => {
    try {
      await navigator.clipboard.writeText(window.location.origin + shareUrl);
      toast.success("Link copiato negli appunti!");
    } catch (error) {
      toast.error("Errore nella copia del link");
    }
  };

  // Delete sharing
  const handleDeleteSharing = async (sharingId: Id<"reviewSharing">) => {
    if (!isOwner) {
      toast.error("Solo il creatore può eliminare la condivisione");
      return;
    }

    try {
      await deleteSharing({ sharingId });
      toast.success("Condivisione eliminata");
    } catch (error) {
      console.error("Error deleting sharing:", error);
      toast.error("Errore nell'eliminazione della condivisione");
    }
  };

  if (!isOwner && isOpen) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Accesso Limitato
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-600">
              Solo il creatore della sessione di review può gestire le impostazioni di condivisione.
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={onClose}>Chiudi</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const boardUsersSharing = sharing?.find(s => s.shareType === "board_users");
  const publicLinks = sharing?.filter(s => s.shareType === "public_link") || [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Condivisione Review: {sessionTitle}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Board Users Access */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5" />
                Accesso Utenti Board
              </CardTitle>
              <CardDescription>
                Consenti l'accesso a tutti gli utenti che hanno accesso alla board principale
              </CardDescription>
            </CardHeader>
            <CardContent>
              {boardUsersSharing ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <UserCheck className="h-3 w-3" />
                      Abilitato
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteSharing(boardUsersSharing._id)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Disabilita
                    </Button>
                  </div>
                  
                  <div className="text-sm text-gray-600">
                    <p>Permessi:</p>
                    <ul className="list-disc list-inside ml-2 mt-1">
                      {boardUsersSharing.permissions.canView && <li>Visualizzazione</li>}
                      {boardUsersSharing.permissions.canComment && <li>Commenti</li>}
                      {boardUsersSharing.permissions.canAnnotate && <li>Annotazioni</li>}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    Gli utenti della board potranno accedere automaticamente a questa review session.
                  </p>
                  <Button onClick={handleCreateBoardUsersSharing}>
                    <Users className="h-4 w-4 mr-2" />
                    Abilita Accesso Utenti Board
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Public Links */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Globe className="h-5 w-5" />
                Link Pubblici
              </CardTitle>
              <CardDescription>
                Crea link condivisibili per consentire l'accesso a chiunque abbia il link
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Existing public links */}
                {publicLinks.map((link) => (
                  <div key={link._id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <LinkIcon className="h-4 w-4" />
                        <span className="font-medium">Link Pubblico</span>
                        {link.expiresAt && new Date(link.expiresAt) < new Date() && (
                          <Badge variant="destructive">Scaduto</Badge>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {link.shareUrl && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyLink(link.shareUrl!)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteSharing(link._id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="text-sm text-gray-600 space-y-1">
                      <div className="flex items-center gap-4">
                        <span>Permessi:</span>
                        <div className="flex gap-3">
                          {link.permissions.canView && (
                            <Badge variant="outline" className="text-xs">
                              <Eye className="h-3 w-3 mr-1" />
                              Vista
                            </Badge>
                          )}
                          {link.permissions.canComment && (
                            <Badge variant="outline" className="text-xs">
                              <MessageSquare className="h-3 w-3 mr-1" />
                              Commenti
                            </Badge>
                          )}
                          {link.permissions.canAnnotate && (
                            <Badge variant="outline" className="text-xs">
                              <Pencil className="h-3 w-3 mr-1" />
                              Annotazioni
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      {link.expiresAt && (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>Scade: {new Date(link.expiresAt).toLocaleDateString()}</span>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>Creato: {formatDistanceToNow(new Date(link.createdAt), { locale: enUS })} fa</span>
                      </div>
                      
                      {link.accessCount !== undefined && (
                        <div className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          <span>Accessi: {link.accessCount}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Create new public link */}
                <div className="border-2 border-dashed border-gray-200 rounded-lg p-4">
                  <CreatePublicLinkForm
                    isCreating={isCreatingLink}
                    onCreate={handleCreatePublicLink}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Component for creating new public links
interface CreatePublicLinkFormProps {
  isCreating: boolean;
  onCreate: (permissions: {
    canView: boolean;
    canComment: boolean;
    canAnnotate: boolean;
    requiresName?: boolean;
  }, expiresAt?: string) => Promise<void>;
}

function CreatePublicLinkForm({ isCreating, onCreate }: CreatePublicLinkFormProps) {
  const [permissions, setPermissions] = useState({
    canView: true,
    canComment: true,
    canAnnotate: false,
    requiresName: true
  });
  const [expiresAt, setExpiresAt] = useState("");
  const [showExpiration, setShowExpiration] = useState(false);

  const handleSubmit = async () => {
    const expirationDate = showExpiration && expiresAt 
      ? new Date(expiresAt).toISOString()
      : undefined;

    await onCreate(permissions, expirationDate);
  };

  return (
    <div className="space-y-4">
      <h4 className="font-medium flex items-center gap-2">
        <LinkIcon className="h-4 w-4" />
        Crea Nuovo Link Pubblico
      </h4>

      {/* Permissions */}
      <div className="space-y-3">
        <Label>Permessi</Label>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              <span className="text-sm">Visualizzazione</span>
            </div>
            <Switch
              checked={permissions.canView}
              onCheckedChange={(checked) => 
                setPermissions(prev => ({ ...prev, canView: checked }))
              }
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              <span className="text-sm">Commenti</span>
            </div>
            <Switch
              checked={permissions.canComment}
              onCheckedChange={(checked) => 
                setPermissions(prev => ({ ...prev, canComment: checked }))
              }
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              <span className="text-sm">Annotazioni</span>
            </div>
            <Switch
              checked={permissions.canAnnotate}
              onCheckedChange={(checked) => 
                setPermissions(prev => ({ ...prev, canAnnotate: checked }))
              }
            />
          </div>
        </div>
      </div>

      {/* Require name for anonymous users */}
      {permissions.canComment && (
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Richiedi nome per commenti anonimi</Label>
            <p className="text-xs text-gray-500">Gli utenti senza account dovranno fornire un nome</p>
          </div>
          <Switch
            checked={permissions.requiresName}
            onCheckedChange={(checked) => 
              setPermissions(prev => ({ ...prev, requiresName: checked }))
            }
          />
        </div>
      )}

      {/* Expiration */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Scadenza link</Label>
          <Switch
            checked={showExpiration}
            onCheckedChange={setShowExpiration}
          />
        </div>
        
        {showExpiration && (
          <Input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
          />
        )}
      </div>

      <Button 
        onClick={handleSubmit} 
        disabled={isCreating || !permissions.canView}
        className="w-full"
      >
        {isCreating ? (
          <>Creazione link...</>
        ) : (
          <>
            <LinkIcon className="h-4 w-4 mr-2" />
            Crea Link Pubblico
          </>
        )}
      </Button>
    </div>
  );
}