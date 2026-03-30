"use client"

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Alert, ShapExplanation } from '@/lib/supabase/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { AlertTriangle, Clock, User, Activity, ArrowLeft } from 'lucide-react'
import { ShapChart } from '@/components/charts/ShapChart'
import { useAuth } from '@/lib/auth/useAuth'

export default function AlertDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user, hasRole } = useAuth()
  const supabase = createClient()
  
  const [alert, setAlert] = useState<Alert | null>(null)
  const [loading, setLoading] = useState(true)
  const [acknowledging, setAcknowledging] = useState(false)

  const alertId = params.alert_id as string

  useEffect(() => {
    if (alertId) {
      fetchAlert()
    }
  }, [alertId])

  const fetchAlert = async () => {
    try {
      setLoading(true)
      
      const { data, error } = await supabase
        .from('alert_records')
        .select('*')
        .eq('alert_id', alertId)
        .single()

      if (error) throw error
      setAlert(data)
    } catch (error) {
      console.error('Error fetching alert:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAcknowledge = async () => {
    if (!alert || !user) return

    try {
      setAcknowledging(true)

      const { error } = await supabase
        .from('alert_records')
        .update({
          alert_status: 'ACKNOWLEDGED',
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: user.id
        })
        .eq('alert_id', alert.alert_id)

      if (error) throw error

      // Refresh alert data
      await fetchAlert()
    } catch (error) {
      console.error('Error acknowledging alert:', error)
    } finally {
      setAcknowledging(false)
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical': return 'destructive'
      case 'high': return 'destructive'
      case 'medium': return 'default'
      case 'low': return 'secondary'
      default: return 'default'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending': return 'default'
      case 'acknowledged': return 'secondary'
      case 'investigated': return 'outline'
      case 'closed': return 'secondary'
      default: return 'default'
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-32 bg-gray-200 rounded mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  if (!alert) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Alert Not Found</h2>
          <p className="text-gray-600 mb-4">The alert you're looking for doesn't exist or you don't have permission to view it.</p>
          <Button onClick={() => router.back()}>Go Back</Button>
        </div>
      </div>
    )
  }

  let shapExplanation: ShapExplanation | null = null
  try {
    shapExplanation = alert.explanation_json ? JSON.parse(alert.explanation_json) : null
  } catch (error) {
    console.error('Error parsing SHAP explanation:', error)
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Alerts
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Alert Details</h1>
            <p className="text-sm text-gray-500">Alert ID: {alert.alert_id}</p>
          </div>
        </div>
        
        {alert.alert_status === 'PENDING' && hasRole(['ANALYST', 'ADMINISTRATOR']) && (
          <Button 
            onClick={handleAcknowledge}
            disabled={acknowledging}
          >
            {acknowledging ? 'Acknowledging...' : 'Acknowledge Alert'}
          </Button>
        )}
      </div>

      {/* Alert Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Alert Overview</span>
            <div className="flex space-x-2">
              <Badge variant={getSeverityColor(alert.alert_severity)}>
                {alert.alert_severity}
              </Badge>
              <Badge variant={getStatusColor(alert.alert_status)}>
                {alert.alert_status}
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-500">Anomaly Score</p>
              <p className="text-lg font-semibold">{alert.anomaly_score.toFixed(4)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-500">Detection Threshold</p>
              <p className="text-lg font-semibold">{alert.detection_threshold_applied.toFixed(4)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-500">Device ID</p>
              <p className="text-lg font-semibold">{alert.device_id}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-500">Created</p>
              <p className="text-lg font-semibold">
                {new Date(alert.created_at).toLocaleString()}
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-500">Inference Latency</p>
                <p className="text-sm">{alert.inference_latency_ms}ms</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Activity className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-500">Model ID</p>
                <p className="text-sm">{alert.model_id || 'N/A'}</p>
              </div>
            </div>
            {alert.acknowledged_by && (
              <div className="flex items-center space-x-2">
                <User className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-500">Acknowledged By</p>
                  <p className="text-sm">{alert.acknowledged_by}</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Detailed Analysis */}
      <Tabs defaultValue="explanation" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="explanation">AI Explanation</TabsTrigger>
          <TabsTrigger value="features">Feature Analysis</TabsTrigger>
          <TabsTrigger value="raw">Raw Data</TabsTrigger>
        </TabsList>

        <TabsContent value="explanation" className="space-y-4">
          {shapExplanation ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>SHAP Explanation Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p><strong>Explanation Type:</strong> {shapExplanation.explanation_type}</p>
                    <p><strong>Confidence Level:</strong> {(shapExplanation.summary.confidence_level * 100).toFixed(1)}%</p>
                    <p><strong>Main Factors:</strong></p>
                    <ul className="list-disc list-inside space-y-1">
                      {shapExplanation.summary.main_factors.map((factor: string, index: number) => (
                        <li key={index}>{factor}</li>
                      ))}
                    </ul>
                    <p><strong>Processing Time:</strong> {shapExplanation.summary.processing_time_ms}ms</p>
                  </div>
                </CardContent>
              </Card>

              {shapExplanation.features && shapExplanation.features.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Feature Attribution Chart</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ShapChart data={shapExplanation.features} />
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8">
                <div className="text-center text-gray-500">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4" />
                  <p>No explanation available for this alert</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="features" className="space-y-4">
          {shapExplanation?.features ? (
            <Card>
              <CardHeader>
                <CardTitle>Feature Contributions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {shapExplanation.features
                    .sort((a, b) => Math.abs(b.attribution_score) - Math.abs(a.attribution_score))
                    .map((feature, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <div className="flex-1">
                          <p className="font-medium">{feature.feature_name}</p>
                          <p className="text-sm text-gray-500">
                            Value: {feature.feature_value.toFixed(4)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`font-semibold ${
                            feature.contribution_type === 'positive' 
                              ? 'text-red-600' 
                              : 'text-green-600'
                          }`}>
                            {feature.contribution_type === 'positive' ? '+' : '-'}
                            {Math.abs(feature.attribution_score).toFixed(4)}
                          </p>
                          <p className="text-xs text-gray-500">Rank #{feature.rank}</p>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8">
                <div className="text-center text-gray-500">
                  <p>No feature analysis available</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="raw" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Raw Alert Data</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-900 text-gray-100 p-4 rounded overflow-x-auto">
                <pre className="text-sm">
                  {JSON.stringify(alert, null, 2)}
                </pre>
              </div>
            </CardContent>
          </Card>

          {shapExplanation && (
            <Card>
              <CardHeader>
                <CardTitle>Raw Explanation Data</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-gray-900 text-gray-100 p-4 rounded overflow-x-auto">
                  <pre className="text-sm">
                    {JSON.stringify(shapExplanation, null, 2)}
                  </pre>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
