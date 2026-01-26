import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { extractUserName, extractFirstName, extractLastName, getUserInitials } from "@/lib/user-utils";

/**
 * Custom hook to get consistent user display information
 * Combines Clerk user data with Convex profile data for complete user info
 */
export function useUserDisplay() {
  const { user, isLoaded } = useUser();
  
  // Get user profile from Convex if user is loaded
  const profile = useQuery(
    api.users.getProfileByUserId, 
    user ? { userId: user.id } : "skip"
  );
  
  // Create a combined user object that prioritizes Convex data when available
  const combinedUserData = user ? {
    ...user,
    // Override with Convex profile data if available
    firstName: profile?.firstName || user.firstName,
    lastName: profile?.lastName || user.lastName,
    fullName: profile?.fullName || user.fullName,
  } : null;
  
  const displayName = extractUserName(combinedUserData);
  const firstName = extractFirstName(combinedUserData);
  const lastName = extractLastName(combinedUserData);
  const initials = getUserInitials(combinedUserData);
  const email = profile?.email || user?.primaryEmailAddress?.emailAddress || "";
  // Prioritize custom profile image, then profile imageUrl, then Clerk imageUrl
  const imageUrl = profile?.profileImageUrl || profile?.imageUrl || user?.imageUrl || "";
  
  return {
    user,
    profile,
    isLoaded: isLoaded && (profile !== undefined || !user),
    displayName,
    firstName,
    lastName,
    initials,
    email,
    imageUrl,
    // Convenience getter for combined first + last name for forms
    fullNameForForm: firstName || lastName ? `${firstName} ${lastName}`.trim() : "",
  };
} 