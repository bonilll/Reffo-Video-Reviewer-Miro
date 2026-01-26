// Simplified version of toast hook
import { toast } from "sonner";

interface ToastProps {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
  duration?: number;
}

export const useToast = () => {
  const showToast = ({ title, description, variant, duration = 3000 }: ToastProps) => {
    if (variant === "destructive") {
      toast.error(title, {
        description,
        duration
      });
    } else {
      toast.success(title, {
        description,
        duration
      });
    }
  };

  return {
    toast: showToast
  };
}; 