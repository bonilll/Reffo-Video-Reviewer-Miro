"use client";

import { useState } from "react";
import { BoardRuntimeSwitch } from "./_components/board-runtime-switch";
import { Room } from "@/components/room";
import { Loading } from "./_components/loading";
import { UploadOverlay } from "@/components/UploadOverlay";
import { InfoButton } from "./_components/info-button";
import { CameraProvider } from "@/app/contexts/CameraContext";
import { BoardSettingsProvider } from "@/app/contexts/BoardSettingsContext";
import { usePlanLimits } from "@/hooks/use-plan-limits";
import { UpgradePrompt } from "@/components/subscription/upgrade-prompt";
import { ShareBoardModal } from "@/components/board/ShareBoardModal";

// 🛡️ SECURITY INTEGRATION - Proper access control
import { RouteGuard } from "@/components/auth/RouteGuard";
import { useSecureParams } from "@/hooks/use-secure-navigation";
import { InvalidUrlPage } from "@/components/auth/URLProtection";
import { useResourcePermissions } from "@/hooks/use-resource-permissions";

type BoardIdPageProps = {
  params: {
    boardId: string;
  };
};

export default function BoardIdPage({ params }: BoardIdPageProps) {
  // State for upgrade prompt
  const [upgradePrompt, setUpgradePrompt] = useState({
    isOpen: false,
    limitType: "",
    limitValue: ""
  });
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  
  // Hook per i limiti del piano
  const { userPlan } = usePlanLimits();

  // Funzione per chiudere il popup di upgrade
  const closeUpgradePrompt = () => {
    setUpgradePrompt({
      isOpen: false,
      limitType: "",
      limitValue: ""
    });
  };

  // Funzione per mostrare il popup di upgrade
  const showUpgradePrompt = (limitType: string, limitValue?: string) => {
    setUpgradePrompt({
      isOpen: true,
      limitType,
      limitValue: limitValue || ""
    });
  };

  // 🛡️ SECURITY: Validate board ID format before proceeding
  const { validateResourceId } = useSecureParams();
  
  // DEBUG: Log the actual board ID to understand the format
  
  const boardId = validateResourceId(params.boardId);
  
  
  // If board ID format is invalid, show error page
  if (!params.boardId || params.boardId.trim().length === 0) {
    return <InvalidUrlPage reason="Invalid board ID format" />;
  }

  // Use the original board ID instead of validated one for now
  const finalBoardId = boardId || params.boardId;

  // 🛡️ SECURITY: Get user role for this board
  const { userRole, isLoading: permissionsLoading } = useResourcePermissions("board", finalBoardId);

  return (
    <>
      {/* 🛡️ SECURITY: STRICT Route protection - require authentication AND board access */}
      <RouteGuard
        requireAuth={true}
        resourceType="board"
        resourceId={finalBoardId}
        requiredPermission="read"
        showLoading={true}
        showError={true}
        onResourceNotFound={() => {
        }}
        onAccessDenied={(reason) => {
        }}
        loadingComponent={<Loading />}
      >
        <Room roomId={finalBoardId} fallback={<Loading />}>
          <CameraProvider>
            <BoardSettingsProvider 
              boardId={finalBoardId}
              onShowUpgradePrompt={showUpgradePrompt}
            >
              <BoardRuntimeSwitch
                boardId={finalBoardId}
                userRole={userRole}
                onOpenShare={() => setIsShareModalOpen(true)}
              />
              <UploadOverlay boardId={finalBoardId} userRole={userRole} />
              <InfoButton />
              <ShareBoardModal
                boardId={finalBoardId}
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
              />
            </BoardSettingsProvider>
          </CameraProvider>
        </Room>
      </RouteGuard>
      
      {/* Upgrade Prompt */}
      <UpgradePrompt
        isOpen={upgradePrompt.isOpen}
        onClose={closeUpgradePrompt}
        currentPlan={userPlan}
        limitType={upgradePrompt.limitType}
        limitValue={upgradePrompt.limitValue}
      />
    </>
  );
}
