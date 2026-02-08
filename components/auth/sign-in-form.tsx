"use client";

import { useState } from "react";
import { useSignIn, useAuth } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

const formSchema = z.object({
  email: z.string().email("Email non valida"),
  password: z.string().min(6, "La password deve contenere almeno 6 caratteri"),
});

export function SignInForm() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const { isSignedIn, isLoaded: isAuthLoaded } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  // Get the redirect URL from the query parameters
  const redirectUrl = searchParams.get("redirect_url") || "/dashboard";

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!isLoaded) return;

    // Check if user is already authenticated before proceeding
    if (isAuthLoaded && isSignedIn) {
      window.location.href = "/dashboard";
      return;
    }

    try {
      setIsLoading(true);
      
      const result = await signIn.create({
        identifier: values.email,
        password: values.password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        // Rimuovo il redirect manuale - sarà gestito da AuthStateHandler
      } else {
        console.error("Login fallito:", result);
        toast({
          title: "Errore di autenticazione",
          description: "Credenziali non valide. Riprova.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Errore durante il login:", error);
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante l'accesso. Riprova.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold">Accedi a Reffo</h1>
          <p className="text-muted-foreground">
            Inserisci le tue credenziali per accedere
          </p>
        </div>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="name@example.com"
                      type="email"
                      autoComplete="email"
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="password"
                      placeholder="••••••••"
                      autoComplete="current-password"
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <Button 
              type="submit" 
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Accesso in corso...</span>
                </div>
              ) : "Accedi"}
            </Button>
          </form>
        </Form>
        
        <div className="text-center text-sm text-muted-foreground">
          <p>
            Non hai un account?{" "}
            <a 
              href="/sign-up" 
              className="text-primary hover:underline"
            >
              Registrati
            </a>
          </p>
          <p className="mt-2">
            <a 
              href="#" 
              className="text-primary hover:underline"
              onClick={(e) => {
                e.preventDefault();
                // Add password reset functionality here
                toast({
                  title: "Password dimenticata",
                  description: "Funzionalità in arrivo. Contatta il supporto.",
                });
              }}
            >
              Password dimenticata?
            </a>
          </p>
        </div>
      </div>
    </div>
  );
} 