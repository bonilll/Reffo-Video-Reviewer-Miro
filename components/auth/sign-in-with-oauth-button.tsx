"use client";

import { useState } from "react";
import { useSignIn, useAuth } from "@clerk/nextjs";
import { OAuthStrategy } from "@clerk/types";
import { FcGoogle } from "react-icons/fc";
import { FaGithub } from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

interface SignInWithOAuthButtonProps {
  provider: OAuthStrategy;
}

export function SignInWithOAuthButton({
  provider,
}: SignInWithOAuthButtonProps) {
  const { signIn, isLoaded } = useSignIn();
  const { isSignedIn, isLoaded: isAuthLoaded } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Get the redirect URL from the query parameters
  const redirectUrl = searchParams.get("redirect_url") || "/workspaces";

  const signInWithOAuth = async () => {
    if (!isLoaded) return;
    
    // Check if user is already authenticated before proceeding
    if (isAuthLoaded && isSignedIn) {
      window.location.href = "/workspaces";
      return;
    }
    
    try {
      setIsLoading(true);
      
      // Usa la configurazione standard di Clerk senza redirect manuali
      await signIn.authenticateWithRedirect({
        strategy: provider,
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/workspaces",
      });
    } catch (error) {
      console.error("Errore nell'autenticazione OAuth:", error);
      setIsLoading(false);
    }
  };

  // Providers display data
  const providerLogo = {
    oauth_google: <FcGoogle className="h-5 w-5" />,
    oauth_github: <FaGithub className="h-5 w-5" />,
  };

  const providerName = {
    oauth_google: "Google",
    oauth_github: "GitHub",
  };

  return (
    <Button
      variant="outline"
      className="w-full flex items-center gap-2"
      onClick={signInWithOAuth}
      disabled={isLoading || !isLoaded}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        providerLogo[provider]
      )}
      <span>Continua con {providerName[provider]}</span>
    </Button>
  );
} 
