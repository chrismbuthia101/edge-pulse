"use client"

import { Badge } from '@/components/ui/badge'
import { AlertTriangle, AlertCircle, Info, CheckCircle } from 'lucide-react'

interface SeverityBadgeProps {
  severity: 'low' | 'medium' | 'high' | 'critical'
  className?: string
  showIcon?: boolean
}

export function SeverityBadge({ severity, className = '', showIcon = false }: SeverityBadgeProps) {
  const getSeverityConfig = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return {
          variant: 'destructive' as const,
          icon: AlertTriangle,
          label: 'Critical',
          description: 'Critical severity - immediate attention required'
        }
      case 'high':
        return {
          variant: 'destructive' as const,
          icon: AlertTriangle,
          label: 'High',
          description: 'High severity - urgent attention required'
        }
      case 'medium':
        return {
          variant: 'default' as const,
          icon: AlertCircle,
          label: 'Medium',
          description: 'Medium severity - attention required'
        }
      case 'low':
        return {
          variant: 'secondary' as const,
          icon: Info,
          label: 'Low',
          description: 'Low severity - monitoring recommended'
        }
      default:
        return {
          variant: 'outline' as const,
          icon: Info,
          label: 'Unknown',
          description: 'Unknown severity level'
        }
    }
  }

  const config = getSeverityConfig(severity)
  const Icon = config.icon

  return (
    <Badge 
      variant={config.variant} 
      className={className}
      title={config.description}
    >
      {showIcon && <Icon className="h-3 w-3 mr-1" />}
      {config.label}
    </Badge>
  )
}
