"use client";

import { useQuery } from "convex/react";
import { ArrowLeft, Home } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Actions } from "@/components/actions";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useRenameModal } from "@/store/use-rename-modal";

const TabSeparator = () => <div className="h-6 w-px bg-neutral-200 mx-2"></div>;

type InfoProps = {
  boardId: string;
};

export const Info = ({ boardId }: InfoProps) => {
  const { onOpen } = useRenameModal();
  const data = useQuery(api.board.get, {
    id: boardId as Id<"boards">,
  });

  if (!data) return <InfoSkeleton />;

  return (
    <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm rounded-lg px-3 py-2 flex items-center shadow-md border border-white/20 min-h-[44px]">
      {/* Exit Board Button - Only Arrow */}
      <Hint label="Back to Workspace" side="bottom" sideOffset={10}>
        <Button 
          variant="ghost" 
          size="sm"
          className="mr-2 hover:bg-gray-100 transition-colors duration-200 rounded-md p-2 h-8 w-8"
          asChild
        >
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
      </Hint>

      <TabSeparator />

      {/* Logo Only - No Brand Text */}
      <Hint label="Go to Workspace" side="bottom" sideOffset={10}>
        <Button 
          variant="ghost" 
          className="px-2 py-2 hover:bg-gray-100 transition-colors duration-200 rounded-md h-8 w-8" 
          asChild
        >
          <Link href="/dashboard" className="flex items-center">
            <div className="relative w-6 h-6">
              <Image
                src="/logo.svg"
                alt="Reffo Logo"
                fill
                priority
                className="object-contain"
              />
            </div>
          </Link>
        </Button>
      </Hint>

      <TabSeparator />

      {/* Board Title */}
      <Hint label="Board Title" side="bottom" sideOffset={10}>
        <div className="flex items-center px-3 py-2 rounded-lg bg-gray-50/50">
          <Home className="h-4 w-4 mr-2 text-gray-500" />
          <span className="text-sm font-medium text-gray-700 max-w-[200px] truncate">
            {data.title}
          </span>
        </div>
      </Hint>
    </div>
  );
};

export const InfoSkeleton = () => {
  return (
    <div
      className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm rounded-xl px-4 py-3 h-[60px] w-[400px] flex items-center shadow-lg border border-white/20"
      aria-hidden
    >
      <div className="flex items-center space-x-4">
        <div className="w-20 h-8 bg-gray-200 rounded-lg animate-pulse"></div>
        <div className="h-6 w-px bg-gray-200"></div>
        <div className="w-24 h-8 bg-gray-200 rounded-lg animate-pulse"></div>
        <div className="h-6 w-px bg-gray-200"></div>
        <div className="w-32 h-8 bg-gray-200 rounded-lg animate-pulse"></div>
      </div>
    </div>
  );
};
