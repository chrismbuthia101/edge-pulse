import { createClient } from "@/lib/config/client";

const STORAGE_KEY = "edgepulse_invite_tokens";

interface RedeemResult {
  redeemed: boolean;
  error: string | null;
}

export async function redeemInviteHash(): Promise<RedeemResult> {
  if (typeof window === "undefined") {
    return { redeemed: false, error: null };
  }

  let rawHash: string | null = null;

  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored) {
    sessionStorage.removeItem(STORAGE_KEY);
    rawHash = stored;
  } else {
    const liveHash = window.location.hash;
    if (liveHash && liveHash.includes("access_token")) {
      rawHash = liveHash.substring(1);
    }
  }

  if (!rawHash) {
    return { redeemed: false, error: null };
  }

  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  try {
    const params = new URLSearchParams(rawHash);
    accessToken = params.get("access_token");
    refreshToken = params.get("refresh_token");
  } catch {
    return { redeemed: false, error: "Failed to parse invite hash" };
  }

  if (!accessToken) {
    return { redeemed: false, error: "Invite hash missing access_token" };
  }

  try {
    const supabase = createClient();
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken || "",
    });
    if (error) {
      return { redeemed: false, error: error.message };
    }
  } catch (err) {
    return {
      redeemed: false,
      error: err instanceof Error ? err.message : "Failed to set session",
    };
  }

  if (window.location.hash) {
    history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }

  return { redeemed: true, error: null };
}

export function stashInviteHash(): boolean {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash;
  if (!hash || !hash.includes("access_token")) return false;
  sessionStorage.setItem(STORAGE_KEY, hash.substring(1));
  history.replaceState(null, "", window.location.pathname + window.location.search);
  return true;
}
