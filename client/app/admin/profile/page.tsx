"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Save, CheckCircle2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth/useAuth";
import { useAuthStore } from "@/lib/stores/auth-store";
import { createClient } from "@/lib/config/client";
import { validateFile } from "@/lib/utils/file-validation";
import { toast } from "sonner";

export default function AdminProfilePage() {
  const { role } = useAuth();
  const authStoreUser = useAuthStore((s) => s.user);

  useEffect(() => {
    document.title = "Profile - EdgePulse Admin";
  }, []);

  const [fullName, setFullName] = useState(
    authStoreUser?.user_metadata?.full_name as string ?? "",
  );
  const [jobTitle, setJobTitle] = useState(
    authStoreUser?.user_metadata?.job_title as string ?? "",
  );
  const [email, setEmail] = useState(authStoreUser?.email ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(authStoreUser?.avatar_url ?? null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initials = (() => {
    const name = authStoreUser?.user_metadata?.full_name as string | undefined;
    if (name) {
      return name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
    }
    return authStoreUser?.email?.[0]?.toUpperCase() ?? "U";
  })();

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const error = await validateFile(file);
    if (error) {
      toast.error(error);
      return;
    }

    setAvatarUploading(true);
    try {
      const result = await useAuthStore.getState().uploadAvatar(authStoreUser!.id, file);
      if (!result.success) {
        throw new Error(result.error ?? "Failed to upload avatar");
      }
      setAvatarUrl(result.data);
      toast.success("Avatar updated");
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Failed to upload avatar");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleAvatarRemove = async () => {
    setAvatarUploading(true);
    try {
      const result = await useAuthStore.getState().deleteAvatar(authStoreUser!.id);
      if (!result.success) {
        throw new Error(result.error ?? "Failed to remove avatar");
      }
      setAvatarUrl(null);
      toast.success("Avatar removed");
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Failed to remove avatar");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await createClient().auth.updateUser({
        email: email !== "" ? email : undefined,
        data: { full_name: fullName, job_title: jobTitle },
      });
      if (error) throw new Error(error.message ?? "Failed to update profile");

      await useAuthStore.getState().updateProfile(authStoreUser!.id, {
        full_name: fullName,
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      toast.success("Profile updated successfully");
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-225 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-display font-bold text-foreground">
          Profile
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your account details and avatar
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="bg-card border border-border rounded-2xl p-6 space-y-6"
      >
        <div>
          <h2 className="text-base font-semibold text-foreground mb-1">
            Avatar
          </h2>
          <p className="text-sm text-muted-foreground">
            Click the avatar to upload a photo
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer group"
            >
              <Avatar size="lg" className="w-20 h-20 ring-2 ring-border ring-offset-2 ring-offset-card">
                {avatarUrl ? (
                  <AvatarImage src={avatarUrl} alt="Avatar" />
                ) : null}
                <AvatarFallback className="text-lg font-bold bg-muted">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Upload className="h-5 w-5 text-white" />
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleAvatarUpload}
              className="hidden"
              disabled={avatarUploading}
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">
              {authStoreUser?.user_metadata?.full_name as string || "User"}
            </p>
            <p className="text-xs text-muted-foreground">
              PNG or JPEG. Max 2MB.
            </p>
            {avatarUrl && (
              <button
                onClick={handleAvatarRemove}
                disabled={avatarUploading}
                className="text-xs text-destructive hover:underline"
              >
                Remove avatar
              </button>
            )}
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, delay: 0.1 }}
        className="bg-card border border-border rounded-2xl p-6 space-y-6"
      >
        <div>
          <h2 className="text-base font-semibold text-foreground mb-1">
            Profile Information
          </h2>
          <p className="text-sm text-muted-foreground">
            Update your account details
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="jobTitle">Job Title</Label>
            <Input
              id="jobTitle"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <div className="h-9 px-3 flex items-center bg-muted/50 border border-border rounded-md text-sm text-muted-foreground">
              {role
                ? role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()
                : "—"}
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-border flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Changes are saved to your account
          </p>
          <Button
            onClick={handleSave}
            disabled={saving || avatarUploading}
            className="gap-2 min-w-25"
          >
            {saved ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Saved!
              </>
            ) : saving ? (
              <>
                <Save className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
