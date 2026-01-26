"use client";

import React, { useEffect, useState, Fragment, useMemo, useCallback } from "react";
import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { Loader2, PlusCircle, ArchiveIcon, Search, ArrowLeft, AlertTriangle, CheckCircle, Circle, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreateListModal } from "@/app/dashboard-app/todo-lists/_components/create-list-modal";
import { ArchivedListsModal } from "@/app/dashboard-app/todo-lists/_components/archived-lists-modal";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import { useCreateModal } from "@/hooks/use-create-list-modal";
import { TodoListsContent } from "@/app/dashboard-app/todo-lists/_components/todo-lists-content";
import { Loader } from "@/components/ui/loader";

// Import the touch scroll CSS for mobile optimizations
import "@/app/dashboard-app/todo-lists/touch-scroll.css";

interface TodoListsFullscreenDialogProps {
  onClose: () => void;
  boardId?: string;
}

export const TodoListsFullscreenDialog = ({ 
  onClose,
  boardId 
}: TodoListsFullscreenDialogProps) => {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [isMounted, setIsMounted] = useState(false);
  const createModal = useCreateModal();
  const router = useRouter();
  const [showArchivedModal, setShowArchivedModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Get the user's own lists
  const ownedLists = useQuery(
    api.todoLists.getLists, 
    isAuthenticated ? { archived: false } : "skip"
  );
  
  // Get lists shared with the user
  const sharedLists = useQuery(
    api.todoLists.getSharedLists,
    isAuthenticated ? {} : "skip"
  );
  
  const removeList = useMutation(api.todoLists.remove);
  const archiveList = useMutation(api.todoLists.archive);
  
  // Combine and sort both owned and shared lists
  const allLists = useMemo(() => {
    const owned = ownedLists || [];
    const shared = (sharedLists || []).filter(list => list !== null);
    
    const combinedMap = new Map();
    owned.forEach(list => combinedMap.set(list._id, { ...list, isOwned: true }));
    shared.forEach(list => {
      if (!combinedMap.has(list._id)) {
        combinedMap.set(list._id, { ...list, isShared: true });
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
  }, [ownedLists, sharedLists]);
  
  // Filter lists based on search query
  const filteredLists = useMemo(() => {
    if (!searchQuery.trim()) return allLists;
    
    const query = searchQuery.toLowerCase().trim();
    return allLists.filter(list => 
      list.name.toLowerCase().includes(query)
    );
  }, [allLists, searchQuery]);
  
  // Get the total number of lists created by the user
  const totalLists = ownedLists?.length || 0;
  const MAX_LISTS = 15;
  const canCreateMoreLists = totalLists < MAX_LISTS;
  
  // Make sure we're on the client
  useEffect(() => {
    setIsMounted(true);
  }, []);
  
  // Function to open the list creation modal with limit check
  const handleCreate = useCallback(() => {
    if (!canCreateMoreLists) {
      return toast.error(`You've reached the limit of ${MAX_LISTS} lists.`);
    }
    
    createModal.onOpen();
  }, [canCreateMoreLists, MAX_LISTS, createModal]);
  
  // Function to delete a list
  const handleDelete = useCallback(async (listId: Id<"todoLists">) => {
    try {
      await removeList({ id: listId });
      toast.success("List successfully deleted");
    } catch (error) {
      console.error(error);
      toast.error("Unable to delete list");
    }
  }, [removeList]);
  
  // Function to archive a list
  const handleArchive = useCallback(async (listId: Id<"todoLists">) => {
    try {
      await archiveList({ id: listId });
      toast.success("List successfully archived");
    } catch (error) {
      console.error(error);
      toast.error("Unable to archive list");
    }
  }, [archiveList]);

  // Custom handler for list selection - navigate to real page with fromBoard param
  const handleListSelect = useCallback((listId: Id<"todoLists">) => {
    try {
      // Navigate to the real todo list page with a parameter indicating it came from board
              router.push(`/dashboard-app/todo-lists/${listId}?fromBoard=true`);
    } catch (error) {
      console.error('Error opening list:', error);
      toast.error("Unable to open list");
    }
  }, [router]);
  
  // Loading state handling
  if (!isMounted || isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <Loader size="lg" />
      </div>
    );
  }
  
  // If the user is not authenticated, show login button
  if (!isAuthenticated) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <h2 className="text-2xl font-bold mb-4">
          Please sign in to use todo lists
        </h2>
        <Button onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }
  
  return (
    <div className="h-full w-full flex flex-col">
      {/* Header con titolo */}
      <div className="flex items-center justify-between p-4 border-b bg-white dark:bg-slate-950">
          <h1 className="text-xl font-bold">Todo Lists</h1>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 pb-safe">
          <div className="max-w-5xl mx-auto">
            <div className="flex flex-col space-y-4 mb-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h2 className="text-xl font-bold tracking-tight">
                  Your Lists
                </h2>
                <div className="flex items-center gap-x-2 w-full md:w-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex gap-x-1"
                    onClick={() => setShowArchivedModal(true)}
                  >
                    <ArchiveIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">Archived</span>
                  </Button>
                  
                  <Button
                    size="sm"
                    onClick={handleCreate}
                    disabled={!canCreateMoreLists}
                  >
                    <PlusCircle className="h-4 w-4 mr-2" />
                    <span>New List</span>
                  </Button>
                </div>
              </div>
              
              {/* Search filter */}
              <div className="relative w-full max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search lists..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-full"
                />
              </div>
              
              {/* Results count */}
              {searchQuery && (
                <div className="text-sm text-muted-foreground">
                  {filteredLists.length === 0
                    ? "No lists found"
                    : `${filteredLists.length} ${filteredLists.length === 1 ? 'list found' : 'lists found'}`}
                </div>
              )}
            </div>
            
            <TodoListsContent 
              lists={filteredLists}
              onDelete={handleDelete}
              onArchive={handleArchive}
              onListSelect={handleListSelect}
              isInPopup={true}
            />
          </div>
        </div>
      </div>
      
      <CreateListModal />
      
      <ArchivedListsModal 
        isOpen={showArchivedModal}
        onClose={() => setShowArchivedModal(false)}
      />
    </div>
  );
}; 