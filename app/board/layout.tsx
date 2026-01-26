"use client";

import { Suspense } from "react";
import { Loading } from "@/components/auth/loading";

export default function BoardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={
      <div className="h-screen w-full flex items-center justify-center bg-white">
        <Loading />
      </div>
    }>
      {children}
    </Suspense>
  );
} 