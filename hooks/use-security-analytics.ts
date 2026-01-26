"use client";

import { useQuery, useMutation } from "convex/react";
import { useCallback, useMemo, useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";

// Types
interface SecurityMetrics {
  accessPatterns: {
    hourlyAccess: Record<string, number>;
    dailyAccess: Record<string, number>;
    resourcePopularity: Record<string, number>;
    userActivity: Record<string, number>;
  };
  performance: {
    avgPermissionCheckTime: number;
    cacheHitRate: number;
    slowQueries: number;
    errorRate: number;
  };
  security: {
    failedAttempts: number;
    suspiciousActivities: number;
    blockedIPs: string[];
    anomalyScore: number;
  };
  trends: {
    accessGrowth: number;
    securityIncidents: number;
    systemHealth: "excellent" | "good" | "warning" | "critical";
  };
}

interface AnomalyDetection {
  type: "unusual_access" | "permission_escalation" | "bulk_operations" | "time_anomaly";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  affectedUsers: string[];
  affectedResources: string[];
  timestamp: number;
  confidence: number;
}

interface SecurityReport {
  period: {
    startDate: number;
    endDate: number;
  };
  summary: {
    totalEvents: number;
    criticalEvents: number;
    uniqueUsers: number;
    resourcesAccessed: number;
  };
  insights: {
    mostActiveUsers: Array<{ email: string; eventCount: number }>;
    mostAccessedResources: Array<{ resourceId: string; accessCount: number }>;
    securityHighlights: string[];
    recommendations: string[];
  };
  anomalies: AnomalyDetection[];
}

/**
 * Hook for security analytics and insights
 */
export function useSecurityAnalytics(timeRange?: {
  startDate: number;
  endDate: number;
}) {
  const { userId } = useAuth();
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Mock analytics data - in real implementation, these would be actual Convex queries
  const mockMetrics: SecurityMetrics = {
    accessPatterns: {
      hourlyAccess: {},
      dailyAccess: {},
      resourcePopularity: {},
      userActivity: {}
    },
    performance: {
      avgPermissionCheckTime: 45,
      cacheHitRate: 92.3,
      slowQueries: 12,
      errorRate: 0.02
    },
    security: {
      failedAttempts: 23,
      suspiciousActivities: 3,
      blockedIPs: ["192.168.1.100"],
      anomalyScore: 15
    },
    trends: {
      accessGrowth: 12.5,
      securityIncidents: 2,
      systemHealth: "good"
    }
  };

  const analytics = useMemo(() => mockMetrics, [timeRange]);

  /**
   * Generate security score based on various metrics
   */
  const securityScore = useMemo(() => {
    const baseScore = 100;
    let deductions = 0;

    // Deduct points for security issues
    deductions += analytics.security.suspiciousActivities * 5;
    deductions += analytics.security.failedAttempts * 0.5;
    deductions += analytics.security.anomalyScore * 0.3;
    
    // Deduct points for performance issues
    if (analytics.performance.cacheHitRate < 90) {
      deductions += (90 - analytics.performance.cacheHitRate) * 2;
    }
    
    if (analytics.performance.errorRate > 0.01) {
      deductions += analytics.performance.errorRate * 1000;
    }

    return Math.max(0, Math.min(100, baseScore - deductions));
  }, [analytics]);

  /**
   * Get security grade based on score
   */
  const securityGrade = useMemo(() => {
    if (securityScore >= 95) return { grade: "A+", color: "green" };
    if (securityScore >= 90) return { grade: "A", color: "green" };
    if (securityScore >= 85) return { grade: "B+", color: "blue" };
    if (securityScore >= 80) return { grade: "B", color: "blue" };
    if (securityScore >= 70) return { grade: "C", color: "yellow" };
    if (securityScore >= 60) return { grade: "D", color: "orange" };
    return { grade: "F", color: "red" };
  }, [securityScore]);

  /**
   * Generate automated insights
   */
  const insights = useMemo(() => {
    const insights: string[] = [];

    if (analytics.performance.cacheHitRate < 85) {
      insights.push("Cache hit rate is below optimal. Consider adjusting cache TTL or preloading strategies.");
    }

    if (analytics.security.suspiciousActivities > 5) {
      insights.push("Elevated suspicious activity detected. Review security logs for potential threats.");
    }

    if (analytics.performance.avgPermissionCheckTime > 100) {
      insights.push("Permission checks are slower than recommended. Database optimization may be needed.");
    }

    if (analytics.security.failedAttempts > 50) {
      insights.push("High number of failed access attempts. Consider implementing rate limiting.");
    }

    if (analytics.trends.accessGrowth > 20) {
      insights.push("Significant access growth detected. Ensure system scaling is adequate.");
    }

    return insights;
  }, [analytics]);

  return {
    analytics,
    securityScore,
    securityGrade,
    insights,
    isLoading: false, // Would be actual loading state
    error: null
  };
}

/**
 * Hook for anomaly detection
 */
export function useAnomalyDetection() {
  const [anomalies, setAnomalies] = useState<AnomalyDetection[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);

  // Mock anomaly detection
  const mockAnomalies: AnomalyDetection[] = [
    {
      type: "unusual_access",
      severity: "medium",
      description: "User accessing resources outside normal hours",
      affectedUsers: ["user@example.com"],
      affectedResources: ["board_123"],
      timestamp: Date.now() - 3600000,
      confidence: 0.78
    },
    {
      type: "bulk_operations",
      severity: "high", 
      description: "Unusual bulk permission changes detected",
      affectedUsers: ["admin@example.com"],
      affectedResources: ["board_456", "board_789"],
      timestamp: Date.now() - 7200000,
      confidence: 0.92
    }
  ];

  useEffect(() => {
    // Simulate real-time anomaly detection
    setAnomalies(mockAnomalies);
  }, []);

  const runAnomalyDetection = useCallback(async () => {
    setIsDetecting(true);
    
    // Simulate analysis
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // In real implementation, this would call backend analysis
    setAnomalies(mockAnomalies);
    setIsDetecting(false);
  }, []);

  const dismissAnomaly = useCallback((anomalyId: string) => {
    setAnomalies(prev => prev.filter((_, index) => index.toString() !== anomalyId));
  }, []);

  return {
    anomalies,
    isDetecting,
    runAnomalyDetection,
    dismissAnomaly
  };
}

/**
 * Hook for generating security reports
 */
export function useSecurityReports() {
  const [isGenerating, setIsGenerating] = useState(false);
  
  const generateReport = useCallback(async (
    timeRange: { startDate: number; endDate: number },
    options?: {
      includeDetailed?: boolean;
      includeRecommendations?: boolean;
      format?: "json" | "pdf" | "csv";
    }
  ): Promise<SecurityReport> => {
    setIsGenerating(true);
    
    // Simulate report generation
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const mockReport: SecurityReport = {
      period: timeRange,
      summary: {
        totalEvents: 15420,
        criticalEvents: 30,
        uniqueUsers: 247,
        resourcesAccessed: 1250
      },
      insights: {
        mostActiveUsers: [
          { email: "alice@company.com", eventCount: 1250 },
          { email: "bob@company.com", eventCount: 890 },
          { email: "charlie@company.com", eventCount: 654 }
        ],
        mostAccessedResources: [
          { resourceId: "board_popular", accessCount: 2340 },
          { resourceId: "board_shared", accessCount: 1890 },
          { resourceId: "todo_important", accessCount: 1456 }
        ],
        securityHighlights: [
          "99.8% of access attempts were legitimate",
          "Average permission check time: 45ms",
          "3 suspicious activities detected and mitigated",
          "Cache hit rate improved by 5% this period"
        ],
        recommendations: [
          "Consider implementing additional rate limiting for high-activity users",
          "Review permissions for resources with unusual access patterns",
          "Update security policies to reflect current usage patterns",
          "Implement additional monitoring for bulk operations"
        ]
      },
      anomalies: [
        {
          type: "permission_escalation",
          severity: "high",
          description: "Rapid permission changes detected",
          affectedUsers: ["admin@company.com"],
          affectedResources: ["board_123", "board_456"],
          timestamp: timeRange.endDate - 86400000,
          confidence: 0.87
        }
      ]
    };
    
    setIsGenerating(false);
    return mockReport;
  }, []);

  const exportReport = useCallback(async (
    report: SecurityReport,
    format: "json" | "pdf" | "csv" = "json"
  ) => {
    // In real implementation, this would handle different export formats
    if (format === "json") {
      const dataStr = JSON.stringify(report, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement("a");
      link.href = url;
      link.download = `security-report-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }, []);

  return {
    generateReport,
    exportReport,
    isGenerating
  };
}

/**
 * Hook for real-time security monitoring
 */
export function useSecurityMonitoring() {
  const [alerts, setAlerts] = useState<Array<{
    id: string;
    type: "security" | "performance" | "anomaly";
    severity: "low" | "medium" | "high" | "critical";
    message: string;
    timestamp: number;
    acknowledged: boolean;
  }>>([]);

  // Simulate real-time alerts
  useEffect(() => {
    const interval = setInterval(() => {
      // Randomly generate alerts for demo
      if (Math.random() < 0.1) { // 10% chance every interval
        const newAlert = {
          id: Date.now().toString(),
          type: Math.random() < 0.5 ? "security" : "performance" as const,
          severity: ["low", "medium", "high"][Math.floor(Math.random() * 3)] as const,
          message: "Sample security alert detected",
          timestamp: Date.now(),
          acknowledged: false
        };
        
        setAlerts(prev => [newAlert, ...prev.slice(0, 9)]); // Keep last 10
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const acknowledgeAlert = useCallback((alertId: string) => {
    setAlerts(prev => prev.map(alert => 
      alert.id === alertId ? { ...alert, acknowledged: true } : alert
    ));
  }, []);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  const unacknowledgedAlerts = useMemo(() => 
    alerts.filter(alert => !alert.acknowledged), [alerts]
  );

  return {
    alerts,
    unacknowledgedAlerts,
    acknowledgeAlert,
    clearAlerts
  };
}

/**
 * Hook for performance metrics and optimization
 */
export function usePerformanceMetrics() {
  const [metrics, setMetrics] = useState({
    avgResponseTime: 45,
    cacheHitRate: 92.3,
    errorRate: 0.02,
    throughput: 1250, // requests per minute
    activeConnections: 156
  });

  const [optimizationSuggestions, setOptimizationSuggestions] = useState<string[]>([]);

  // Simulate performance monitoring
  useEffect(() => {
    const suggestions: string[] = [];
    
    if (metrics.cacheHitRate < 90) {
      suggestions.push("Consider increasing cache TTL for frequently accessed resources");
    }
    
    if (metrics.avgResponseTime > 100) {
      suggestions.push("Database query optimization recommended");
    }
    
    if (metrics.errorRate > 0.01) {
      suggestions.push("Investigate error patterns and implement better error handling");
    }
    
    setOptimizationSuggestions(suggestions);
  }, [metrics]);

  const refreshMetrics = useCallback(() => {
    // Simulate metric updates
    setMetrics(prev => ({
      ...prev,
      avgResponseTime: prev.avgResponseTime + (Math.random() - 0.5) * 10,
      cacheHitRate: Math.min(100, prev.cacheHitRate + (Math.random() - 0.5) * 2),
      activeConnections: Math.max(0, prev.activeConnections + Math.floor((Math.random() - 0.5) * 20))
    }));
  }, []);

  return {
    metrics,
    optimizationSuggestions,
    refreshMetrics
  };
} 