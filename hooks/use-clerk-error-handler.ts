import { useCallback } from 'react';

export interface ClerkError {
  code: string;
  message: string;
  longMessage?: string;
}

export interface ClerkErrorResponse {
  errors?: ClerkError[];
}

export function useClerkErrorHandler() {
  const handleClerkError = useCallback((err: any): string => {
    console.error("Clerk error:", err);
    
    // Handle Clerk-specific errors
    if (err.errors && err.errors.length > 0) {
      const error = err.errors[0];
      
      switch (error.code) {
        // Authentication errors
        case "form_identifier_not_found":
          return "No account found with this email address. Please sign up first or check your email.";
          
        case "form_password_incorrect":
          return "Incorrect password. Please try again or reset your password.";
          
        case "form_identifier_exists":
          return "An account with this email already exists. If you signed up with Google or GitHub, please use the social login buttons above instead.";
          
        case "verification_strategy_not_supported":
          return "The verification strategy is not valid for this account. This account was created with a social provider (Google/GitHub). Please use the \"Continue with Google\" or \"Continue with GitHub\" button above to sign in.";
          
        // Rate limiting
        case "too_many_requests":
          return "Too many failed attempts. Please wait a few minutes before trying again.";
          
        // Session errors
        case "session_exists":
          return "You are already signed in. Redirecting...";
          
        case "identifier_already_signed_in":
          return "This account is already signed in from another device. Please sign out there first or use a different account.";
          
        // Password validation
        case "form_password_pwned":
          return "This password has been found in a data breach. Please choose a different password.";
          
        case "form_password_validation_failed":
          return "Password doesn't meet security requirements. Please check the requirements below.";
          
        case "form_password_too_common":
          return "This password is too common. Please choose a more unique password.";
          
        // Email validation
        case "form_identifier_invalid":
          return "Please enter a valid email address.";
          
        // Verification errors
        case "form_code_incorrect":
          return "The verification code is incorrect. Please check your email and try again.";
          
        case "form_code_expired":
          return "The verification code has expired. Please request a new one.";
          
        // CAPTCHA errors
        case "captcha_invalid":
          return "Please complete the security verification and try again.";
          
        case "captcha_failed":
          return "Security verification failed. Please refresh the page and try again.";
          
        // OAuth errors
        case "oauth_access_denied":
          return "Access was denied by the social provider. Please try again.";
          
        case "oauth_email_domain_reserved_by_saml":
          return "This email domain is managed by your organization. Please contact your administrator.";
          
        // Organization errors
        case "organization_domain_blocked":
          return "This email domain is not allowed. Please use a different email address.";
          
        // Generic fallbacks
        default:
          // Return the long message if available, otherwise the regular message
          return error.longMessage || error.message || "An error occurred during authentication.";
      }
    }
    
    // Handle non-Clerk errors
    if (err.message) {
      return err.message;
    }
    
    return "An unexpected error occurred. Please try again.";
  }, []);

  const isAuthenticationConflict = useCallback((errorMessage: string): boolean => {
    const conflictKeywords = [
      "social provider",
      "Google",
      "GitHub", 
      "Continue with",
      "verification strategy is not valid",
      "verification_strategy_not_supported",
      "different sign-in method",
      "form_identifier_exists"
    ];
    
    return conflictKeywords.some(keyword => 
      errorMessage.toLowerCase().includes(keyword.toLowerCase())
    );
  }, []);

  const getErrorType = useCallback((errorMessage: string) => {
    if (isAuthenticationConflict(errorMessage)) {
      return 'social_conflict';
    }
    
    if (errorMessage.includes('password')) {
      return 'password';
    }
    
    if (errorMessage.includes('No account found') || errorMessage.includes('identifier_not_found')) {
      return 'not_found';
    }
    
    if (errorMessage.includes('already exists')) {
      return 'exists';
    }
    
    if (errorMessage.includes('Too many') || errorMessage.includes('rate limit')) {
      return 'rate_limit';
    }
    
    if (errorMessage.includes('captcha') || errorMessage.includes('security verification')) {
      return 'captcha';
    }
    
    return 'generic';
  }, [isAuthenticationConflict]);

  return {
    handleClerkError,
    isAuthenticationConflict,
    getErrorType,
  };
} 