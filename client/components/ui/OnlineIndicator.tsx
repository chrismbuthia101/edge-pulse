"use client"

import { Wifi, WifiOff, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface OnlineIndicatorProps {
  status: 'online' | 'offline' | 'degraded'
  className?: string
  showText?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function OnlineIndicator({ status, className = '', showText = false, size = 'md' }: OnlineIndicatorProps) {
  const getStatusConfig = (status: string) => {
    switch (status.toLowerCase()) {
      case 'online':
        return {
          icon: Wifi,
          color: 'text-green-500',
          bgColor: 'bg-green-100',
          label: 'Online',
          description: 'Device is online and operational'
        }
      case 'offline':
        return {
          icon: WifiOff,
          color: 'text-red-500',
          bgColor: 'bg-red-100',
          label: 'Offline',
          description: 'Device is offline'
        }
      case 'degraded':
        return {
          icon: AlertTriangle,
          color: 'text-yellow-500',
          bgColor: 'bg-yellow-100',
          label: 'Degraded',
          description: 'Device connectivity is degraded'
        }
      default:
        return {
          icon: WifiOff,
          color: 'text-gray-500',
          bgColor: 'bg-gray-100',
          label: 'Unknown',
          description: 'Device status unknown'
        }
    }
  }

  const config = getStatusConfig(status)
  const Icon = config.icon

  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  }

  return (
    <div 
      className={cn(
        "flex items-center space-x-2",
        className
      )}
      title={config.description}
    >
      <div className={cn(
        "rounded-full p-1",
        config.bgColor
      )}>
        <Icon 
          className={cn(
            sizeClasses[size],
            config.color
          )} 
        />
      </div>
      {showText && (
        <span className={cn(
          "text-sm font-medium",
          config.color
        )}>
          {config.label}
        </span>
      )}
    </div>
  )
}
