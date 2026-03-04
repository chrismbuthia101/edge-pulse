import { create } from 'zustand';
import { Alert } from '@/lib/supabase/types';

interface AlertStore {
  alerts: Alert[];
  pendingCount: number;
  unreadCount: number;
  addAlert: (alert: Alert) => void;
  updateAlert: (id: string, updates: Partial<Alert>) => void;
  markRead: (id: string) => void;
  setAlerts: (alerts: Alert[]) => void;
}

export const useAlertStore = create<AlertStore>((set, get) => ({
  alerts: [],
  pendingCount: 0,
  unreadCount: 0,
  
  addAlert: (alert: Alert) => set((state) => ({
    alerts: [alert, ...state.alerts],
    pendingCount: state.pendingCount + (alert.status === 'PENDING' ? 1 : 0),
    unreadCount: state.unreadCount + 1,
  })),
  
  updateAlert: (id: string, updates: Partial<Alert>) => set((state) => ({
    alerts: state.alerts.map(alert => 
      alert.id === id ? { ...alert, ...updates } : alert
    ),
    pendingCount: state.alerts.filter(a => a.id === id && a.status === 'PENDING').length +
                  state.alerts.filter(a => a.id !== id && a.status === 'PENDING').length,
  })),
  
  markRead: (id: string) => set((state) => ({
    unreadCount: Math.max(0, state.unreadCount - 1),
  })),
  
  setAlerts: (alerts: Alert[]) => set({
    alerts,
    pendingCount: alerts.filter(a => a.status === 'PENDING').length,
    unreadCount: alerts.filter(a => a.status !== 'CLOSED').length,
  }),
}));
