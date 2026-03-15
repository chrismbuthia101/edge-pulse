"use client";

import { motion } from "framer-motion";
import { useState, useEffect, useMemo } from "react";
import { Eye, EyeOff, Shield, Lock, AlertTriangle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface PrivacyModeIndicatorProps {
  deviceId?: string;
}

export function PrivacyModeIndicator({ deviceId }: PrivacyModeIndicatorProps) {
  const [privacyMode, setPrivacyMode] = useState(false);
  const [privacySettings, setPrivacySettings] = useState({
    anonymizeIPs: true,
    encryptPII: true,
    maskUsernames: true,
    redactSensitiveData: true,
  });
  const supabase = createClient();

  const privacyLevels = useMemo(() => [
    {
      level: "Standard",
      description: "Basic data protection",
      icon: Shield,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/20",
      settings: {
        anonymizeIPs: true,
        encryptPII: true,
        maskUsernames: false,
        redactSensitiveData: false,
      },
    },
    {
      level: "Enhanced",
      description: "Maximum privacy protection",
      icon: Lock,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
      borderColor: "border-green-500/20",
      settings: {
        anonymizeIPs: true,
        encryptPII: true,
        maskUsernames: true,
        redactSensitiveData: true,
      },
    },
  ], []);

  useEffect(() => {
    const fetchPrivacySettings = async () => {
      try {
        const { data, error } = await supabase
          .from('privacy_settings')
          .select('*')
          .eq('device_id', deviceId || 'global')
          .single();

        if (data && !error) {
          setPrivacyMode(data.enhanced_mode);
          const currentLevel = data.enhanced_mode ? privacyLevels[1] : privacyLevels[0];
          setPrivacySettings(currentLevel.settings);
        }
      } catch {
        // Use default privacy settings on error
      }
    };

    fetchPrivacySettings();
  }, [deviceId, supabase, privacyLevels]);

  const handlePrivacyToggle = async () => {
    const newMode = !privacyMode;
    setPrivacyMode(newMode);

    // Apply settings for selected level
    const selectedLevel = newMode ? privacyLevels[1] : privacyLevels[0];
    setPrivacySettings(selectedLevel.settings);

    try {
      const { error } = await supabase
        .from('privacy_settings')
        .upsert({
          device_id: deviceId || 'global',
          enhanced_mode: newMode,
          ...selectedLevel.settings,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
    } catch {
      // Handle save error
    }
  };

  const currentLevel = privacyMode ? privacyLevels[1] : privacyLevels[0];
  const CurrentIcon = currentLevel.icon;

  return (
    <div className="bg-card border border-border rounded-xl lg:rounded-2xl overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 lg:px-5 py-3 lg:py-4 border-b border-border gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Lock className="h-4 w-4 text-primary shrink-0" />
          <h3 className="text-sm font-semibold text-foreground truncate">Privacy Mode</h3>
        </div>
        <div className="flex items-center gap-2 lg:gap-3 text-xs min-w-0">
          <div className={cn(
            "w-2 h-2 rounded-full",
            privacyMode ? "bg-green-500" : "bg-blue-500"
          )} />
          <span className="text-muted-foreground">{currentLevel.level} Protection</span>
        </div>
      </div>

      <div className="p-4 lg:p-5 space-y-4">
        {/* Current Privacy Level */}
        <div className={cn(
          "flex items-center justify-between p-3 rounded-lg border",
          currentLevel.bgColor, currentLevel.borderColor
        )}>
          <div className="flex items-center gap-3">
            <CurrentIcon className={cn("h-5 w-5", currentLevel.color)} />
            <div>
              <div className="text-sm font-medium text-foreground">{currentLevel.level}</div>
              <div className="text-xs text-muted-foreground">{currentLevel.description}</div>
            </div>
          </div>

          <button
            onClick={handlePrivacyToggle}
            className={cn(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
              privacyMode ? "bg-green-500" : "bg-blue-500"
            )}
          >
            <span
              className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                privacyMode ? "translate-x-6" : "translate-x-1"
              )}
            />
          </button>
        </div>

        {/* Privacy Settings */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-foreground mb-2">Active Protections</div>

          {[
            { key: "anonymizeIPs", label: "IP Anonymization", description: "Mask last octet of IP addresses" },
            { key: "encryptPII", label: "PII Encryption", description: "Encrypt personally identifiable information" },
            { key: "maskUsernames", label: "Username Masking", description: "Replace usernames with hashes" },
            { key: "redactSensitiveData", label: "Data Redaction", description: "Remove sensitive telemetry fields" },
          ].map((setting) => (
            <motion.div
              key={setting.key}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="flex items-center justify-between p-2 rounded-lg border border-border"
            >
              <div className="flex items-center gap-2 min-w-0">
                {privacySettings[setting.key as keyof typeof privacySettings] ? (
                  <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground">{setting.label}</div>
                  <div className="text-[10px] text-muted-foreground">{setting.description}</div>
                </div>
              </div>

              <div className={cn(
                "text-xs px-2 py-0.5 rounded-full",
                privacySettings[setting.key as keyof typeof privacySettings]
                  ? "bg-green-500/10 text-green-600"
                  : "bg-amber-500/10 text-amber-600"
              )}>
                {privacySettings[setting.key as keyof typeof privacySettings] ? "Active" : "Inactive"}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Privacy Notice */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className={cn(
            "p-3 rounded-lg border",
            privacyMode
              ? "bg-green-500/5 border-green-500/20"
              : "bg-blue-500/5 border-blue-500/20"
          )}
        >
          <div className="flex items-start gap-2">
            {privacyMode ? (
              <Eye className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
            )}
            <div className="text-xs text-muted-foreground">
              <div className="font-medium text-foreground mb-0.5">
                {privacyMode ? "Enhanced Privacy Active" : "Standard Privacy Mode"}
              </div>
              <div>
                {privacyMode
                  ? "All data collection follows maximum privacy protection. Some advanced features may have reduced accuracy."
                  : "Standard data collection with basic privacy protections. Full feature set available."
                }
              </div>
            </div>
          </div>
        </motion.div>

        {/* Action Button */}
        <button
          onClick={handlePrivacyToggle}
          className={cn(
            "w-full py-2 px-3 rounded-lg text-xs font-medium transition-colors",
            privacyMode
              ? "bg-blue-500 text-white hover:bg-blue-600"
              : "bg-green-500 text-white hover:bg-green-600"
          )}
        >
          {privacyMode ? "Switch to Standard Mode" : "Enable Enhanced Privacy"}
        </button>
      </div>
    </div>
  );
}
