"use client";

import { useState } from "react";

type ShareableItem = {
  id: string;
  type: "board" | "collection" | "tasklist" | "calendar";
  name: string;
  description?: string;
};

export const useUniversalShare = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState<ShareableItem | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  const openShareDialog = (item: ShareableItem, userIsOwner: boolean = false) => {
    setCurrentItem(item);
    setIsOwner(userIsOwner);
    setIsOpen(true);
  };

  const closeShareDialog = () => {
    setIsOpen(false);
    setCurrentItem(null);
    setIsOwner(false);
  };

  return {
    isOpen,
    currentItem,
    isOwner,
    openShareDialog,
    closeShareDialog,
  };
}; 