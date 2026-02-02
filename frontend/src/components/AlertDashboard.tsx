// Enhanced Frontend Alert Dashboard with Supabase Realtime
// This would be in your Next.js frontend

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Types
interface Alert {
  id: string;
  alert_id: string;
  timestamp: string;
  device_id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  anomaly_score: number;
  explanation_summary: string;
  detector_type: string;
  feature_importance: Record<string, number>;
  acknowledged: boolean;
  acknowledged_at?: string;
  created_at: string;
}

interface DeviceStatus {
  id: string;
  last_seen: string;
  status: 'online' | 'offline' | 'warning';
  cpu_usage?: number;
  memory_usage?: number;
  alerts_count: number;
  version?: string;
}

// Alert severity configuration
const ALERT_CONFIG = {
  critical: {
    color: 'bg-red-500',
    icon: '🚨',
    sound: true,
    notification: true,
    toast: toast.error,
  },
  high: {
    color: 'bg-orange-500',
    icon: '⚠️',
    sound: false,
    notification: true,
    toast: toast.warning,
  },
  medium: {
    color: 'bg-yellow-500',
    icon: '📊',
    sound: false,
    notification: false,
    toast: toast.info,
  },
  low: {
    color: 'bg-blue-500',
    icon: 'ℹ️',
    sound: false,
    notification: false,
    toast: null,
  },
};

// Main Dashboard Component
export default function AlertDashboard() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [devices, setDevices] = useState<Record<string, DeviceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    severity: 'all' as 'all' | 'low' | 'medium' | 'high' | 'critical',
    device_id: 'all' as string,
    acknowledged: 'all' as 'all' | 'acknowledged' | 'unacknowledged',
  });
  const [stats, setStats] = useState({
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    unacknowledged: 0,
  });

  // Load initial data
  useEffect(() => {
    loadInitialData();
    setupRealtimeSubscriptions();
    setupDeviceHeartbeat();

    return () => {
      // Cleanup subscriptions
      supabase.removeAllChannels();
    };
  }, []);

  // Realtime subscription setup
  const setupRealtimeSubscriptions = useCallback(() => {
    // Subscribe to alerts table changes
    const alertsChannel = supabase
      .channel('alerts_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'alerts',
        },
        (payload) => {
          console.log('Alert change:', payload);
          handleRealtimeAlert(payload);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Subscribed to alerts changes');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Failed to subscribe to alerts');
          toast.error('Failed to connect to real-time alerts');
        }
      });

    // Subscribe to device status changes
    const devicesChannel = supabase
      .channel('devices_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'devices',
        },
        (payload) => {
          console.log('Device change:', payload);
          handleRealtimeDevice(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(alertsChannel);
      supabase.removeChannel(devicesChannel);
    };
  }, []);

  // Handle realtime alert updates
  const handleRealtimeAlert = useCallback((payload: any) => {
    const { eventType, new: newAlert, old: oldAlert } = payload;

    if (eventType === 'INSERT') {
      // New alert received
      setAlerts(prev => [newAlert, ...prev.slice(0, 99)]); // Keep last 100
      updateStats(newAlert, 1);
      
      // Show notification based on severity
      const config = ALERT_CONFIG[newAlert.severity];
      if (config.toast) {
        config.toast(`🚨 ${newAlert.device_id}: ${newAlert.explanation_summary}`, {
          toastId: newAlert.alert_id, // Prevent duplicates
          autoClose: config.severity === 'critical' ? false : 8000,
        });
      }

      // Browser notification for critical alerts
      if (config.notification && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(`Critical Alert: ${newAlert.device_id}`, {
          body: newAlert.explanation_summary,
          icon: '/favicon.ico',
          tag: newAlert.alert_id,
        });
      }
    } else if (eventType === 'UPDATE') {
      // Alert updated (e.g., acknowledged)
      setAlerts(prev => prev.map(alert => 
        alert.id === newAlert.id ? newAlert : alert
      ));
      
      if (oldAlert.acknowledged !== newAlert.acknowledged) {
        updateStats(newAlert, newAlert.acknowledged ? -1 : 1);
      }
    } else if (eventType === 'DELETE') {
      // Alert deleted
      setAlerts(prev => prev.filter(alert => alert.id !== oldAlert.id));
      updateStats(oldAlert, -1);
    }
  }, []);

  // Handle realtime device updates
  const handleRealtimeDevice = useCallback((payload: any) => {
    const { eventType, new: newDevice } = payload;

    if (eventType === 'INSERT' || eventType === 'UPDATE') {
      setDevices(prev => ({
        ...prev,
        [newDevice.id]: newDevice,
      }));
    } else if (eventType === 'DELETE') {
      setDevices(prev => {
        const updated = { ...prev };
        delete updated[payload.old.id];
        return updated;
      });
    }
  }, []);

  // Load initial data
  const loadInitialData = async () => {
    try {
      setLoading(true);

      // Load recent alerts
      const { data: alertsData, error: alertsError } = await supabase
        .from('alerts')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(100);

      if (alertsError) throw alertsError;
      setAlerts(alertsData || []);

      // Load device statuses
      const { data: devicesData, error: devicesError } = await supabase
        .from('devices')
        .select('*');

      if (devicesError) throw devicesError;
      
      const deviceMap = (devicesData || []).reduce((acc, device) => {
        acc[device.id] = device;
        return acc;
      }, {} as Record<string, DeviceStatus>);
      setDevices(deviceMap);

      // Calculate initial stats
      calculateStats(alertsData || []);

    } catch (error) {
      console.error('Error loading initial data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  // Setup periodic device heartbeat check
  const setupDeviceHeartbeat = useCallback(() => {
    const interval = setInterval(async () => {
      const now = new Date();
      const updatedDevices = { ...devices };

      // Mark devices as offline if not seen in 5 minutes
      Object.entries(updatedDevices).forEach(([deviceId, device]) => {
        const lastSeen = new Date(device.last_seen);
        const timeDiff = now.getTime() - lastSeen.getTime();
        const minutesDiff = timeDiff / (1000 * 60);

        if (minutesDiff > 5 && device.status === 'online') {
          updatedDevices[deviceId] = {
            ...device,
            status: 'offline',
          };
        }
      });

      setDevices(updatedDevices);
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [devices]);

  // Update statistics
  const updateStats = useCallback((alert: Alert, delta: number) => {
    setStats(prev => ({
      ...prev,
      total: prev.total + delta,
      [alert.severity]: prev[alert.severity as keyof typeof prev] + delta,
      unacknowledged: prev.unacknowledged + (alert.acknowledged ? 0 : delta),
    }));
  }, []);

  const calculateStats = useCallback((alerts: Alert[]) => {
    const stats = {
      total: alerts.length,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      unacknowledged: 0,
    };

    alerts.forEach(alert => {
      stats[alert.severity]++;
      if (!alert.acknowledged) stats.unacknowledged++;
    });

    setStats(stats);
  }, []);

  // Acknowledge alert
  const acknowledgeAlert = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('alerts')
        .update({ 
          acknowledged: true, 
          acknowledged_at: new Date().toISOString() 
        })
        .eq('id', alertId);

      if (error) throw error;
      
      toast.success('Alert acknowledged');
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      toast.error('Failed to acknowledge alert');
    }
  };

  // Filter alerts
  const filteredAlerts = alerts.filter(alert => {
    if (filter.severity !== 'all' && alert.severity !== filter.severity) return false;
    if (filter.device_id !== 'all' && alert.device_id !== filter.device_id) return false;
    if (filter.acknowledged !== 'all') {
      const isAcknowledged = alert.acknowledged;
      if (filter.acknowledged === 'acknowledged' && !isAcknowledged) return false;
      if (filter.acknowledged === 'unacknowledged' && isAcknowledged) return false;
    }
    return true;
  });

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <ToastContainer position="top-right" />
      
      {/* Header with stats */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">EdgePulse Alert Dashboard</h1>
          
          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mt-6">
            <div className="bg-white p-4 rounded-lg border">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-sm text-gray-500">Total Alerts</div>
            </div>
            <div className="bg-red-50 p-4 rounded-lg border border-red-200">
              <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
              <div className="text-sm text-red-500">Critical</div>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
              <div className="text-2xl font-bold text-orange-600">{stats.high}</div>
              <div className="text-sm text-orange-500">High</div>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
              <div className="text-2xl font-bold text-yellow-600">{stats.medium}</div>
              <div className="text-sm text-yellow-500">Medium</div>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="text-2xl font-bold text-blue-600">{stats.low}</div>
              <div className="text-sm text-blue-500">Low</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
              <div className="text-2xl font-bold text-purple-600">{stats.unacknowledged}</div>
              <div className="text-sm text-purple-500">Unacknowledged</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <select
              value={filter.severity}
              onChange={(e) => setFilter(prev => ({ ...prev, severity: e.target.value as any }))}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            
            <select
              value={filter.device_id}
              onChange={(e) => setFilter(prev => ({ ...prev, device_id: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="all">All Devices</option>
              {Object.entries(devices).map(([id, device]) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
            
            <select
              value={filter.acknowledged}
              onChange={(e) => setFilter(prev => ({ ...prev, acknowledged: e.target.value as any }))}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="all">All Status</option>
              <option value="unacknowledged">Unacknowledged</option>
              <option value="acknowledged">Acknowledged</option>
            </select>
            
            <div className="text-sm text-gray-500 py-2">
              Showing {filteredAlerts.length} of {alerts.length} alerts
            </div>
          </div>
        </div>
      </div>

      {/* Alerts list */}
      <div className="max-w-7xl mx-auto px-4 pb-6">
        <div className="bg-white rounded-lg shadow">
          <div className="divide-y divide-gray-200">
            {filteredAlerts.map((alert) => {
              const config = ALERT_CONFIG[alert.severity];
              return (
                <div key={alert.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className={`w-2 h-2 rounded-full mt-2 ${config.color}`}></div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">{alert.device_id}</span>
                          <span className={`px-2 py-1 text-xs rounded-full ${config.color} text-white`}>
                            {alert.severity.toUpperCase()}
                          </span>
                          <span className="text-sm text-gray-500">
                            {new Date(alert.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1 text-gray-900">{alert.explanation_summary}</p>
                        <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500">
                          <span>Score: {alert.anomaly_score.toFixed(3)}</span>
                          <span>Detector: {alert.detector_type}</span>
                          {!alert.acknowledged && (
                            <button
                              onClick={() => acknowledgeAlert(alert.id)}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              Acknowledge
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          {filteredAlerts.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              No alerts found matching the current filters
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
