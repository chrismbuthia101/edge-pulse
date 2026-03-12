"use client";

import { useCallback } from "react";
import { toast as sonnerToast, Toaster } from "sonner";
import { X, Undo } from "lucide-react";
import { Button } from "./button";

type SonnerToastOptions = Parameters<typeof sonnerToast.success>[1];

interface ToastData {
    id: string;
    message: string;
    type: "success" | "error" | "warning" | "info";
    undoAction?: () => void;
    undoLabel?: string;
}

// Global toast store for undo functionality
const toastStore: Map<string, ToastData> = new Map();

function generateToastId() {
    return Math.random().toString(36).slice(2, 11);
}

export function useEnhancedToast() {
    const showToast = useCallback(
        (
            message: string,
            type: "success" | "error" | "warning" | "info" = "info",
            options?: {
                duration?: number;
                undoAction?: () => void;
                undoLabel?: string;
            }
        ) => {
            const toastId = generateToastId();

            const toastData: ToastData = {
                id: toastId,
                message,
                type,
                undoAction: options?.undoAction,
                undoLabel: options?.undoLabel ?? "Undo",
            };

            toastStore.set(toastId, toastData);

            sonnerToast.custom(
                () => (
                    <EnhancedToast
                        toast={toastData}
                        onClose={() => {
                            sonnerToast.dismiss(toastId);
                            toastStore.delete(toastId);
                        }}
                    />
                ),
                {
                    id: toastId,
                    duration: options?.duration ?? 5000,
                }
            );

            return toastId;
        },
        []
    );

    const dismissToast = useCallback((id: string) => {
        sonnerToast.dismiss(id);
        toastStore.delete(id);
    }, []);

    return { showToast, dismissToast };
}

function EnhancedToast({
    toast,
    onClose,
}: {
    toast: ToastData;
    onClose: () => void;
}) {
    const handleUndo = () => {
        if (toast.undoAction) {
            toast.undoAction();
            sonnerToast.success("Action undone");
        }
        onClose();
    };

    const typeStyles = {
        success:
            "bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400",
        error: "bg-destructive/10 border-destructive/20 text-destructive",
        warning:
            "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400",
        info: "bg-primary/10 border-primary/20 text-primary",
    };

    return (
        <div
            className={`group flex items - start gap - 3 p - 4 rounded - lg border shadow - lg
backdrop - blur - sm bg - card / 90
      ${typeStyles[toast.type]}
min - w - [320px] max - w - [400px]`}
        >
            <div className="flex-1">
                <p className="text-sm font-medium">{toast.message}</p>
            </div>

            <div className="flex items-center gap-2">
                {toast.undoAction && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleUndo}
                        className="h-7 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <Undo className="h-3 w-3 mr-1" />
                        {toast.undoLabel}
                    </Button>
                )}

                <button
                    onClick={onClose}
                    className="shrink-0 p-1 rounded-md hover:bg-black/10 transition-colors"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}

export function EnhancedToaster() {
    return (
        <Toaster
            position="top-right"
            expand={false}
            richColors
            closeButton
            toastOptions={{
                style: {
                    padding: 0,
                    background: "transparent",
                    border: "none",
                    boxShadow: "none",
                },
            }}
        />
    );
}

// Convenience functions
export const toast = {
    success: (message: string, options?: SonnerToastOptions) =>
        sonnerToast.success(message, options),

    error: (message: string, options?: SonnerToastOptions) =>
        sonnerToast.error(message, options),

    warning: (message: string, options?: SonnerToastOptions) =>
        sonnerToast.warning(message, options),

    info: (message: string, options?: SonnerToastOptions) =>
        sonnerToast.info(message, options),

    undoable: (
        message: string,
        undoAction: () => void,
        options?: {
            type?: "success" | "error" | "warning" | "info";
            undoLabel?: string;
            duration?: number;
        }
    ) => {
        const toastId = generateToastId();

        const toastData: ToastData = {
            id: toastId,
            message,
            type: options?.type ?? "info",
            undoAction,
            undoLabel: options?.undoLabel ?? "Undo",
        };

        toastStore.set(toastId, toastData);

        sonnerToast.custom(
            () => (
                <EnhancedToast
                    toast={toastData}
                    onClose={() => {
                        sonnerToast.dismiss(toastId);
                        toastStore.delete(toastId);
                    }}
                />
            ),
            {
                id: toastId,
                duration: options?.duration ?? 6000,
            }
        );

        return toastId;
    },
}
