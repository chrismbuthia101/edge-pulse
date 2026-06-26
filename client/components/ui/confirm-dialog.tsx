"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "warning" | "default";
  icon?: React.ReactNode;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
  // For reject user action
  reasonRequired?: boolean;
  onReasonChange?: (reason: string) => void;
  reason?: string;
}

const variantConfig = {
  destructive: {
    icon: AlertTriangle,
    iconColor: "text-destructive",
    iconBg: "bg-destructive/10",
    iconGradient: "from-red-500 to-rose-600",
    glowColor: "shadow-red-500/20",
    confirmVariant: "destructive" as const,
  },
  warning: {
    icon: AlertCircle,
    iconColor: "text-amber-500",
    iconBg: "bg-amber-500/10",
    iconGradient: "from-amber-500 to-orange-600",
    glowColor: "shadow-amber-500/20",
    confirmVariant: "default" as const,
  },
  default: {
    icon: Info,
    iconColor: "text-primary",
    iconBg: "bg-primary/10",
    iconGradient: "from-cyan-500 to-blue-600",
    glowColor: "shadow-cyan-500/20",
    confirmVariant: "default" as const,
  },
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  icon,
  onConfirm,
  loading = false,
  reasonRequired = false,
  onReasonChange,
  reason = "",
}: ConfirmDialogProps) {
  const config = variantConfig[variant];
  const DefaultIcon = config.icon;

  const handleConfirm = async () => {
    if (reasonRequired && !reason.trim()) {
      return;
    }
    await onConfirm();
  };

  const isConfirmDisabled = loading || (reasonRequired && !reason.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className={cn(
                  "relative w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden shadow-xl shadow-slate-900/10 border border-white/10",
                  config.iconBg
                )}>
                  {icon ? (
                    <div className={cn("relative z-10 h-5 w-5", config.iconColor)}>{icon}</div>
                  ) : (
                    <DefaultIcon className={cn("relative z-10 h-5 w-5", config.iconColor)} />
                  )}
                  <div className={cn(
                    "pointer-events-none absolute inset-0 rounded-xl opacity-30 blur-2xl -z-10",
                    config.iconGradient
                  )} />
                </div>
              </div>
              <div>
                <DialogTitle className="text-lg">{title}</DialogTitle>
                <DialogDescription className="mt-0.5">{description}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {reasonRequired && (
            <div className="space-y-2 py-2">
              <label
                htmlFor="reason"
                className="text-sm font-medium text-foreground"
              >
                Reason <span className="text-destructive">*</span>
              </label>
              <Textarea
                id="reason"
                placeholder="Please provide a reason..."
                value={reason}
                onChange={(e) => onReasonChange?.(e.target.value)}
                className="min-h-20 resize-none"
                disabled={loading}
              />
            </div>
          )}

          <DialogFooter className="gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {cancelLabel}
            </Button>
            <Button
              variant={config.confirmVariant}
              onClick={handleConfirm}
              disabled={isConfirmDisabled}
              className={cn(
                "shadow-xl transition-all duration-200 hover:-translate-y-0.5",
                config.confirmVariant === "default" && variant === "warning" && "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20",
                config.confirmVariant === "default" && variant === "default" && "shadow-cyan-500/30",
                config.confirmVariant === "destructive" && "shadow-red-500/25",
              )}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                confirmLabel
              )}
            </Button>
          </DialogFooter>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
