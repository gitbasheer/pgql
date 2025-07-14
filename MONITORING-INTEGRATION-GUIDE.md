# Monitoring Integration Guide

This guide documents the integration points for monitoring dashboards and auto-update triggers in the pg-migration-620 system.

## Table of Contents

1. [Overview](#overview)
2. [Performance Monitoring](#performance-monitoring)
3. [Real-time Dashboard Integration](#real-time-dashboard-integration)
4. [CI/CD Integration](#cicd-integration)
5. [Webhook Support](#webhook-support)
6. [Auto-Update Triggers](#auto-update-triggers)
7. [External Monitoring Integration](#external-monitoring-integration)
8. [API Endpoints](#api-endpoints)

## Overview

The pg-migration-620 system provides multiple integration points for monitoring and automation:

- **Performance Monitoring**: Built-in performance tracking with EventEmitter-based notifications
- **HTTP API Server**: REST API for triggering migrations and retrieving results
- **MCP Server**: Model Context Protocol server for AI-driven integrations
- **Event-based Architecture**: Real-time notifications for monitoring systems
- **Report Generation**: Multiple output formats (HTML, JSON, CSV, Markdown)

## Performance Monitoring

### Core Performance Monitor

The system includes a comprehensive performance monitoring system (`src/core/monitoring/PerformanceMonitor.ts`) that tracks:

- Operation execution times
- Memory usage
- Cache performance
- Performance trends over time

#### Key Features:

1. **Real-time Event Emission**
   ```typescript
   // Events emitted:
   - 'operation:start' - When an operation begins
   - 'operation:end' - When an operation completes
   - 'threshold:exceeded' - When performance thresholds are exceeded
   ```

2. **Performance Metrics**
   - Operation duration tracking
   - Memory usage monitoring
   - Cache hit rates
   - Performance trend analysis

3. **Dashboard Data Access**
   ```typescript
   const dashboardData = performanceMonitor.getDashboardData();
   // Returns real-time metrics for dashboard consumption
   ```

### Integration with External Monitoring

#### Prometheus/Grafana Integration

```javascript
// Example integration endpoint
app.get('/metrics', (req, res) => {
  const metrics = performanceMonitor.getDashboardData();
  
  // Convert to Prometheus format
  const promMetrics = `
# HELP pg_migration_operations_total Total operations processed
# TYPE pg_migration_operations_total counter
pg_migration_operations_total ${metrics.operations.total}

# HELP pg_migration_operations_running Current running operations
# TYPE pg_migration_operations_running gauge
pg_migration_operations_running ${metrics.operations.running}

# HELP pg_migration_cache_hit_rate Cache hit rate
# TYPE pg_migration_cache_hit_rate gauge
pg_migration_cache_hit_rate{cache="ast"} ${metrics.cache.ast.hitRate}
pg_migration_cache_hit_rate{cache="validation"} ${metrics.cache.validation.hitRate}
pg_migration_cache_hit_rate{cache="transform"} ${metrics.cache.transform.hitRate}
`;
  
  res.set('Content-Type', 'text/plain');
  res.send(promMetrics);
});
```

#### DataDog Integration

```javascript
// Example DataDog integration
const StatsD = require('node-dogstatsd').StatsD;
const dogstatsd = new StatsD();

performanceMonitor.on('operation:end', ({ operationId, metrics }) => {
  // Send metrics to DataDog
  dogstatsd.histogram('pg_migration.operation.duration', metrics.duration, [`operation:${metrics.name}`]);
  dogstatsd.gauge('pg_migration.operation.memory', metrics.memory.delta, [`operation:${metrics.name}`]);
});

performanceMonitor.on('threshold:exceeded', ({ type, level, metrics }) => {
  // Alert on threshold violations
  dogstatsd.event(`Performance threshold exceeded: ${metrics.name}`, {
    alert_type: level,
    tags: [`type:${type}`, `operation:${metrics.name}`]
  });
});
```

## Real-time Dashboard Integration

### UI Server API

The system includes a UI server (`ui-server.js`) that provides:

1. **Server-Sent Events (SSE) for Real-time Updates**
   ```javascript
   POST /api/execute
   // Streams real-time command execution output
   ```

2. **Results API**
   ```javascript
   GET /api/results/{filename}
   // Retrieves migration results
   ```

### WebSocket Integration

For real-time monitoring dashboards:

```javascript
// Example WebSocket server integration
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

// Broadcast performance metrics
performanceMonitor.on('operation:end', (data) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'performance-update',
        data: performanceMonitor.getDashboardData()
      }));
    }
  });
});
```

## CI/CD Integration

### GitHub Actions Integration

The system integrates with GitHub via the `GitHubService`:

```yaml
# Example GitHub Action workflow
name: GraphQL Migration
on:
  schedule:
    - cron: '0 0 * * 0' # Weekly
  workflow_dispatch:

jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Run Migration Pipeline
        run: |
          npm run migrate -- \
            --source src \
            --schema schema.graphql \
            --auto-apply \
            --confidence-threshold 90
      
      - name: Export Performance Metrics
        run: |
          npm run export-metrics
          
      - name: Upload Metrics to Dashboard
        run: |
          curl -X POST https://your-dashboard.com/api/metrics \
            -H "Authorization: Bearer ${{ secrets.DASHBOARD_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d @.performance/performance-latest.json
```

### Jenkins Integration

```groovy
pipeline {
    agent any
    
    triggers {
        // Trigger on schema changes
        pollSCM('H/5 * * * *')
    }
    
    stages {
        stage('Migration Check') {
            steps {
                script {
                    def result = sh(
                        script: 'npm run assess-impact',
                        returnStdout: true
                    )
                    
                    // Send to monitoring dashboard
                    httpRequest(
                        url: "${DASHBOARD_URL}/api/migration-assessment",
                        httpMode: 'POST',
                        contentType: 'APPLICATION_JSON',
                        requestBody: result
                    )
                }
            }
        }
    }
}
```

## Webhook Support

### Implementing Webhook Notifications

```javascript
// Example webhook integration
const axios = require('axios');

class WebhookNotifier {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl;
    this.setupListeners();
  }
  
  setupListeners() {
    // Notify on migration completion
    performanceMonitor.on('operation:end', async (data) => {
      if (data.metrics.name === 'migration-pipeline') {
        await this.notify({
          event: 'migration.completed',
          data: {
            duration: data.metrics.duration,
            status: data.metrics.status,
            summary: performanceMonitor.getDashboardData()
          }
        });
      }
    });
    
    // Notify on performance issues
    performanceMonitor.on('threshold:exceeded', async (data) => {
      await this.notify({
        event: 'performance.threshold.exceeded',
        severity: data.level,
        details: data
      });
    });
  }
  
  async notify(payload) {
    try {
      await axios.post(this.webhookUrl, {
        timestamp: new Date().toISOString(),
        source: 'pg-migration-620',
        ...payload
      });
    } catch (error) {
      console.error('Webhook notification failed:', error);
    }
  }
}
```

## Auto-Update Triggers

### Schema Change Detection

```javascript
// Example schema watcher
const chokidar = require('chokidar');
const { exec } = require('child_process');

class SchemaWatcher {
  constructor(schemaPath) {
    this.watcher = chokidar.watch(schemaPath, {
      persistent: true,
      ignoreInitial: true
    });
    
    this.setupWatcher();
  }
  
  setupWatcher() {
    this.watcher.on('change', async (path) => {
      console.log(`Schema changed: ${path}`);
      
      // Assess migration impact
      exec('npm run assess-impact', (error, stdout) => {
        if (!error) {
          const impact = JSON.parse(stdout);
          
          // Auto-trigger migration if low risk
          if (impact.risk === 'low' && impact.confidence > 90) {
            exec('npm run migrate -- --auto-apply', (error) => {
              if (!error) {
                this.notifyDashboard('auto-migration.completed');
              }
            });
          } else {
            this.notifyDashboard('manual-review.required', impact);
          }
        }
      });
    });
  }
  
  notifyDashboard(event, data) {
    // Send to monitoring dashboard
    fetch(`${process.env.DASHBOARD_URL}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, data, timestamp: new Date() })
    });
  }
}
```

### Git Hook Integration

```bash
#!/bin/bash
# .git/hooks/post-merge

# Check if schema files changed
if git diff HEAD^ HEAD --name-only | grep -q "schema.graphql"; then
  echo "Schema changes detected, running migration assessment..."
  
  # Run assessment
  npm run assess-impact > migration-assessment.json
  
  # Send to monitoring dashboard
  curl -X POST "${DASHBOARD_URL}/api/schema-change" \
    -H "Content-Type: application/json" \
    -d @migration-assessment.json
fi
```

## External Monitoring Integration

### Slack Integration

```javascript
const { WebClient } = require('@slack/web-api');
const slack = new WebClient(process.env.SLACK_TOKEN);

// Notify on migration events
performanceMonitor.on('operation:end', async (data) => {
  if (data.metrics.name === 'migration-pipeline') {
    await slack.chat.postMessage({
      channel: '#migrations',
      text: `Migration completed in ${data.metrics.duration}ms`,
      attachments: [{
        color: data.metrics.status === 'completed' ? 'good' : 'danger',
        fields: [
          { title: 'Duration', value: `${data.metrics.duration}ms`, short: true },
          { title: 'Memory Used', value: `${(data.metrics.memory.delta / 1024 / 1024).toFixed(2)}MB`, short: true }
        ]
      }]
    });
  }
});
```

### PagerDuty Integration

```javascript
const pdClient = require('node-pagerduty');
const pd = new pdClient(process.env.PAGERDUTY_TOKEN);

performanceMonitor.on('threshold:exceeded', async ({ type, level, metrics }) => {
  if (level === 'error') {
    await pd.incidents.createIncident({
      incident: {
        type: 'incident',
        title: `Performance threshold exceeded: ${metrics.name}`,
        service: { id: process.env.PAGERDUTY_SERVICE_ID },
        urgency: 'high',
        body: {
          type: 'incident_body',
          details: JSON.stringify({ type, metrics })
        }
      }
    });
  }
});
```

## API Endpoints

### REST API for External Integration

```javascript
const express = require('express');
const app = express();

// Performance metrics endpoint
app.get('/api/metrics', (req, res) => {
  res.json(performanceMonitor.getDashboardData());
});

// Migration status endpoint
app.get('/api/migration/status', (req, res) => {
  res.json({
    running: performanceMonitor.getDashboardData().operations.running > 0,
    lastRun: getLastMigrationRun(),
    stats: getMigrationStats()
  });
});

// Trigger migration endpoint
app.post('/api/migration/trigger', async (req, res) => {
  const { source, schema, dryRun } = req.body;
  
  // Start migration with monitoring
  const operationId = performanceMonitor.startOperation('api-migration', { source, schema });
  
  try {
    const result = await runMigration({ source, schema, dryRun });
    performanceMonitor.endOperation(operationId);
    res.json({ success: true, result });
  } catch (error) {
    performanceMonitor.endOperation(operationId, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const metrics = performanceMonitor.getDashboardData();
  const healthy = metrics.operations.running < 10 && // Not overloaded
                 metrics.cache.ast.hitRate > 0.5;     // Cache working
  
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'degraded',
    metrics: {
      runningOperations: metrics.operations.running,
      cacheHitRates: {
        ast: metrics.cache.ast.hitRate,
        validation: metrics.cache.validation.hitRate,
        transform: metrics.cache.transform.hitRate
      }
    }
  });
});
```

### GraphQL API for Monitoring

```graphql
type Query {
  migrationStatus: MigrationStatus!
  performanceMetrics: PerformanceMetrics!
  migrationHistory(limit: Int = 10): [MigrationRun!]!
}

type Mutation {
  triggerMigration(input: MigrationInput!): MigrationResult!
}

type Subscription {
  migrationProgress(runId: ID!): MigrationProgress!
  performanceUpdates: PerformanceMetrics!
}
```

## Best Practices

1. **Use Event-Driven Architecture**: Subscribe to performance monitor events for real-time updates
2. **Implement Circuit Breakers**: Prevent cascade failures in monitoring integrations
3. **Rate Limit Notifications**: Avoid overwhelming external systems
4. **Secure Webhooks**: Use HMAC signatures for webhook authentication
5. **Monitor the Monitors**: Track the health of monitoring integrations
6. **Use Structured Logging**: Ensure logs are parseable by monitoring systems
7. **Implement Graceful Degradation**: Continue migrations even if monitoring fails

## Example Integration

Here's a complete example of integrating with a monitoring dashboard:

```javascript
const { PerformanceMonitor } = require('./src/core/monitoring/PerformanceMonitor');
const express = require('express');
const WebSocket = require('ws');

class MonitoringDashboardIntegration {
  constructor() {
    this.app = express();
    this.wss = new WebSocket.Server({ port: 8080 });
    this.performanceMonitor = new PerformanceMonitor();
    
    this.setupAPI();
    this.setupWebSocket();
    this.setupEventHandlers();
  }
  
  setupAPI() {
    // Metrics endpoint for Prometheus
    this.app.get('/metrics', (req, res) => {
      const metrics = this.performanceMonitor.getDashboardData();
      res.set('Content-Type', 'text/plain');
      res.send(this.formatPrometheusMetrics(metrics));
    });
    
    // JSON API for custom dashboards
    this.app.get('/api/dashboard', (req, res) => {
      res.json({
        metrics: this.performanceMonitor.getDashboardData(),
        trends: Array.from(this.performanceMonitor.calculateTrends().values()),
        report: this.performanceMonitor.generateReport()
      });
    });
  }
  
  setupWebSocket() {
    this.wss.on('connection', (ws) => {
      // Send initial state
      ws.send(JSON.stringify({
        type: 'initial',
        data: this.performanceMonitor.getDashboardData()
      }));
      
      // Setup ping/pong for connection health
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });
    });
    
    // Health check interval
    setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);
  }
  
  setupEventHandlers() {
    // Real-time updates via WebSocket
    this.performanceMonitor.on('operation:end', (data) => {
      this.broadcast({
        type: 'operation-complete',
        data: {
          operation: data.metrics.name,
          duration: data.metrics.duration,
          timestamp: new Date()
        }
      });
    });
    
    // Alert on threshold violations
    this.performanceMonitor.on('threshold:exceeded', (data) => {
      this.broadcast({
        type: 'alert',
        severity: data.level,
        data: data
      });
      
      // Also send to external alerting
      this.sendAlert(data);
    });
  }
  
  broadcast(message) {
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }
  
  formatPrometheusMetrics(metrics) {
    // Convert to Prometheus exposition format
    return `
# HELP pg_migration_operations_total Total operations
# TYPE pg_migration_operations_total counter
pg_migration_operations_total ${metrics.operations.total}

# HELP pg_migration_operations_running Running operations
# TYPE pg_migration_operations_running gauge
pg_migration_operations_running ${metrics.operations.running}

# HELP pg_migration_cache_hit_rate Cache hit rate by type
# TYPE pg_migration_cache_hit_rate gauge
pg_migration_cache_hit_rate{type="ast"} ${metrics.cache.ast.hitRate}
pg_migration_cache_hit_rate{type="validation"} ${metrics.cache.validation.hitRate}
pg_migration_cache_hit_rate{type="transform"} ${metrics.cache.transform.hitRate}
`;
  }
  
  async sendAlert(alertData) {
    // Send to multiple alert channels
    await Promise.all([
      this.sendToSlack(alertData),
      this.sendToPagerDuty(alertData),
      this.sendToWebhook(alertData)
    ]).catch(console.error);
  }
}

// Start the integration
const integration = new MonitoringDashboardIntegration();
integration.app.listen(3000, () => {
  console.log('Monitoring API listening on port 3000');
});
```

## Conclusion

The pg-migration-620 system provides comprehensive integration points for monitoring and automation:

- Event-driven architecture for real-time monitoring
- Multiple API formats (REST, GraphQL, WebSocket)
- Built-in performance tracking and reporting
- Support for popular monitoring platforms
- Extensible webhook system
- CI/CD integration capabilities

These integration points enable seamless connection with existing monitoring infrastructure and automation systems, providing full visibility into the migration process and enabling automated workflows based on migration events.