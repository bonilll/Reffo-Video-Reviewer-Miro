import { useEffect, useMemo, useState } from "react";

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", notify);
}

export function usePathname() {
  const [pathname, setPathname] = useState(
    typeof window === "undefined" ? "" : window.location.pathname
  );

  useEffect(() => {
    const listener = () => setPathname(window.location.pathname);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);

  return pathname;
}

export function useSearchParams() {
  const [search, setSearch] = useState(
    typeof window === "undefined" ? "" : window.location.search
  );

  useEffect(() => {
    const listener = () => setSearch(window.location.search);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);

  return useMemo(() => new URLSearchParams(search), [search]);
}

export function useRouter() {
  return {
    push: (url: string) => {
      window.history.pushState({}, "", url);
      notify();
    },
    replace: (url: string) => {
      window.history.replaceState({}, "", url);
      notify();
    },
  };
}

export function useParams() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "board" && segments[1]) {
    return { boardId: segments[1] };
  }
  if (segments[0] === "project" && segments[1]) {
    return { projectId: segments[1] };
  }
  if (segments[0] === "review" && segments[1]) {
    return { reviewId: segments[1] };
  }
  return {};
}
