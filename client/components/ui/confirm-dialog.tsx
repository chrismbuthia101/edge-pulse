"use client";

import * as React from "react";
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
    confirmVariant: "destructive" as const,
  },
  warning: {
    icon: AlertCircle,
    iconColor: "text-amber-500",
    iconBg: "bg-amber-500/10",
    confirmVariant: "default" as const,
  },
  default: {
    icon: Info,
    iconColor: "text-primary",
    iconBg: "bg-primary/10",
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
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center",
                config.iconBg
              )}
            >
              {icon ? (
                <div className={cn("h-5 w-5", config.iconColor)}>{icon}</div>
              ) : (
                <DefaultIcon className={cn("h-5 w-5", config.iconColor)} />
              )}
            </div>
            <DialogTitle className="text-lg">{title}</DialogTitle>
          </div>
          <DialogDescription className="ml-13">{description}</DialogDescription>
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
              className="min-h-[80px] resize-none"
              disabled={loading}
            />
          </div>
        )}

        <DialogFooter className="gap-2">
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
              config.confirmVariant === "default" && variant === "warning" && "bg-amber-500 hover:bg-amber-600 text-white"
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
      </DialogContent>
    </Dialog>
  );
}
