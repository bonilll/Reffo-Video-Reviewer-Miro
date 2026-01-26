import type { User } from "@clerk/nextjs/server";

/**
 * Extracts the full name from a Clerk user object
 * Handles both regular registration and Google/OAuth login
 */
export function extractUserName(user: User | null): string {
  if (!user) return "Unknown User";
  
  // If user has fullName from Clerk, use it
  if (user.fullName?.trim()) {
    return user.fullName.trim();
  }
  
  // If user has firstName and/or lastName, combine them
  const firstName = user.firstName?.trim() || "";
  const lastName = user.lastName?.trim() || "";
  
  if (firstName || lastName) {
    return [firstName, lastName].filter(Boolean).join(" ");
  }
  
  // Fallback to email prefix if available
  if (user.primaryEmailAddress?.emailAddress) {
    const emailPrefix = user.primaryEmailAddress.emailAddress.split("@")[0];
    return emailPrefix.replace(/[._-]/g, " ").replace(/\b\w/g, l => l.toUpperCase());
  }
  
  // Last resort fallback
  return "User";
}

/**
 * Extracts first name from a Clerk user object
 */
export function extractFirstName(user: User | null): string {
  if (!user) return "";
  
  if (user.firstName?.trim()) {
    return user.firstName.trim();
  }
  
  // If fullName exists, try to extract first name
  if (user.fullName?.trim()) {
    return user.fullName.trim().split(" ")[0] || "";
  }
  
  // Fallback to email prefix
  if (user.primaryEmailAddress?.emailAddress) {
    const emailPrefix = user.primaryEmailAddress.emailAddress.split("@")[0];
    return emailPrefix.replace(/[._-]/g, " ").replace(/\b\w/g, l => l.toUpperCase()).split(" ")[0] || "";
  }
  
  return "";
}

/**
 * Extracts last name from a Clerk user object
 */
export function extractLastName(user: User | null): string {
  if (!user) return "";
  
  if (user.lastName?.trim()) {
    return user.lastName.trim();
  }
  
  // If fullName exists, try to extract last name
  if (user.fullName?.trim()) {
    const parts = user.fullName.trim().split(" ");
    return parts.length > 1 ? parts.slice(1).join(" ") : "";
  }
  
  // For email fallback, try to get surname if available
  if (user.primaryEmailAddress?.emailAddress) {
    const emailPrefix = user.primaryEmailAddress.emailAddress.split("@")[0];
    const parts = emailPrefix.replace(/[._-]/g, " ").replace(/\b\w/g, l => l.toUpperCase()).split(" ");
    return parts.length > 1 ? parts.slice(1).join(" ") : "";
  }
  
  return "";
}

/**
 * Gets user's initials for avatar fallback
 */
export function getUserInitials(user: User | null): string {
  if (!user) return "U";
  
  const fullName = extractUserName(user);
  const parts = fullName.split(" ");
  
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  
  return fullName.substring(0, 2).toUpperCase();
}

/**
 * Capitalizes the first letter of each word in a name
 * Handles multiple words and preserves spaces
 * @param name - The name to capitalize
 * @returns The capitalized name
 */
export function capitalizeName(name: string): string {
  if (!name || typeof name !== 'string') return '';
  
  return name
    .trim()
    .split(' ')
    .map(word => {
      if (!word) return '';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Capitalizes both first name and last name
 * @param firstName - The first name to capitalize
 * @param lastName - The last name to capitalize
 * @returns Object with capitalized names
 */
export function capitalizeNames(firstName: string, lastName: string) {
  return {
    firstName: capitalizeName(firstName),
    lastName: capitalizeName(lastName)
  };
} 