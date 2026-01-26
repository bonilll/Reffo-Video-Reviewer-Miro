"use client";

import { ReviewSession, ReviewPresence } from "@/types/canvas";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, Circle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { enUS } from "date-fns/locale";

interface ReviewCollaborationProps {
  session: ReviewSession;
  presence: any[];
  theme?: 'dark' | 'light';
}

export function ReviewCollaboration({ session, presence, theme = 'light' }: ReviewCollaborationProps) {
  // Dynamic theme classes
  const themeClasses = {
    text: {
      primary: theme === 'dark' ? 'text-white' : 'text-gray-900',
      secondary: theme === 'dark' ? 'text-gray-300' : 'text-gray-600',
      muted: theme === 'dark' ? 'text-gray-400' : 'text-gray-500',
    },
    border: theme === 'dark' ? 'border-gray-700' : 'border-gray-200',
  };

  const activeUsers = presence?.filter(user => user.isActive) || [];
  const inactiveUsers = presence?.filter(user => !user.isActive) || [];

  return (
    <div className="p-4 space-y-4">
      {/* Active Users */}
      <div>
        <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-2 flex items-center gap-2`}>
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          Online ({activeUsers.length})
        </h4>
        
        <div className="space-y-2">
          {activeUsers.map((user) => (
            <div key={user.userId} className="flex items-center gap-2">
              <Avatar className="h-6 w-6 bg-green-600 text-white text-xs">
                {user.userName.charAt(0).toUpperCase()}
              </Avatar>
              <p className={`text-sm ${themeClasses.text.primary} truncate`}>{user.userName}</p>
              <div className="flex-1" />
              <div className="w-2 h-2 bg-green-500 rounded-full" />
            </div>
          ))}
          
          {activeUsers.length === 0 && (
            <p className={`text-xs ${themeClasses.text.muted}`}>No users online</p>
          )}
        </div>
      </div>

      {/* Inactive Users */}
      {inactiveUsers.length > 0 && (
        <div>
          <h4 className={`text-sm font-semibold ${themeClasses.text.primary} mb-2 flex items-center gap-2`}>
            <div className="w-2 h-2 bg-gray-400 rounded-full" />
            Offline ({inactiveUsers.length})
          </h4>
          
          <div className="space-y-2">
            {inactiveUsers.slice(0, 5).map((collaborator) => (
              <div key={collaborator.userId} className="flex items-center gap-2">
                <Avatar
                  className={`h-6 w-6 text-white text-xs ${
                    collaborator.isOwner 
                      ? 'bg-purple-600' 
                      : collaborator.isAdmin 
                        ? 'bg-orange-600' 
                        : 'bg-gray-600'
                  }`}
                >
                  {collaborator.userName.charAt(0).toUpperCase()}
                </Avatar>
                <p className={`text-sm ${themeClasses.text.primary} truncate`}>{collaborator.userName}</p>
                <div className="flex-1" />
                {collaborator.isOwner && (
                  <Badge variant="outline" className="text-xs">Owner</Badge>
                )}
                {collaborator.isAdmin && !collaborator.isOwner && (
                  <Badge variant="outline" className="text-xs">Admin</Badge>
                )}
              </div>
            ))}
            
            {inactiveUsers.length > 5 && (
              <p className={`text-xs ${themeClasses.text.muted}`}>
                +{inactiveUsers.length - 5} other collaborators
              </p>
            )}
          </div>
        </div>
      )}

      {/* Session Info */}
      <div className={`pt-2 border-t ${themeClasses.border}`}>
        <p className={`text-xs ${themeClasses.text.muted}`}>
          Created by: <span className={themeClasses.text.primary}>{session.createdByName}</span>
        </p>
        <p className={`text-xs ${themeClasses.text.muted} mt-1`}>
          {new Date(session.createdAt).toLocaleDateString('en-US')}
        </p>
      </div>
    </div>
  );
}
