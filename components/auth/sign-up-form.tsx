"use client";

import { useState } from "react";
import { useSignUp, useAuth } from "@clerk/nextjs";
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
  firstName: z.string().min(2, "Il nome deve contenere almeno 2 caratteri"),
  lastName: z.string().min(2, "Il cognome deve contenere almeno 2 caratteri"), 
  email: z.string().email("Email non valida"),
  password: z.string().min(8, "La password deve contenere almeno 8 caratteri"),
});

export function SignUpForm() {
  const { isLoaded, signUp, setActive } = useSignUp();
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
      firstName: "",
      lastName: "",
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
      
      // Inizia il processo di registrazione
      await signUp.create({
        firstName: values.firstName,
        lastName: values.lastName,
        emailAddress: values.email,
        password: values.password,
      });
      
      // Store the redirect URL in session storage for after verification
      if (redirectUrl && redirectUrl !== "/dashboard") {
        sessionStorage.setItem('redirectAfterSignUp', redirectUrl);
      }
      
      // Esegui la verifica dell'email
      await signUp.prepareEmailAddressVerification({
        strategy: "email_code",
      });
      
      // Reindirizza alla pagina di verifica
      router.push("/sign-up/verify-email");
      
    } catch (error) {
      console.error("Errore durante la registrazione:", error);
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante la registrazione. Riprova.",
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
          <h1 className="text-3xl font-bold">Crea il tuo account</h1>
          <p className="text-muted-foreground">
            Inserisci i tuoi dati per registrarti
          </p>
        </div>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Mario"
                        autoComplete="given-name"
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cognome</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Rossi"
                        autoComplete="family-name"
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
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
                      autoComplete="new-password"
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
                  <span>Registrazione in corso...</span>
                </div>
              ) : "Registrati"}
            </Button>
          </form>
        </Form>
        
        <div className="text-center text-sm text-muted-foreground">
          <p>
            Hai già un account?{" "}
            <a 
              href="/sign-in" 
              className="text-primary hover:underline"
            >
              Accedi
            </a>
          </p>
        </div>
      </div>
    </div>
  );
} 