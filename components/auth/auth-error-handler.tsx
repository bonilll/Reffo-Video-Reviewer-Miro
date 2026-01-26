import { AlertCircle, ArrowRight, Mail, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface AuthErrorHandlerProps {
  error: string | null;
  email?: string;
  onSocialSignIn?: (strategy: "oauth_google" | "oauth_github") => void;
  onPasswordReset?: () => void;
  showSocialOptions?: boolean;
  showPasswordReset?: boolean;
}

export function AuthErrorHandler({
  error,
  email,
  onSocialSignIn,
  onPasswordReset,
  showSocialOptions = true,
  showPasswordReset = true,
}: AuthErrorHandlerProps) {
  if (!error) return null;

  // Enhanced error detection patterns
  const isSocialConflict = error.includes("social provider") || 
                          error.includes("Google") || 
                          error.includes("GitHub") ||
                          error.includes("Continue with") ||
                          error.includes("verification strategy is not valid") ||
                          error.includes("verification_strategy_not_supported") ||
                          error.includes("different sign-in method");

  const isPasswordIncorrect = error.includes("Incorrect password") || 
                             error.includes("password_incorrect") ||
                             error.includes("form_password_incorrect");

  const isAccountNotFound = error.includes("No account found") || 
                           error.includes("identifier_not_found") ||
                           error.includes("form_identifier_not_found");

  const isExistingAccount = error.includes("already exists") || 
                           error.includes("identifier_exists") ||
                           error.includes("form_identifier_exists");

  const isTooManyRequests = error.includes("Too many") ||
                           error.includes("too_many_requests");

  const isCaptchaRequired = error.includes("captcha") ||
                           error.includes("security verification");

  return (
    <div className="space-y-3">
      <Alert className="border-red-200 bg-red-50">
        <AlertCircle className="h-4 w-4 text-red-600" />
        <AlertDescription className="text-red-800">
          {error}
        </AlertDescription>
      </Alert>

      {/* Social Authentication Conflict */}
      {isSocialConflict && showSocialOptions && onSocialSignIn && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
          <div className="flex items-start space-x-3">
            <Users className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-blue-900 mb-1">
                Try signing in with your social account
              </h4>
              <p className="text-sm text-blue-800 mb-3">
                This account was created using a social provider. Please use one of these options:
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 justify-center border-blue-300 text-blue-700 hover:bg-blue-100"
                  onClick={() => onSocialSignIn("oauth_google")}
                >
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Continue with Google
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 justify-center border-blue-300 text-blue-700 hover:bg-blue-100"
                  onClick={() => onSocialSignIn("oauth_github")}
                >
                  <svg className="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Continue with GitHub
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Suggestion */}
      {isPasswordIncorrect && showPasswordReset && onPasswordReset && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-3">
          <div className="flex items-start space-x-3">
            <Mail className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-yellow-900 mb-1">
                Forgot your password?
              </h4>
              <p className="text-sm text-yellow-800 mb-3">
                If you can't remember your password, we can send you a reset link.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="border-yellow-300 text-yellow-700 hover:bg-yellow-100"
                onClick={onPasswordReset}
              >
                <Mail className="mr-2 h-4 w-4" />
                Send password reset email
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Account Not Found - Suggest Sign Up */}
      {isAccountNotFound && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex items-start space-x-3">
            <Users className="h-5 w-5 text-gray-600 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-gray-900 mb-1">
                New to Reffo?
              </h4>
              <p className="text-sm text-gray-700 mb-3">
                It looks like you don't have an account yet. Would you like to create one?
              </p>
              <Button
                variant="outline"
                size="sm"
                className="border-gray-300 text-gray-700 hover:bg-gray-100"
                onClick={() => window.location.href = `/sign-up${email ? `?email=${encodeURIComponent(email)}` : ''}`}
              >
                <Users className="mr-2 h-4 w-4" />
                Create account
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Existing Account - Suggest Sign In */}
      {isExistingAccount && !isSocialConflict && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
          <div className="flex items-start space-x-3">
            <Users className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-blue-900 mb-1">
                Account already exists
              </h4>
              <p className="text-sm text-blue-800 mb-3">
                An account with this email already exists. Try signing in instead.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="border-blue-300 text-blue-700 hover:bg-blue-100"
                onClick={() => window.location.href = `/sign-in${email ? `?email=${encodeURIComponent(email)}` : ''}`}
              >
                <ArrowRight className="mr-2 h-4 w-4" />
                Go to sign in
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Too Many Requests */}
      {isTooManyRequests && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-3">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-orange-900 mb-1">
                Rate limit exceeded
              </h4>
              <p className="text-sm text-orange-800">
                Please wait a few minutes before trying again. This helps protect our system from abuse.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* CAPTCHA Required */}
      {isCaptchaRequired && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-purple-600 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-purple-900 mb-1">
                Security verification required
              </h4>
              <p className="text-sm text-purple-800">
                Please refresh the page and complete the security verification when prompted.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 