"use client";

import { useState } from "react";
import { motion } from "framer-motion";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Tab = "profile" | "notifications" | "security" | "appearance" | "agents";

const tabs: { id: Tab; label: string; icon: typeof User }[] = [
    { id: "profile", label: "Profile", icon: User },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "security", label: "Security", icon: Shield },
    { id: "appearance", label: "Appearance", icon: Palette },
    { id: "agents", label: "Agent Config", icon: Monitor },
];

const notificationSettings = [
    { id: "critical_alerts", label: "Critical Alerts", desc: "Immediate notification for critical severity events", defaultOn: true },
    { id: "high_alerts", label: "High Severity Alerts", desc: "Notify on high severity detections", defaultOn: true },
    { id: "medium_alerts", label: "Medium Severity Alerts", desc: "Notify on medium severity detections", defaultOn: false },
    { id: "device_enrolled", label: "Device Enrollment", desc: "When a new device is enrolled", defaultOn: true },
    { id: "model_updates", label: "Model Updates", desc: "When ML model is updated across fleet", defaultOn: true },
    { id: "weekly_report", label: "Weekly Report", desc: "Weekly security digest email", defaultOn: true },
    { id: "system_health", label: "System Health Alerts", desc: "When a service degrades or goes down", defaultOn: false },
];

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState<Tab>("profile");
    const [saved, setSaved] = useState(false);
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [notifToggles, setNotifToggles] = useState<Record<string, boolean>>(
        Object.fromEntries(notificationSettings.map((n) => [n.id, n.defaultOn]))
    );

    const handleSave = () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    };

    return (
        <div className="max-w-[1000px] space-y-6">
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
                <h1 className="text-2xl font-display font-bold text-foreground">Settings</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Manage your account and platform preferences</p>
            </motion.div>

            <div className="flex gap-6">
                {/* Sidebar nav */}
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
                                className={cn(
                                    "flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm font-medium transition-all",
                                    activeTab === tab.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                                )}
                            >
                                <tab.icon className="h-4 w-4 shrink-0" />
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </motion.div>

                {/* Content */}
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
                                <h2 className="text-base font-semibold text-foreground mb-1">Profile Information</h2>
                                <p className="text-sm text-muted-foreground">Update your account details</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label>Full Name</Label>
                                    <Input defaultValue="John Administrator" className="h-9" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Job Title</Label>
                                    <Input defaultValue="Security Operations Lead" className="h-9" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Email Address</Label>
                                    <Input defaultValue="admin@company.com" type="email" className="h-9" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Organization</Label>
                                    <Input defaultValue="EdgePulse Enterprise" className="h-9" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Role</Label>
                                <div className="h-9 px-3 flex items-center bg-muted/50 border border-border rounded-md text-sm text-muted-foreground">
                                    Administrator (read-only)
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "notifications" && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-base font-semibold text-foreground mb-1">Notification Preferences</h2>
                                <p className="text-sm text-muted-foreground">Choose what you&apos;re notified about</p>
                            </div>
                            <div className="space-y-4">
                                {notificationSettings.map((setting) => (
                                    <div key={setting.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                                        <div>
                                            <p className="text-sm font-medium text-foreground">{setting.label}</p>
                                            <p className="text-xs text-muted-foreground">{setting.desc}</p>
                                        </div>
                                        <Switch
                                            checked={notifToggles[setting.id]}
                                            onCheckedChange={(v) => setNotifToggles((prev) => ({ ...prev, [setting.id]: v }))}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === "security" && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-base font-semibold text-foreground mb-1">Security Settings</h2>
                                <p className="text-sm text-muted-foreground">Manage your password and session settings</p>
                            </div>
                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <Label>Current Password</Label>
                                    <div className="relative">
                                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input type={showCurrentPassword ? "text" : "password"} className="pl-10 pr-10 h-9" placeholder="Enter current password" />
                                        <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowCurrentPassword((p) => !p)}>
                                            {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label>New Password</Label>
                                    <div className="relative">
                                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input type={showNewPassword ? "text" : "password"} className="pl-10 pr-10 h-9" placeholder="Enter new password" />
                                        <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowNewPassword((p) => !p)}>
                                            {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                                <div className="pt-4 border-t border-border space-y-3">
                                    <p className="text-sm font-medium text-foreground">Session Settings</p>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-foreground">Auto-logout after inactivity</p>
                                            <p className="text-xs text-muted-foreground">Automatically sign out after 30 minutes of inactivity</p>
                                        </div>
                                        <Switch defaultChecked />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-foreground">Two-factor authentication</p>
                                            <p className="text-xs text-muted-foreground">Require 2FA for sensitive operations</p>
                                        </div>
                                        <Switch defaultChecked />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "appearance" && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-base font-semibold text-foreground mb-1">Appearance</h2>
                                <p className="text-sm text-muted-foreground">Customize your dashboard experience</p>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <p className="text-sm font-medium text-foreground mb-3">Theme</p>
                                    <div className="grid grid-cols-3 gap-3">
                                        {["Light", "Dark", "System"].map((t) => (
                                            <button key={t} className="p-4 rounded-xl border border-border hover:border-primary/50 transition-colors text-sm font-medium text-center">
                                                {t}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="pt-4 border-t border-border space-y-3">
                                    <p className="text-sm font-medium text-foreground">Dashboard Preferences</p>
                                    {[
                                        { label: "Compact mode", desc: "Reduce spacing for more content" },
                                        { label: "Show animations", desc: "Enable motion effects throughout the UI" },
                                        { label: "Show confidence scores", desc: "Display ML confidence scores on alerts" },
                                    ].map((pref) => (
                                        <div key={pref.label} className="flex items-center justify-between">
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

                    {activeTab === "agents" && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-base font-semibold text-foreground mb-1">Agent Configuration</h2>
                                <p className="text-sm text-muted-foreground">Global settings for deployed EdgePulse agents</p>
                            </div>
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label>Current Agent Version</Label>
                                        <div className="h-9 px-3 flex items-center bg-muted/50 border border-border rounded-md text-sm font-mono text-green-500">v2.4.1</div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Telemetry Interval</Label>
                                        <Input defaultValue="30" type="number" className="h-9" />
                                    </div>
                                </div>
                                <div className="pt-4 border-t border-border space-y-3">
                                    <p className="text-sm font-medium text-foreground">Agent Behavior</p>
                                    {[
                                        { label: "Auto-block on critical detections", desc: "Automatically isolate device when critical threat detected", on: true },
                                        { label: "Offline mode fallback", desc: "Continue detection without cloud connectivity", on: true },
                                        { label: "Send telemetry to dashboard", desc: "Stream real-time events to central dashboard", on: true },
                                        { label: "Auto-update agents", desc: "Silently update agents when new version available", on: false },
                                    ].map((s) => (
                                        <div key={s.label} className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm text-foreground">{s.label}</p>
                                                <p className="text-xs text-muted-foreground">{s.desc}</p>
                                            </div>
                                            <Switch defaultChecked={s.on} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Save button */}
                    <div className="mt-6 pt-6 border-t border-border flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">Changes are saved to your account</p>
                        <Button onClick={handleSave} className="gap-2 min-w-[100px]">
                            {saved ? (
                                <>
                                    <CheckCircle2 className="h-4 w-4" />
                                    Saved!
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