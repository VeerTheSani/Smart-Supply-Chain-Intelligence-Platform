/**
 * ========================================
 * EVENT NOTIFICATION SERVICE
 * ========================================
 * Centralizes all event notifications:
 * - Shipment CRUD operations
 * - Risk alerts
 * - Auto-reroute execution
 * - Cascading failures
 * - GPS issues
 */

import { useAlertStore } from '../stores/alertStore';

export const createEventNotification = (eventType, data) => {
  const store = useAlertStore.getState();

  const notifications = {
    // SHIPMENT CREATED
    shipment_created: () => ({
      type: 'shipment_created',
      severity: 'low',
      source: 'REAL_SYSTEM',
      timestamp: new Date().toISOString(),
      title: '📦 Shipment Created',
      message: `New shipment "${data.name}" from ${data.origin} to ${data.destination}`,
      shipment_id: data.id,
      shipment_name: data.name,
      icon: 'box',
    }),

    // SHIPMENT DELETED
    shipment_deleted: () => ({
      type: 'shipment_deleted',
      severity: 'medium',
      source: 'REAL_SYSTEM',
      timestamp: new Date().toISOString(),
      title: '🗑️ Shipment Deleted',
      message: `Shipment "${data.name}" has been removed from tracking`,
      shipment_id: data.id,
      shipment_name: data.name,
      icon: 'trash',
    }),

    // HIGH RISK DETECTED
    high_risk_alert: () => ({
      type: 'high_risk_alert',
      severity: 'high',
      source: 'REAL_SYSTEM',
      timestamp: new Date().toISOString(),
      title: '⚠️ High Risk Detected',
      message: `${data.shipment_name} (${data.shipment_id?.slice(-6)}): Risk Level ${data.level}`,
      reason: data.reason || 'Multiple risk factors detected',
      factors: data.factors || [],
      shipment_id: data.shipment_id,
      shipment_name: data.shipment_name,
      score: data.score,
      level: data.level,
      icon: 'alert',
    }),

    // AUTO-REROUTE EXECUTED (Rich Notification)
    reroute_executed: () => ({
      type: 'reroute_executed',
      severity: 'medium',
      source: 'REAL_SYSTEM',
      timestamp: new Date().toISOString(),
      title: '🛣️ Auto-Reroute Executed',
      message: `${data.shipment_name} rerouted from original route`,
      shipment_id: data.shipment_id,
      shipment_name: data.shipment_name,
      reason: data.reason || 'Optimal route adjustment',
      original_eta: data.original_eta,
      new_eta: data.new_eta,
      eta_change: data.eta_change,
      original_route: data.original_route,
      new_route: data.new_route,
      cost_impact: data.cost_impact,
      distance_change: data.distance_change,
      icon: 'truck',
    }),

    // CRITICAL RISK (CRITICAL SEVERITY)
    critical_risk: () => ({
      type: 'critical_risk',
      severity: 'critical',
      source: 'REAL_SYSTEM',
      timestamp: new Date().toISOString(),
      title: '🚨 CRITICAL RISK',
      message: `CRITICAL: ${data.shipment_name} requires immediate action`,
      shipment_id: data.shipment_id,
      shipment_name: data.shipment_name,
      reason: data.reason,
      recommendation: data.recommendation,
      icon: 'alert-critical',
    }),

    // CASCADE ALERT
    cascade_alert: () => ({
      type: 'cascade_alert',
      severity: 'high',
      source: 'REAL_SYSTEM',
      timestamp: new Date().toISOString(),
      title: '🔗 Cascade Alert',
      message: `${data.shipment_name} delayed due to upstream shipment`,
      shipment_id: data.shipment_id,
      shipment_name: data.shipment_name,
      upstream_id: data.upstream_id,
      upstream_name: data.upstream_name,
      delay_minutes: data.delay_minutes,
      icon: 'link',
    }),

    // GPS STUCK
    gps_stuck: () => ({
      type: 'gps_stuck',
      severity: 'high',
      source: 'REAL_SYSTEM',
      timestamp: new Date().toISOString(),
      title: '📍 GPS Signal Lost',
      message: `${data.shipment_name} GPS has been stationary for ${data.duration_minutes} minutes`,
      shipment_id: data.shipment_id,
      shipment_name: data.shipment_name,
      last_location: data.last_location,
      duration_minutes: data.duration_minutes,
      icon: 'map-pin',
    }),

    // API FAILURE
    api_failure: () => ({
      type: 'api_failure',
      severity: 'medium',
      source: 'REAL_SYSTEM',
      timestamp: new Date().toISOString(),
      title: '⚡ Service Unavailable',
      message: `${data.service_name} API is temporarily unavailable`,
      service_name: data.service_name,
      error_code: data.error_code,
      icon: 'server',
    }),

    // SIMULATOR SCENARIO
    simulator_scenario: () => ({
      type: 'simulator_scenario',
      severity: 'low',
      source: 'SIMULATOR',
      timestamp: new Date().toISOString(),
      title: '🧪 Scenario Triggered',
      message: `Scenario "${data.scenario_name}" activated for testing`,
      scenario_name: data.scenario_name,
      scenario_id: data.scenario_id,
      description: data.description,
      icon: 'flask',
    }),
  };

  const notification = notifications[eventType]?.();

  if (notification) {
    store.addAlert(notification);
    return notification;
  }

  console.warn(`Unknown event type: ${eventType}`);
  return null;
};

export default createEventNotification;
