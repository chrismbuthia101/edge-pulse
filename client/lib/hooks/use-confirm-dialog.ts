import { useState, useCallback } from "react";
import type { ConfirmDialogProps } from "@/components/ui/confirm-dialog";

interface UseConfirmDialogReturn {
  isOpen: boolean;
  dialogProps: ConfirmDialogProps;
  confirm: (options: Omit<ConfirmDialogProps, "open" | "onOpenChange">) => Promise<boolean>;
  close: () => void;
}

export function useConfirmDialog(): UseConfirmDialogReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [dialogProps, setDialogProps] = useState<Omit<ConfirmDialogProps, "open" | "onOpenChange" | "onConfirm">>({
    title: "",
    description: "",
    variant: "default",
  });
  const [storedOnConfirm, setStoredOnConfirm] = useState<(() => void | Promise<void>) | undefined>();
  const [resolvePromise, setResolvePromise] = useState<((confirmed: boolean) => void) | null>(null);

  const confirm = useCallback(
    (options: Omit<ConfirmDialogProps, "open" | "onOpenChange">): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        setDialogProps(options);
        setStoredOnConfirm(options.onConfirm);
        setResolvePromise(() => resolve);
        setIsOpen(true);
      });
    },
    []
  );

  const handleConfirm = useCallback(async () => {
    if (storedOnConfirm) {
      await storedOnConfirm();
    }
    setIsOpen(false);
    if (resolvePromise) {
      resolvePromise(true);
      setResolvePromise(null);
    }
  }, [storedOnConfirm, resolvePromise]);

  const handleCancel = useCallback(() => {
    setIsOpen(false);
    if (resolvePromise) {
      resolvePromise(false);
      setResolvePromise(null);
    }
  }, [resolvePromise]);

  const close = useCallback(() => {
    setIsOpen(false);
    if (resolvePromise) {
      resolvePromise(false);
      setResolvePromise(null);
    }
  }, [resolvePromise]);

  return {
    isOpen,
    dialogProps: {
      ...dialogProps,
      open: isOpen,
      onOpenChange: (open: boolean) => {
        if (!open) handleCancel();
        setIsOpen(open);
      },
      onConfirm: handleConfirm,
    },
    confirm,
    close,
  };
}
