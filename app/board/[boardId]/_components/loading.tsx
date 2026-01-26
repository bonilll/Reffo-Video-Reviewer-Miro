import { Loader } from "@/components/ui/loader";

import { InfoSkeleton } from "./info";
import { ParticipantsSkeleton } from "./participants";
import { ToolbarSkeleton } from "./toolbar";

export const Loading = () => {
  return (
    <main className="h-screen w-screen relative overflow-hidden bg-neutral-100 touch-none">
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
        <Loader size="lg" />
        <p className="text-muted-foreground text-sm mt-4 text-center">Loading your board...</p>
      </div>
      <InfoSkeleton />
      <ParticipantsSkeleton />
      <ToolbarSkeleton />
    </main>
  );
};
