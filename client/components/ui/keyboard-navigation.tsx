import { useEffect } from "react";

interface KeyboardNavigationOptions {
  onNavigate?: (direction: 'up' | 'down' | 'first' | 'last') => void;
  onSelect?: (index: number) => void;
  onDismiss?: (index: number) => void;
  onMarkRead?: (index: number) => void;
  onEscape?: () => void;
  enabled?: boolean;
  itemsCount?: number;
}

export function useNotificationKeyboardNavigation({
  onNavigate,
  onSelect,
  onDismiss,
  onMarkRead,
  onEscape,
  enabled = true,
  itemsCount = 0,
}: KeyboardNavigationOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
        return;
      }

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          onNavigate?.('up');
          break;
        case 'ArrowDown':
          e.preventDefault();
          onNavigate?.('down');
          break;
        case 'Home':
          e.preventDefault();
          onNavigate?.('first');
          break;
        case 'End':
          e.preventDefault();
          onNavigate?.('last');
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (e.shiftKey) {
            onMarkRead?.(0); // Would need current index in real implementation
          } else {
            onSelect?.(0); // Would need current index in real implementation
          }
          break;
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          onDismiss?.(0); // Would need current index in real implementation
          break;
        case 'r':
        case 'R':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            onMarkRead?.(0); // Would need current index in real implementation
          }
          break;
        case 'Escape':
          e.preventDefault();
          onEscape?.();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onNavigate, onSelect, onDismiss, onMarkRead, onEscape, itemsCount]);
}

interface NotificationItemProps {
  children: React.ReactNode;
  isSelected?: boolean;
  onSelect?: () => void;
  onDismiss?: () => void;
  onMarkRead?: () => void;
  className?: string;
}

export function NotificationItem({
  children,
  isSelected = false,
  onSelect,
  onDismiss,
  onMarkRead,
  className = "",
}: NotificationItemProps) {
  return (
    <div
      className={`group relative transition-all ${isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''} ${className}`}
      tabIndex={isSelected ? 0 : -1}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          onDismiss?.();
        } else if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          onMarkRead?.();
        }
      }}
      role="option"
      aria-selected={isSelected}
    >
      {children}

      {/* Keyboard shortcuts hint */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="text-[10px] text-muted-foreground bg-background border border-border rounded px-1.5 py-0.5">
          <span className="font-mono">↑↓</span> navigate
          <span className="mx-1">·</span>
          <span className="font-mono">Enter</span> open
          <span className="mx-1">·</span>
          <span className="font-mono">Del</span> dismiss
        </div>
      </div>
    </div>
  );
}

export function KeyboardShortcutsHelp() {
  return (
    <div className="text-xs text-muted-foreground space-y-1 bg-muted/30 rounded-lg p-3">
      <div className="font-medium text-foreground mb-2">Keyboard Shortcuts</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <div><kbd className="px-1.5 py-0.5 bg-background border border-border rounded text-[10px]">↑↓</kbd> Navigate</div>
        <div><kbd className="px-1.5 py-0.5 bg-background border border-border rounded text-[10px]">Home/End</kbd> First/Last</div>
        <div><kbd className="px-1.5 py-0.5 bg-background border border-border rounded text-[10px]">Enter</kbd> Select</div>
        <div><kbd className="px-1.5 py-0.5 bg-background border border-border rounded text-[10px]">Delete</kbd> Dismiss</div>
        <div><kbd className="px-1.5 py-0.5 bg-background border border-border rounded text-[10px]">R</kbd> Mark Read</div>
        <div><kbd className="px-1.5 py-0.5 bg-background border border-border rounded text-[10px]">Esc</kbd> Close</div>
      </div>
    </div>
  );
}
