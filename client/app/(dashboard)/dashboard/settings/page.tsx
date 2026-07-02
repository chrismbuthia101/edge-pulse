"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import {
  User,
  Bell,
  Shield,
  Key,
  Palette,
  Monitor,
  Save,
  Eye,
  EyeOff,
  CheckCircle2,
  CheckCircle,
  Network,
  Building2,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/useAuth";
import { useAuthStore } from "@/lib/stores/auth-store";
import { createClient } from "@/lib/config/client";
import Link from "next/link";
import {
  useOrganizationStore,
  organizationService,
} from "@/lib/stores/organization-store";
import { DeviceEnrollment } from "@/components/dashboard/device-enrollment";
import { NetworkTopology } from "@/components/dashboard/network-topology";

type Tab =
  | "profile"
  | "notifications"
  | "security"
  | "appearance"
  | "agents"
  | "enrollment"
  | "topology"
  | "organization";

const tabs: { id: Tab; label: string; icon: typeof User }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: Shield },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "agents", label: "Agent Config", icon: Monitor },
  { id: "enrollment", label: "Device Enrollment", icon: Key },
  { id: "topology", label: "Network Topology", icon: Network },
  { id: "organization", label: "Organization", icon: Building2 },
];

const notificationSettings = [
  {
    id: "critical_alerts",
    label: "Critical Alerts",
    desc: "Immediate notification for critical severity events",
    defaultOn: true,
  },
  {
    id: "high_alerts",
    label: "High Severity Alerts",
    desc: "Notify on high severity detections",
    defaultOn: true,
  },
  {
    id: "medium_alerts",
    label: "Medium Severity Alerts",
    desc: "Notify on medium severity detections",
    defaultOn: false,
  },
  {
    id: "device_enrolled",
    label: "Device Enrollment",
    desc: "When a new device is enrolled",
    defaultOn: true,
  },
  {
    id: "model_updates",
    label: "Model Updates",
    desc: "When ML model is updated across fleet",
    defaultOn: true,
  },
  {
    id: "weekly_report",
    label: "Weekly Report",
    desc: "Weekly security digest email",
    defaultOn: true,
  },
  {
    id: "system_health",
    label: "System Health Alerts",
    desc: "When a service degrades or goes down",
    defaultOn: false,
  },
];

export default function SettingsPage() {
  const { hasRole, user, mfaEnrolled, role } = useAuth();
  const authUser = useAuthStore((s) => s.user);
  const profiles = useAuthStore((s) => s.profiles);

  useEffect(() => {
    document.title = "Settings - EdgePulse";
  }, []);

  const { setTheme, theme } = useTheme();

  const availableTabs = tabs.filter((tab) => {
    const adminOnlyTabs = ["agents", "enrollment", "topology", "organization"];
    return !adminOnlyTabs.includes(tab.id) || hasRole(["ORG_ADMIN"]);
  });

  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [fullName, setFullName] = useState(
    (authUser?.user_metadata?.full_name as string) ?? "",
  );
  const [jobTitle, setJobTitle] = useState(
    (authUser?.user_metadata?.job_title as string) ?? "Security Operations Lead",
  );
  const [email, setEmail] = useState(authUser?.email ?? "");
  const [org, setOrg] = useState("");

  const [notifToggles, setNotifToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(notificationSettings.map((n) => [n.id, n.defaultOn])),
  );

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [telemetryInterval, setTelemetryInterval] = useState("30");

  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [orgDomain, setOrgDomain] = useState("");
  const [orgLogoUrl, setOrgLogoUrl] = useState<string | null>(null);
  const [orgLogoUploading, setOrgLogoUploading] = useState(false);
  const [planTier, setPlanTier] = useState("");
  const [billingCycle, setBillingCycle] = useState("");
  const [billingEmail, setBillingEmail] = useState("");

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const orgId = profiles[0]?.organization_id;
    if (!orgId) {
      toast.error("Unable to determine organization");
      return;
    }

    setOrgLogoUploading(true);
    try {
      const result = await organizationService.uploadLogo(orgId, file);
      if (!result.success) {
        throw new Error(result.error ?? "Failed to upload logo");
      }
      setOrgLogoUrl(result.data);
      toast.success("Logo uploaded successfully");
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Failed to upload logo");
    } finally {
      setOrgLogoUploading(false);
    }
  };

  useEffect(() => {
    const loadOrgData = async () => {
      const orgId = profiles[0]?.organization_id;
      if (!orgId) return;

      const orgStore = useOrganizationStore.getState();
      await orgStore.fetchOrganizationById(orgId);
      const currentOrg = useOrganizationStore.getState().currentOrganization;
      if (currentOrg) {
        setOrgName(currentOrg.name);
        setOrgSlug(currentOrg.slug);
        setOrgDomain(currentOrg.domain ?? "");
        setOrgLogoUrl(currentOrg.logo_url ?? null);
      }

      await orgStore.fetchBilling(orgId);
      const billing = useOrganizationStore.getState().billing;
      if (billing) {
        setPlanTier(billing.plan_tier);
        setBillingCycle(billing.billing_cycle ?? "");
        setBillingEmail(billing.billing_email ?? "");
      }
    };

    loadOrgData();
  }, [ profiles]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (activeTab === "profile") {
        const { error } = await createClient().auth.updateUser({
          email: email !== "" ? email : undefined,
          data: { full_name: fullName, job_title: jobTitle },
        });
        if (error) {
          throw new Error(error.message ?? "Failed to update profile");
        }
        toast.success("Profile updated successfully");
      } else if (activeTab === "security") {
        if (!newPassword) {
          toast.error("Enter a new password");
          setSaving(false);
          return;
        }
        const result = await useAuthStore.getState().updatePassword(
          newPassword,
        );
        if (!result.success) {
          throw new Error(result.error ?? "Failed to update password");
        }
        setCurrentPassword("");
        setNewPassword("");
        toast.success("Password updated successfully");
      } else if (activeTab === "notifications") {
        const { error } = await createClient().auth.updateUser({
          data: { notification_prefs: notifToggles },
        });
        if (error) {
          throw new Error(error.message ?? "Failed to save notification preferences");
        }
        toast.success("Notification preferences saved");
      } else if (activeTab === "agents") {
        const { error } = await createClient().auth.updateUser({
          data: { agent_telemetry_interval: parseInt(telemetryInterval) },
        });
        if (error) {
          throw new Error(error.message ?? "Failed to save agent configuration");
        }
        toast.success("Agent configuration saved");
      } else if (activeTab === "organization") {
        const orgId = profiles[0]?.organization_id;
        if (!orgId) {
          throw new Error("Unable to determine organization");
        }

        await useOrganizationStore.getState().updateOrganizationData(orgId, {
          name: orgName,
          slug: orgSlug,
          domain: orgDomain || null,
        });
        toast.success("Organization settings saved");
      } else {
        toast.success("Settings saved");
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
          Manage your account and platform preferences
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
            {availableTabs.map((tab) => (
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
                  <Label htmlFor="org">Organization</Label>
                  <Input
                    id="org"
                    value={org}
                    onChange={(e) => setOrg(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <div className="h-9 px-3 flex items-center bg-muted/50 border border-border rounded-md text-sm text-muted-foreground">
                  {user?.role || "—"}
                </div>
              </div>
            </div>
          )}

          {activeTab === "notifications" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold text-foreground mb-1">
                  Notification Preferences
                </h2>
                <p className="text-sm text-muted-foreground">
                  Choose what you&apos;re notified about
                </p>
              </div>
              <div className="space-y-4">
                {notificationSettings.map((setting) => (
                  <div
                    key={setting.id}
                    className="flex items-center justify-between py-3 border-b border-border last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {setting.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {setting.desc}
                      </p>
                    </div>
                    <Switch
                      checked={notifToggles[setting.id]}
                      onCheckedChange={(v) =>
                        setNotifToggles((prev) => ({
                          ...prev,
                          [setting.id]: v,
                        }))
                      }
                    />
                  </div>
                ))}
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
                      aria-label={
                        showCurrentPassword ? "Hide password" : "Show password"
                      }
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
                      aria-label={
                        showNewPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Must be at least 8 characters with uppercase, number and
                    special character.
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-border space-y-3">
                <p className="text-sm font-medium text-foreground">
                  Session Settings
                </p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-foreground">
                      Auto-logout after inactivity
                    </p>
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
                      <p className="text-sm text-foreground">
                        Authenticator app
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Enabled &mdash; you&apos;ll be prompted for a code on sign in
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const result = await useAuthStore
                          .getState()
                          .unenrollMFA();
                        if (result.success) {
                          await useAuthStore
                            .getState()
                            .syncMFAStatusToProfile(false);
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
                      <p className="text-sm text-foreground">
                        Not enabled
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {role === "ORG_ADMIN"
                          ? "Required for organization admins"
                          : "Add an extra layer of security to your account"}
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
                  Customize your dashboard experience
                </p>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-foreground mb-3">
                    Theme
                  </p>
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
                        {t === "system"
                          ? "System"
                          : t.charAt(0).toUpperCase() + t.slice(1)}
                        {theme === t && (
                          <CheckCircle className="h-3 w-3 inline-block ml-1.5 text-primary" />
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
                    {
                      label: "Compact mode",
                      desc: "Reduce spacing for more content",
                    },
                    {
                      label: "Show animations",
                      desc: "Enable motion effects throughout the UI",
                    },
                    {
                      label: "Show confidence scores",
                      desc: "Display ML confidence scores on alerts",
                    },
                  ].map((pref) => (
                    <div
                      key={pref.label}
                      className="flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm text-foreground">{pref.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {pref.desc}
                        </p>
                      </div>
                      <Switch defaultChecked={pref.label !== "Compact mode"} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "agents" && hasRole(["ORG_ADMIN"]) && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold text-foreground mb-1">
                  Agent Configuration
                </h2>
                <p className="text-sm text-muted-foreground">
                  Global settings for deployed EdgePulse agents
                </p>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Current Agent Version</Label>
                    <div className="h-9 px-3 flex items-center bg-muted/50 border border-border rounded-md text-sm font-mono text-green-500">
                      v2.4.1
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="telemetryInterval">
                      Telemetry Interval (seconds)
                    </Label>
                    <Input
                      id="telemetryInterval"
                      value={telemetryInterval}
                      onChange={(e) => setTelemetryInterval(e.target.value)}
                      type="number"
                      min="5"
                      max="300"
                      className="h-9"
                    />
                  </div>
                </div>
                <div className="pt-4 border-t border-border space-y-3">
                  <p className="text-sm font-medium text-foreground">
                    Agent Behavior
                  </p>
                  {[
                    {
                      label: "Auto-block on critical detections",
                      desc: "Automatically isolate device when critical anomaly detected",
                      on: true,
                    },
                    {
                      label: "Offline mode fallback",
                      desc: "Continue detection without cloud connectivity",
                      on: true,
                    },
                    {
                      label: "Send telemetry to dashboard",
                      desc: "Stream real-time events to central dashboard",
                      on: true,
                    },
                    {
                      label: "Auto-update agents",
                      desc: "Silently update agents when new version available",
                      on: false,
                    },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm text-foreground">{s.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.desc}
                        </p>
                      </div>
                      <Switch defaultChecked={s.on} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "enrollment" && hasRole(["ORG_ADMIN"]) && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold text-foreground mb-1">
                  Device Enrollment
                </h2>
                <p className="text-sm text-muted-foreground">
                  Manage enrollment tokens for new devices
                </p>
              </div>
              <DeviceEnrollment />
            </div>
          )}

          {activeTab === "topology" && hasRole(["ORG_ADMIN"]) && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold text-foreground mb-1">
                  Network Topology
                </h2>
                <p className="text-sm text-muted-foreground">
                  Visualize device connections and security status
                </p>
              </div>
              <NetworkTopology />
            </div>
          )}

          {activeTab === "organization" && hasRole(["ORG_ADMIN"]) && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold text-foreground mb-1">
                  Organization Settings
                </h2>
                <p className="text-sm text-muted-foreground">
                  Manage your organization profile and billing
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="orgName">Organization Name</Label>
                  <Input
                    id="orgName"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="orgSlug">Slug</Label>
                  <Input
                    id="orgSlug"
                    value={orgSlug}
                    onChange={(e) => setOrgSlug(e.target.value)}
                    className="h-9 font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="orgDomain">Domain</Label>
                  <Input
                    id="orgDomain"
                    value={orgDomain}
                    onChange={(e) => setOrgDomain(e.target.value)}
                    className="h-9"
                    placeholder="example.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Logo</Label>
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                    {orgLogoUrl ? (
                      <div className="w-12 h-12 rounded-md overflow-hidden bg-background flex items-center justify-center border border-border/50">
                        <Image
                          src={orgLogoUrl}
                          alt={`${orgName} logo`}
                          className="w-full h-full object-contain"
                          width={48}
                          height={48}
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-md overflow-hidden bg-muted flex items-center justify-center border border-border/50">
                        <Building2 className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">
                        {orgName} Logo
                      </p>
                      <p>{orgLogoUrl ? "Uploaded during organization setup" : "No logo uploaded"}</p>
                    </div>
                    <input
                      type="file"
                      id="logo-upload"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoUpload}
                      disabled={orgLogoUploading}
                    />
                    <label htmlFor="logo-upload">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={orgLogoUploading}
                        asChild
                      >
                        <span>
                          <Upload className="h-3.5 w-3.5 mr-1.5" />
                          {orgLogoUploading ? "Uploading..." : "Upload"}
                        </span>
                      </Button>
                    </label>
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-border space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-1">
                    Billing
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Current subscription details
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label>Plan</Label>
                    <div className="h-9 px-3 flex items-center bg-muted/50 border border-border rounded-md text-sm font-medium capitalize text-foreground">
                      {planTier || "—"}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Billing Cycle</Label>
                    <div className="h-9 px-3 flex items-center bg-muted/50 border border-border rounded-md text-sm capitalize text-muted-foreground">
                      {billingCycle || "—"}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Billing Email</Label>
                    <div className="h-9 px-3 flex items-center bg-muted/50 border border-border rounded-md text-sm text-muted-foreground">
                      {billingEmail || "—"}
                    </div>
                  </div>
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
              disabled={saving}
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
