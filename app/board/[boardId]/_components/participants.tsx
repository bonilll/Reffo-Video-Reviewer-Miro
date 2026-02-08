"use client";

import { useQuery } from "convex/react";
import { ChevronDown, ShieldCheck } from "lucide-react";

import { connectionIdToColor } from "@/lib/utils";
import { useOthers, useSelf } from "@/liveblocks.config";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { UserAvatar } from "./user-avatar";

const MAX_SHOWN_OTHER_USERS = 3;

type ParticipantsProps = {
  boardId: string;
  onOpenShare?: () => void;
};

const getInitials = (name?: string) =>
  name
    ? name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "U";

const roleBadgeClasses = (role: "owner" | "editor" | "viewer") => {
  if (role === "owner") return "bg-blue-600/10 text-blue-700 border-blue-200";
  if (role === "editor") return "bg-emerald-500/10 text-emerald-700 border-emerald-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
};

export const Participants = ({ boardId, onOpenShare }: ParticipantsProps) => {
  const users = useOthers();
  const currentUser = useSelf();
  const hasMoreUsers = users.length > MAX_SHOWN_OTHER_USERS;

  const sharingInfo = useQuery(
    api.boards.getBoardSharing,
    boardId ? { id: boardId as Id<"boards"> } : "skip"
  );
  const sharingState =
    sharingInfo === undefined ? "loading" : sharingInfo === null ? "error" : "ready";

  const totalOnline = users.length + (currentUser ? 1 : 0);

  return (
    <div className="absolute top-4 right-4 z-40 flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white/90 px-3 py-2 shadow-xl shadow-slate-200/40 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <div className="flex -space-x-2">
          {users.slice(0, MAX_SHOWN_OTHER_USERS).map(({ connectionId, info, presence }) => (
            <UserAvatar
              borderColor={connectionIdToColor(connectionId)}
              key={connectionId}
              src={presence?.profile?.picture ?? info?.picture}
              name={presence?.profile?.name ?? info?.name}
              fallback={(presence?.profile?.name ?? info?.name)?.[0] || "T"}
              size="sm"
              className="ring-2 ring-white"
            />
          ))}

          {currentUser && (
            <UserAvatar
              borderColor={connectionIdToColor(currentUser.connectionId)}
              src={currentUser.presence?.profile?.picture ?? currentUser.info?.picture}
              name={`${currentUser.presence?.profile?.name ?? currentUser.info?.name} (You)`}
              fallback={(currentUser.presence?.profile?.name ?? currentUser.info?.name)?.[0]}
              size="sm"
              className="ring-2 ring-white"
            />
          )}

          {hasMoreUsers && (
            <UserAvatar
              name={`${users.length - MAX_SHOWN_OTHER_USERS} more`}
              fallback={`+${users.length - MAX_SHOWN_OTHER_USERS}`}
              size="sm"
              className="ring-2 ring-white"
            />
          )}
        </div>
        <span className="text-xs font-semibold text-slate-600">
          {totalOnline} online
        </span>
      </div>

      <div className="h-6 w-px bg-slate-200/80" />

      <Popover>
        <PopoverTrigger asChild>
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200/70 bg-slate-50/80 px-3 py-2 text-xs font-semibold text-slate-600 transition-all duration-200 hover:bg-white hover:text-slate-900 hover:shadow-sm"
            aria-label="Access settings"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Access</span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xl shadow-slate-200/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Access & roles</p>
                <p className="text-xs text-slate-500">Who can view or edit</p>
              </div>
            </div>
            {sharingInfo?.isOwner ? (
              <Badge variant="secondary" className="bg-blue-600/10 text-blue-700">
                Owner
              </Badge>
            ) : null}
          </div>

          <div className="mt-4 space-y-3">
            {sharingState === "loading" && (
              <div className="space-y-2">
                <div className="h-16 rounded-xl bg-slate-100/80 animate-pulse" />
                <div className="h-24 rounded-xl bg-slate-100/80 animate-pulse" />
              </div>
            )}

            {sharingState === "error" && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
                Access information is unavailable right now.
              </div>
            )}

            {sharingState === "ready" && (
              <>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Owner</p>
                  <div className="mt-2 flex items-center justify-between rounded-xl border border-slate-200/70 bg-slate-50/80 px-3 py-2">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={sharingInfo?.owner?.imageUrl ?? undefined} />
                        <AvatarFallback className="text-xs font-semibold">
                          {getInitials(sharingInfo?.owner?.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {sharingInfo?.owner?.name ?? "Owner"}
                        </p>
                        <p className="text-xs text-slate-500">{sharingInfo?.owner?.email ?? ""}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={roleBadgeClasses("owner")}>
                      Owner
                    </Badge>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                      Members
                    </p>
                    <span className="text-xs text-slate-500">
                      {(sharingInfo?.members ?? []).length}
                    </span>
                  </div>
                  <div className="mt-2 space-y-2">
                    {(sharingInfo?.members ?? []).length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
                        No members yet.
                      </div>
                    ) : (
                      (sharingInfo?.members ?? []).slice(0, 4).map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center justify-between rounded-xl border border-slate-200/70 bg-white px-3 py-2"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="h-7 w-7">
                              <AvatarImage src={member.imageUrl ?? undefined} />
                              <AvatarFallback className="text-[10px] font-semibold">
                                {getInitials(member.name || member.email)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-xs font-semibold text-slate-800">
                                {member.name || member.email}
                              </p>
                              <p className="text-[11px] text-slate-500">{member.email}</p>
                            </div>
                          </div>
                          <Badge variant="outline" className={roleBadgeClasses(member.role)}>
                            {member.role === "editor" ? "Edit" : "View"}
                          </Badge>
                        </div>
                      ))
                    )}
                  </div>
                  {(sharingInfo?.members ?? []).length > 4 && (
                    <p className="mt-2 text-[11px] text-slate-500">
                      +{(sharingInfo?.members ?? []).length - 4} more in access manager
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => onOpenShare?.()}
            className="mt-4 w-full rounded-xl border border-slate-200/80 bg-white px-4 py-2 text-xs font-semibold text-slate-900 transition-all duration-200 hover:bg-slate-50"
          >
            Manage access
          </button>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export const ParticipantsSkeleton = () => {
  return (
    <div
      className="absolute top-4 right-4 z-40 w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200/70 bg-white/90 px-3 py-2 shadow-lg shadow-slate-200/40 backdrop-blur-md overflow-hidden"
      aria-hidden
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-7 w-7 rounded-full bg-slate-200/80 animate-pulse ring-2 ring-white"
              />
            ))}
          </div>
          <div className="h-4 w-16 rounded-md bg-slate-200/70 animate-pulse" />
        </div>
        <div className="h-8 w-24 rounded-xl bg-slate-200/80 animate-pulse" />
      </div>
    </div>
  );
};
