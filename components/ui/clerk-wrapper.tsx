"use client";

import { UserProfile } from "@clerk/nextjs";
import { cn } from "@/lib/utils";

type SocialButtonsPlacement = "bottom" | "top";
type SocialButtonsVariant = "iconButton" | "blockButton" | "auto";

interface ClerkProfileWrapperProps {
  appearance?: {
    elements?: {
      rootBox?: string;
      card?: string;
      navbar?: string;
      navbarMobileMenuButton?: string;
      headerTitle?: string;
      headerSubtitle?: string;
      formButtonPrimary?: string;
      formFieldLabel?: string;
      navbarButton?: string;
    };
    layout?: {
      shimmer?: boolean;
      socialButtonsPlacement?: SocialButtonsPlacement;
      socialButtonsVariant?: SocialButtonsVariant;
    };
  };
  className?: string;
}

export function ClerkProfileWrapper({ 
  appearance = {}, 
  className 
}: ClerkProfileWrapperProps) {
  // Combina le impostazioni di appearance predefinite con quelle personalizzate
  const customAppearance = {
    elements: {
      rootBox: cn(
        "w-full mx-auto px-0",
        appearance?.elements?.rootBox
      ),
      card: cn(
        "bg-transparent shadow-none border-0 w-full px-0 overflow-visible",
        appearance?.elements?.card
      ),
      navbar: cn(
        "mb-6 flex justify-center w-full",
        appearance?.elements?.navbar
      ),
      navbarMobileMenuButton: cn(
        "text-black dark:text-white",
        appearance?.elements?.navbarMobileMenuButton
      ),
      navbarButton: cn(
        "text-primary hover:text-primary/90 font-medium",
        appearance?.elements?.navbarButton
      ),
      headerTitle: cn(
        "text-xl text-gray-900 dark:text-white",
        appearance?.elements?.headerTitle
      ),
      headerSubtitle: cn(
        "text-sm text-gray-500 dark:text-gray-400",
        appearance?.elements?.headerSubtitle
      ),
      formButtonPrimary: cn(
        "bg-primary hover:bg-primary/90 text-primary-foreground",
        appearance?.elements?.formButtonPrimary
      ),
      formFieldLabel: cn(
        "text-foreground font-medium",
        appearance?.elements?.formFieldLabel
      ),
      ...appearance?.elements,
    },
    layout: {
      shimmer: true,
      socialButtonsPlacement: 'bottom' as SocialButtonsPlacement,
      socialButtonsVariant: 'iconButton' as SocialButtonsVariant,
      ...appearance?.layout,
    },
  };

  return (
    <div className={cn("w-full flex justify-center px-0", className)}>
      <UserProfile appearance={customAppearance} />
    </div>
  );
} 