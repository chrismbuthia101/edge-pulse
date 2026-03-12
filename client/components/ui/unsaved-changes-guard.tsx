import { useEffect, useRef, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface UseUnsavedChangesGuardOptions {
  hasUnsavedChanges: boolean;
  onDiscard?: () => void;
  message?: string;
}

export function useUnsavedChangesGuard({
  hasUnsavedChanges,
  onDiscard,
  message = "You have unsaved changes. Are you sure you want to leave?",
}: UseUnsavedChangesGuardOptions) {
  const router = useRouter();
  const lastPathRef = useRef<string>("");
  const [isNavigatingAway, setIsNavigatingAway] = useState(false);

  const handleBeforeUnload = useCallback((e: BeforeUnloadEvent) => {
    if (hasUnsavedChanges && !isNavigatingAway) {
      e.preventDefault();
      e.returnValue = message;
      return message;
    }
  }, [hasUnsavedChanges, message, isNavigatingAway]);

  const handleRouteChange = useCallback((url: string) => {
    if (hasUnsavedChanges && !isNavigatingAway) {
      setIsNavigatingAway(true);
      const confirmed = window.confirm(message);
      if (confirmed) {
        onDiscard?.();
        lastPathRef.current = url;
        return true;
      } else {
        setIsNavigatingAway(false);
        router.push(lastPathRef.current || window.location.pathname);
        return false;
      }
    }
    lastPathRef.current = url;
    return true;
  }, [hasUnsavedChanges, message, onDiscard, router, isNavigatingAway]);

  useEffect(() => {
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [handleBeforeUnload]);

  return {
    handleRouteChange,
    isNavigatingAway,
  };
}

interface UnsavedChangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
  onDiscard?: () => void;
  onCancel?: () => void;
  title?: string;
  description?: string;
  saveText?: string;
  discardText?: string;
  cancelText?: string;
}

export function UnsavedChangesDialog({
  open,
  onOpenChange,
  onSave,
  onDiscard,
  onCancel,
  title = "Unsaved Changes",
  description = "You have unsaved changes. Would you like to save them before leaving?",
  saveText = "Save",
  discardText = "Don't Save",
  cancelText = "Cancel",
}: UnsavedChangesDialogProps) {
  const handleSave = () => {
    onSave?.();
    onOpenChange(false);
  };

  const handleDiscard = () => {
    onDiscard?.();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCancel}>
            {cancelText}
          </Button>
          <Button variant="destructive" onClick={handleDiscard}>
            {discardText}
          </Button>
          <Button onClick={handleSave}>
            {saveText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface UseNavigationGuardProps {
  when?: boolean;
  onConfirm?: () => void;
  message?: string;
}

export function useNavigationGuard({
  when = false,
  onConfirm,
  message = "You have unsaved changes. Are you sure you want to leave?"
}: UseNavigationGuardProps) {
  const currentPath = useRef(typeof window !== 'undefined' ? window.location.pathname : '');

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (when) {
        event.preventDefault();
        const confirmed = window.confirm(message);
        if (confirmed) {
          onConfirm?.();
        } else {
          window.history.pushState(null, '', currentPath.current);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [when, message, onConfirm]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      currentPath.current = window.location.pathname;
    }
  }, []);
}

// Higher-order component for route protection
export function withUnsavedChangesGuard<P extends object>(
  Component: React.ComponentType<P>
) {
  return function GuardedComponent(props: P) {
    // This would need to be integrated with the routing system
    // For now, it's a placeholder for the concept
    return <Component {...props} />;
  };
}
