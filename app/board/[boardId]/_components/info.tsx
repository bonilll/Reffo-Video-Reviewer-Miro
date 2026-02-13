"use client";

import { useQuery } from "convex/react";
import { ArrowLeft, LogOut, Pencil } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useRenameModal } from "@/store/use-rename-modal";

type InfoProps = {
  boardId: string;
  projectId?: string | null;
  compactMobile?: boolean;
};

export const Info = ({ boardId, projectId, compactMobile = false }: InfoProps) => {
  const { onOpen } = useRenameModal();
  const data = useQuery(api.board.get, {
    id: boardId as Id<"boards">,
  });

  if (!data) return <InfoSkeleton />;

  const projectHref = projectId ? `/project/${projectId}` : "/workspaces";

  if (compactMobile) {
    return (
      <div className="absolute top-3 left-3 right-3 z-40">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200/70 bg-white/95 px-2.5 py-2 shadow-lg shadow-slate-200/40 backdrop-blur-md">
          <Link
            href={projectHref}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/70 bg-slate-50/80 text-slate-700 transition-colors hover:bg-white"
            aria-label="Back to project"
            data-no-board-gestures="true"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="relative h-5 w-5 shrink-0">
            <Image src="/logo.svg" alt="Reffo Logo" fill className="object-contain" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{data.title}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute top-4 left-4 z-40 flex items-center gap-2 rounded-2xl border border-slate-200/70 bg-white/90 px-3 py-2 shadow-xl shadow-slate-200/40 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <Link
          href={projectHref}
          className="group inline-flex items-center gap-2 rounded-xl border border-slate-200/70 bg-slate-50/80 px-3 py-2 text-xs font-semibold text-slate-600 transition-all duration-200 hover:bg-white hover:text-slate-900 hover:shadow-sm"
          aria-label="Back to project"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Project</span>
        </Link>
        <Link
          href="/workspaces"
          className="group inline-flex items-center gap-2 rounded-xl border border-slate-200/70 bg-slate-50/80 px-3 py-2 text-xs font-semibold text-slate-600 transition-all duration-200 hover:bg-white hover:text-slate-900 hover:shadow-sm"
          aria-label="Exit board"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Exit</span>
        </Link>
      </div>

      <div className="h-6 w-px bg-slate-200/80" />

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200/70 bg-white/90 px-2 py-1.5 shadow-sm">
          <div className="relative h-5 w-5">
            <Image
              src="/logo.svg"
              alt="Reffo Logo"
              fill
              className="object-contain"
            />
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Reffo
          </span>
        </div>
        <button
          onClick={() => onOpen(boardId, data.title)}
          className="group inline-flex items-center gap-2 rounded-xl border border-slate-200/70 bg-slate-50/80 px-3 py-1.5 text-sm font-semibold text-slate-800 transition-all duration-200 hover:bg-white hover:shadow-sm"
          aria-label="Rename board"
        >
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Board
          </span>
          <span className="max-w-[220px] truncate">{data.title}</span>
          <Pencil className="h-3.5 w-3.5 text-slate-400 transition-colors duration-200 group-hover:text-slate-600" />
        </button>
      </div>
    </div>
  );
};

export const InfoSkeleton = () => {
  return (
    <div
      className="absolute top-4 left-4 z-40 w-[520px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200/70 bg-white/90 px-3 py-2 shadow-lg shadow-slate-200/40 backdrop-blur-md overflow-hidden"
      aria-hidden
    >
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2">
          <div className="h-8 w-20 rounded-xl bg-slate-200/80 animate-pulse" />
          <div className="h-8 w-16 rounded-xl bg-slate-200/80 animate-pulse" />
        </div>
        <div className="h-6 w-px bg-slate-200/80" />
        <div className="flex items-center gap-2 flex-1">
          <div className="h-7 w-20 rounded-xl bg-slate-200/70 animate-pulse" />
          <div className="h-8 w-full max-w-[220px] rounded-xl bg-slate-200/80 animate-pulse" />
        </div>
      </div>
    </div>
  );
};
