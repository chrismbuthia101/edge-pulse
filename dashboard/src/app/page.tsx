'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Alert, Device } from '@/types'

export default function Dashboard() {
  const [devices, setDevices] = useState<Device[]>([])
  const [recentAlerts, setRecentAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
    
    // Subscribe to real-time updates
    const subscription = supabase
      .channel('alerts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, () => {
        loadData()
      })
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const loadData = async () => {
    try {
      // Load alerts
      const { data: alertsData } = await supabase
        .from('alerts')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(10)

      if (alertsData) {
        setRecentAlerts(alertsData as Alert[])
      }

      // Load devices (would need device table)
      setDevices([])
      
      setLoading(false)
    } catch (error) {
      console.error('Error loading data:', error)
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="p-8">Loading...</div>
  }

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8">
        <h1 className="text-4xl font-bold">EdgePulse Dashboard</h1>
        <p className="text-gray-600 mt-2">ML-Powered Edge Device Anomaly Detection</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Active Devices</h2>
          <p className="text-3xl font-bold">{devices.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Alerts Today</h2>
          <p className="text-3xl font-bold">{recentAlerts.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">System Status</h2>
          <p className="text-lg text-green-600">Operational</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h2 className="text-2xl font-semibold mb-4">Recent Alerts</h2>
        <div className="space-y-4">
          {recentAlerts.length === 0 ? (
            <p className="text-gray-500">No alerts</p>
          ) : (
            recentAlerts.map((alert) => {
              // Handle different data structures from Supabase
              const explanation = alert.explanation || (alert as any).alert_data?.anomaly?.explanation || { summary: 'No explanation available' }
              const anomalyType = alert.anomaly_type || (alert as any).alert_data?.anomaly?.anomaly_type || 'Unknown'
              
              return (
                <div key={alert.alert_id} className="border-b pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold">{anomalyType}</h3>
                      <p className="text-sm text-gray-600">{explanation.summary || 'No explanation available'}</p>
                      <p className="text-xs text-gray-500 mt-1">{new Date(alert.timestamp).toLocaleString()}</p>
                    </div>
                    <span className={`px-3 py-1 rounded text-sm font-semibold ${
                      alert.severity === 'critical' ? 'bg-red-100 text-red-800' :
                      alert.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                      alert.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {alert.severity.toUpperCase()}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
