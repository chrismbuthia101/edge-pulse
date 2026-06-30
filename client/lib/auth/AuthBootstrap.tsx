"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { redeemInviteHash, stashInviteHash } from "@/lib/auth/redeem-invite-hash";

export default function AuthBootstrap() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await redeemInviteHash();
      if (cancelled) return;

      if (!result.redeemed) {
        stashInviteHash();
      }

      await useAuthStore.getState().initialize();
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
