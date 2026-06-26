"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { User, ArrowRight, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthBrandMark } from "@/components/auth/auth-visual-panel";
import { useAuth } from "@/lib/auth/useAuth";
import { resolvePostLoginRoute, useAuthStore } from "@/lib/stores/auth-store";
import { createClient } from "@/lib/config/client";
import { StorageRepository } from "@/lib/repositories/storage-repository";
import { validateFile } from "@/lib/utils/file-validation";
import { toast } from "sonner";

const storageRepository = new StorageRepository(createClient());

export default function SetupProfilePage() {
  const router = useRouter();
  const { user, loading, refreshSession } = useAuth();
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth/login");
    }
  }, [user, loading, router]);

  const handleFileSelect = async (file: File) => {
    setAvatarError(null);
    const error = await validateFile(file);
    if (error) {
      setAvatarError(error);
      return;
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setIsUploading(true);

    try {
      const ext = file.name.split(".").pop() || "png";
      const filePath = `avatars/${user!.id}/${crypto.randomUUID()}.${ext}`;

      const { path, error: uploadError } = await storageRepository.uploadFile(
        "avatars",
        filePath,
        file,
        { contentType: file.type, upsert: false },
      );

      if (uploadError) {
        setAvatarError(uploadError.message);
        return;
      }

      const publicUrl = storageRepository.getPublicUrl("avatars", path!);
      setAvatarUrl(publicUrl);
    } catch {
      setAvatarError("Upload failed. You can continue without an avatar.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim()) {
      toast.error("Username is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const profileResult = await useAuthStore
        .getState()
        .updateProfile(user!.id, {
          full_name: fullName.trim() || user?.full_name || undefined,
          username: username.trim(),
          avatar_url: avatarUrl,
        });

      if (!profileResult.success) {
        throw new Error(profileResult.error);
      }

      await useAuthStore.getState().activateProfile(user!.id);
      await refreshSession();
      toast.success("Profile setup complete!");
      const {
        profiles: currentProfiles,
        activeOrganizationId: currentOrgId,
        profileFetchFailed,
      } = useAuthStore.getState();
      const destination = resolvePostLoginRoute(
        currentProfiles,
        currentOrgId,
        undefined,
        profileFetchFailed,
      );
      router.push(destination);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save profile",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="text-center mb-8">
        <div className="flex justify-center mb-4">
          <AuthBrandMark light />
        </div>
        <h1 className="text-2xl font-display font-bold text-foreground dark:text-white mb-1.5">
          Set Up Your Profile
        </h1>
        <p className="text-muted-foreground dark:text-slate-400 text-sm">
          Choose a username and optional avatar to get started
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex flex-col items-center gap-2">
          <div className="relative">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-20 h-20 rounded-full bg-background dark:bg-white/3 border-2 border-dashed border-border dark:border-white/10 flex items-center justify-center cursor-pointer hover:border-cyan-400/50 transition-colors overflow-hidden"
            >
              {avatarPreview ? (
                <Image
                  src={avatarPreview}
                  alt="Avatar preview"
                  className="w-full h-full object-cover"
                  width={80}
                  height={80}
                />
              ) : (
                <User className="h-8 w-8 text-muted-foreground dark:text-slate-500" />
              )}
            </div>
            {avatarPreview && (
              <button
                type="button"
                onClick={() => {
                  setAvatarFile(null);
                  setAvatarPreview(null);
                  setAvatarUrl(null);
                  setAvatarError(null);
                }}
                className="absolute -top-1 -right-1 rounded-full bg-red-500/80 text-white p-0.5 shadow-sm hover:bg-red-500 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
              className="hidden"
            />
          </div>
          {avatarError && (
            <p className="text-sm text-red-400 text-center">{avatarError}</p>
          )}
          {avatarUrl && !avatarError && (
            <p className="text-sm text-emerald-400 flex items-center gap-1.5 justify-center">
              <CheckCircle2 className="h-3 w-3" />
              Avatar uploaded
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="username"
            className="text-sm font-medium text-foreground dark:text-slate-200"
          >
            Username
          </Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground dark:text-slate-500" />
            <Input
              id="username"
              value={username}
              onChange={(e) =>
                setUsername(e.target.value.replace(/[^a-z0-9_-]/g, ""))
              }
              className="pl-10 h-11 bg-background dark:bg-white/3 border-border dark:border-white/10 text-foreground dark:text-white placeholder:text-muted-foreground dark:placeholder:text-slate-500 focus-visible:border-cyan-400/60 focus-visible:ring-cyan-400/20"
              placeholder="johndoe"
              required
            />
          </div>
          <p className="text-xs text-muted-foreground dark:text-slate-500">
            Letters, numbers, underscores, and hyphens only
          </p>
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="fullName"
            className="text-sm font-medium text-foreground dark:text-slate-200"
          >
            Full Name
          </Label>
          <Input
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="h-11 bg-background dark:bg-white/3 border-border dark:border-white/10 text-foreground dark:text-white placeholder:text-muted-foreground dark:placeholder:text-slate-500 focus-visible:border-cyan-400/60 focus-visible:ring-cyan-400/20"
            placeholder={user?.full_name ?? "Your full name"}
          />
        </div>

        <Button
          type="submit"
          className="w-full h-11 gap-2 bg-linear-to-r from-cyan-500 to-blue-600 text-white border-0 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 hover:brightness-110 transition-all duration-200"
          disabled={isSubmitting || isUploading || !username.trim()}
        >
          {isSubmitting ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              Complete Setup
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
