"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";
import { resolvePostLoginRoute, useAuthStore } from "@/lib/stores/auth-store";

function AuthResolveInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();
  const profiles = useAuthStore((state) => state.profiles);
  const activeOrganizationId = useAuthStore((state) => state.activeOrganizationId);
  const profileFetchFailed = useAuthStore((state) => state.profileFetchFailed);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/auth/login");
      return;
    }

    const next = searchParams.get("next") ?? undefined;
    const destination = resolvePostLoginRoute(profiles, activeOrganizationId, next, profileFetchFailed);
    router.replace(destination);
  }, [loading, user, profiles, activeOrganizationId, profileFetchFailed, router, searchParams]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

export default function AuthResolvePage() {
  return (
    <Suspense>
      <AuthResolveInner />
    </Suspense>
  );
}
