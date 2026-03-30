"use client"

import { Badge } from '@/components/ui/badge'
import { Clock, CheckCircle, Eye, XCircle, Archive } from 'lucide-react'

interface AlertStatusBadgeProps {
  status: 'pending' | 'acknowledged' | 'investigated' | 'closed'
  className?: string
  showIcon?: boolean
}

export function AlertStatusBadge({ status, className = '', showIcon = false }: AlertStatusBadgeProps) {
  const getStatusConfig = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return {
          variant: 'default' as const,
          icon: Clock,
          label: 'Pending',
          description: 'Alert is pending acknowledgment'
        }
      case 'acknowledged':
        return {
          variant: 'secondary' as const,
          icon: Eye,
          label: 'Acknowledged',
          description: 'Alert has been acknowledged'
        }
      case 'investigated':
        return {
          variant: 'outline' as const,
          icon: CheckCircle,
          label: 'Investigated',
          description: 'Alert is under investigation'
        }
      case 'closed':
        return {
          variant: 'secondary' as const,
          icon: XCircle,
          label: 'Closed',
          description: 'Alert has been closed'
        }
      default:
        return {
          variant: 'outline' as const,
          icon: Archive,
          label: 'Unknown',
          description: 'Unknown alert status'
        }
    }
  }

  const config = getStatusConfig(status)
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
