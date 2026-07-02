"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  User,
  Shield,
  Palette,
  Save,
  CheckCircle2,
  Eye,
  EyeOff,
  Key,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useAuth } from "@/lib/auth/useAuth";
import { useAuthStore } from "@/lib/stores/auth-store";
import { createClient } from "@/lib/config/client";
import { validateFile } from "@/lib/utils/file-validation";
import { toast } from "sonner";

type Tab = "profile" | "security" | "appearance";

const tabs: { id: Tab; label: string; icon: typeof User }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "security", label: "Security", icon: Shield },
  { id: "appearance", label: "Appearance", icon: Palette },
];

export default function AdminSettingsPage() {
  const { user: authUser, role, mfaEnrolled } = useAuth();
  const authStoreUser = useAuthStore((s) => s.user);
  const { setTheme, theme } = useTheme();

  useEffect(() => {
    document.title = "Settings - EdgePulse Admin";
  }, []);

  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [fullName, setFullName] = useState(
    authStoreUser?.user_metadata?.full_name as string ?? "",
  );
  const [jobTitle, setJobTitle] = useState(
    authStoreUser?.user_metadata?.job_title as string ?? "",
  );
  const [email, setEmail] = useState(authStoreUser?.email ?? "");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

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
      if (activeTab === "profile") {
        const { error } = await createClient().auth.updateUser({
          email: email !== "" ? email : undefined,
          data: { full_name: fullName, job_title: jobTitle },
        });
        if (error) throw new Error(error.message ?? "Failed to update profile");

        await useAuthStore.getState().updateProfile(authStoreUser!.id, {
          full_name: fullName,
        });
        toast.success("Profile updated successfully");
      } else if (activeTab === "security") {
        if (!newPassword) {
          toast.error("Enter a new password");
          setSaving(false);
          return;
        }
        const result = await useAuthStore.getState().updatePassword(newPassword);
        if (!result.success) {
          throw new Error(result.error ?? "Failed to update password");
        }
        setCurrentPassword("");
        setNewPassword("");
        toast.success("Password updated successfully");
      } else if (activeTab === "appearance") {
        toast.success("Appearance settings saved");
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-250 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-display font-bold text-foreground">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your admin account preferences
        </p>
      </motion.div>

      <div className="flex gap-6">
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="w-48 shrink-0"
        >
          <nav className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-current={activeTab === tab.id ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm font-medium transition-all",
                  activeTab === tab.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                )}
              >
                <tab.icon className="h-4 w-4 shrink-0" />
                {tab.label}
              </button>
            ))}
          </nav>
        </motion.div>

        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex-1 bg-card border border-border rounded-2xl p-6"
        >
          {activeTab === "profile" && (
            <div className="space-y-6">
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

              <div className="pt-6 border-t border-border">
                <h2 className="text-base font-semibold text-foreground mb-1">
                  Profile Information
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Update your account details
                </p>
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
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold text-foreground mb-1">
                  Security Settings
                </h2>
                <p className="text-sm text-muted-foreground">
                  Manage your account security preferences
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="currentPassword"
                      type={showCurrentPassword ? "text" : "password"}
                      className="pl-10 pr-10 h-9"
                      placeholder="Enter current password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowCurrentPassword((p) => !p)}
                      aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="newPassword">New Password</Label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="newPassword"
                      type={showNewPassword ? "text" : "password"}
                      className="pl-10 pr-10 h-9"
                      placeholder="Enter new password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowNewPassword((p) => !p)}
                      aria-label={showNewPassword ? "Hide password" : "Show password"}
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Must be at least 8 characters with uppercase, number and special character.
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-border space-y-3">
                <p className="text-sm font-medium text-foreground">
                  Session Settings
                </p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-foreground">Auto-logout after inactivity</p>
                    <p className="text-xs text-muted-foreground">
                      Automatically sign out after 30 minutes
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>

              <div className="pt-4 border-t border-border space-y-3">
                <p className="text-sm font-medium text-foreground">
                  Two-Factor Authentication (MFA)
                </p>
                {mfaEnrolled ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-foreground">Authenticator app</p>
                      <p className="text-xs text-muted-foreground">
                        Enabled &mdash; you&apos;ll be prompted for a code on sign in
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const result = await useAuthStore.getState().unenrollMFA();
                        if (result.success) {
                          await useAuthStore.getState().syncMFAStatusToProfile(false);
                          toast.success("MFA disabled");
                        } else {
                          toast.error(result.error ?? "Failed to disable MFA");
                        }
                      }}
                      className="text-red-500 border-red-500/30 hover:bg-red-500/10"
                    >
                      Disable
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-foreground">Not enabled</p>
                      <p className="text-xs text-muted-foreground">
                        Add an extra layer of security to your account
                      </p>
                    </div>
                    <Link href="/auth/mfa/enroll">
                      <Button variant="outline" size="sm">
                        Enable
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "appearance" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold text-foreground mb-1">
                  Appearance
                </h2>
                <p className="text-sm text-muted-foreground">
                  Customize your admin experience
                </p>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-foreground mb-3">Theme</p>
                  <div className="grid grid-cols-3 gap-3">
                    {(["light", "dark", "system"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTheme(t)}
                        className={cn(
                          "p-4 rounded-xl border transition-colors text-sm font-medium text-center capitalize",
                          theme === t
                            ? "border-primary/50 bg-primary/5 text-primary"
                            : "border-border hover:border-primary/30",
                        )}
                      >
                        {t === "system" ? "System" : t.charAt(0).toUpperCase() + t.slice(1)}
                        {theme === t && (
                          <CheckCircle2 className="h-3 w-3 inline-block ml-1.5 text-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="pt-4 border-t border-border space-y-3">
                  <p className="text-sm font-medium text-foreground">
                    Dashboard Preferences
                  </p>
                  {[
                    { label: "Compact mode", desc: "Reduce spacing for more content" },
                    { label: "Show animations", desc: "Enable motion effects throughout the UI" },
                    { label: "Show confidence scores", desc: "Display ML confidence scores on alerts" },
                  ].map((pref) => (
                    <div
                      key={pref.label}
                      className="flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm text-foreground">{pref.label}</p>
                        <p className="text-xs text-muted-foreground">{pref.desc}</p>
                      </div>
                      <Switch defaultChecked={pref.label !== "Compact mode"} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-border flex items-center justify-between">
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
    </div>
  );
}
