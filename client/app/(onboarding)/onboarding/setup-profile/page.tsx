"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { User, ArrowRight, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/ui/logo";
import { useAuth } from "@/lib/auth/useAuth";
import { useAuthStore } from "@/lib/stores/auth-store";
import { createClient } from "@/lib/config/client";
import { StorageRepository } from "@/lib/repositories/storage-repository";
import { toast } from "sonner";

const ALLOWED_TYPES = ["image/png", "image/jpeg"];
const MAX_SIZE = 2 * 1024 * 1024;

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth/login");
    }
  }, [user, loading, router]);

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return "Only PNG, JPEG, and WebP images are accepted";
    }
    if (file.size > MAX_SIZE) {
      return "File must be under 2MB";
    }
    return null;
  };

  const handleFileSelect = async (file: File) => {
    const error = validateFile(file);
    if (error) {
      toast.error(error);
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
        toast.error(uploadError.message);
        return;
      }

      const publicUrl = storageRepository.getPublicUrl("avatars", path!);
      setAvatarUrl(publicUrl);
    } catch {
      toast.error("Upload failed. You can continue without an avatar.");
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
      const profileResult = await useAuthStore.getState().updateProfile(user!.id, {
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
      router.push("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="text-center mb-8">
        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
          <Logo className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-2xl font-display font-bold text-foreground mb-1.5">
          Set Up Your Profile
        </h1>
        <p className="text-muted-foreground text-sm">
          Choose a username and optional avatar to get started
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex justify-center">
          <div className="relative">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-20 h-20 rounded-full bg-muted border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors overflow-hidden"
            >
              {avatarPreview ? (
                <Image src={avatarPreview} alt="Avatar preview" className="w-full h-full object-cover" width={80} height={80} />
              ) : (
                <User className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            {avatarPreview && (
              <button
                type="button"
                onClick={() => {
                  setAvatarFile(null);
                  setAvatarPreview(null);
                  setAvatarUrl(null);
                }}
                className="absolute -top-1 -right-1 rounded-full bg-destructive text-destructive-foreground p-0.5 shadow-sm"
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
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/[^a-z0-9_-]/g, ""))}
              className="pl-10 h-10"
              placeholder="johndoe"
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Letters, numbers, underscores, and hyphens only
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fullName">Full Name</Label>
          <Input
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="h-10"
            placeholder={user?.full_name ?? "Your full name"}
          />
        </div>

        <Button
          type="submit"
          className="w-full h-10 gap-2"
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

      {avatarUrl && (
        <div className="mt-4 flex items-center gap-2 text-xs text-emerald-500 justify-center">
          <CheckCircle2 className="h-3 w-3" />
          Avatar uploaded
        </div>
      )}
    </div>
  );
}
