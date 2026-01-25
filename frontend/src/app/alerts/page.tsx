'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Alert } from '@/types'

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    loadAlerts()
    
    const subscription = supabase
      .channel('alerts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, () => {
        loadAlerts()
      })
      .subscribe()

    return () => subscription.unsubscribe()
  }, [filter])

  const loadAlerts = async () => {
    try {
      let query = supabase
        .from('alerts')
        .select('*')
        .order('timestamp', { ascending: false })

      if (filter !== 'all') {
        query = query.eq('severity', filter)
      }

      const { data } = await query

      if (data) {
        setAlerts(data as Alert[])
      }
      setLoading(false)
    } catch (error) {
      console.error('Error loading alerts:', error)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8">
        <h1 className="text-4xl font-bold">Alerts</h1>
        <div className="mt-4 flex gap-4">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('critical')}
            className={`px-4 py-2 rounded ${filter === 'critical' ? 'bg-red-600 text-white' : 'bg-gray-200'}`}
          >
            Critical
          </button>
          <button
            onClick={() => setFilter('high')}
            className={`px-4 py-2 rounded ${filter === 'high' ? 'bg-orange-600 text-white' : 'bg-gray-200'}`}
          >
            High
          </button>
        </div>
      </header>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => {
            // Handle different data structures from Supabase
            const explanation = alert.explanation || (alert as any).alert_data?.anomaly?.explanation || { 
              summary: 'No explanation available',
              contributing_factors: []
            }
            const anomalyType = alert.anomaly_type || (alert as any).alert_data?.anomaly?.anomaly_type || 'Unknown'
            const contributingFactors = explanation.contributing_factors || []
            
            return (
              <div key={alert.alert_id} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-xl font-semibold">{anomalyType}</h2>
                    <p className="text-sm text-gray-600">{new Date(alert.timestamp).toLocaleString()}</p>
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
                <p className="mb-4">{explanation.summary || 'No explanation available'}</p>
                {contributingFactors.length > 0 && (
                  <div className="border-t pt-4">
                    <h3 className="font-semibold mb-2">Contributing Factors:</h3>
                    <ul className="list-disc list-inside space-y-1">
                      {contributingFactors.map((factor: any, idx: number) => (
                        <li key={idx} className="text-sm">
                          {factor.feature}: {factor.contribution.toFixed(4)} ({factor.direction})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
