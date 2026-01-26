import { useState } from "react";
import { useMutation } from "convex/react";

export const useApiMutation = <T, R>(mutationFunction: any) => {
  const [pending, setPending] = useState(false);
  const apiMutation = useMutation(mutationFunction);

  const mutate = async (payload: T): Promise<R> => {
    if (pending) {
      // Prevent multiple concurrent calls to the same mutation
      console.warn("Mutation already in progress");
      throw new Error("A mutation is already in progress");
    }
    
    setPending(true);
    
    try {
      const result = await apiMutation(payload);
      return result as R;
    } catch (error) {
      console.error("Mutation error:", error);
      throw error;
    } finally {
      setPending(false);
    }
  };

  return {
    mutate,
    pending,
  };
};
