"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { Search, CheckSquare, Users, Clock } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TodoListSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectList: (listId: Id<"todoLists">, listName: string) => void;
  projectId?: string | null; // Optional project ID to include project todo lists
}

export const TodoListSelectorModal = ({
  isOpen,
  onClose,
  onSelectList,
  projectId
}: TodoListSelectorModalProps) => {
  const [searchQuery, setSearchQuery] = useState("");

  // Get the user's own lists (standalone, not in projects)
  const ownedLists = useQuery(api.todoLists.getLists, { archived: false });
  
  // Get lists shared with the user
  const sharedLists = useQuery(api.todoLists.getSharedLists, {});

  // Get project todo lists if projectId is provided
  const projectLists = useQuery(api.todoLists.getLists, 
    projectId ? {
      archived: false,
      projectId: projectId as Id<"projects">
    } : "skip"
  );

  // Combine and sort owned, shared, and project lists
  const allLists = useMemo(() => {
    const owned = ownedLists || [];
    const shared = (sharedLists || []).filter(list => list !== null);
    const project = projectLists || [];
    
    
    const combinedMap = new Map();
    
    // Add owned lists (standalone)
    owned.forEach(list => combinedMap.set(list._id, { ...list, isOwned: true }));
    
    // Add shared lists
    shared.forEach(list => {
      if (!combinedMap.has(list._id)) {
        combinedMap.set(list._id, { ...list, isShared: true });
      }
    });
    
    // Add project lists (mark them distinctly)
    project.forEach(list => {
      if (!combinedMap.has(list._id)) {
        combinedMap.set(list._id, { ...list, isProjectList: true });
      }
    });
    
    return Array.from(combinedMap.values()).sort((a, b) => {
      // Sort by ownership first (owned lists first)
      if (a.isOwned && !b.isOwned) return -1;
      if (!a.isOwned && b.isOwned) return 1;
      
      // Then by update date
      const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return dateB - dateA;
    });
  }, [ownedLists, sharedLists, projectLists]);

  // Filter lists based on search query
  const filteredLists = useMemo(() => {
    if (!searchQuery.trim()) return allLists;
    
    const query = searchQuery.toLowerCase().trim();
    return allLists.filter(list => 
      list.name.toLowerCase().includes(query)
    );
  }, [allLists, searchQuery]);

  const handleSelectList = (list: any) => {
    onSelectList(list._id, list.name);
    onClose();
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('it-IT', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[95vw] h-[70vh] p-0">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-xl font-semibold">
            Select Todo List for Widget
          </DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="px-6 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search todo lists..."
              className="pl-10"
            />
          </div>
        </div>

        {/* Lists */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {filteredLists.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <CheckSquare className="mx-auto h-12 w-12 mb-4 text-gray-300" />
              <div className="text-lg font-medium mb-2">No todo lists found</div>
              <div className="text-sm">
                {searchQuery ? "Try a different search term" : "Create your first todo list to get started"}
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredLists.map((list) => (
                <button
                  key={list._id}
                  onClick={() => handleSelectList(list)}
                  className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50/50 transition-all duration-200 text-left group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-gray-900 truncate text-base">
                          {list.name}
                        </h3>
                        {list.isShared && (
                          <div className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded-full flex-shrink-0">
                            <Users className="h-3 w-3 text-gray-600" />
                            <span className="text-xs text-gray-600 font-medium">Shared</span>
                          </div>
                        )}
                        {list.isProjectList && (
                          <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 rounded-full flex-shrink-0">
                            <span className="text-xs text-blue-700 font-medium">Project</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Stats */}
                      <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                        <span className="flex items-center gap-1">
                          <CheckSquare className="h-4 w-4" />
                          {list.itemCount || 0} {list.itemCount === 1 ? 'task' : 'tasks'}
                        </span>
                        {list.completedCount > 0 && (
                          <span className="text-green-600">
                            {list.completedCount} completed
                          </span>
                        )}
                      </div>

                      {/* Last updated */}
                      {list.updatedAt && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Clock className="h-3 w-3" />
                          Updated {formatDate(list.updatedAt)}
                        </div>
                      )}
                    </div>

                    {/* Progress indicator */}
                    {list.itemCount > 0 && (
                      <div className="ml-4 flex-shrink-0">
                        <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 transition-all duration-300"
                            style={{
                              width: `${Math.round((list.completedCount / list.itemCount) * 100)}%`
                            }}
                          />
                        </div>
                        <div className="text-xs text-gray-500 text-center mt-1">
                          {Math.round((list.completedCount / list.itemCount) * 100)}%
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6 pt-4">
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}; 