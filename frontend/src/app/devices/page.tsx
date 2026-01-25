'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Device } from '@/types'

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDevices()
  }, [])

  const loadDevices = async () => {
    try {
      // This would query a devices table
      // For now, placeholder
      setDevices([])
      setLoading(false)
    } catch (error) {
      console.error('Error loading devices:', error)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8">
        <h1 className="text-4xl font-bold">Devices</h1>
      </header>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {devices.length === 0 ? (
            <p className="text-gray-500">No devices registered</p>
          ) : (
            devices.map((device) => (
              <div key={device.device_id} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                <h2 className="text-xl font-semibold mb-2">{device.device_name}</h2>
                <p className="text-sm text-gray-600 mb-4">{device.device_id}</p>
                <div className="flex justify-between items-center">
                  <span className={`px-3 py-1 rounded text-sm ${
                    device.status === 'online' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {device.status}
                  </span>
                  <span className="text-sm text-gray-600">
                    {device.alert_count} alerts
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
