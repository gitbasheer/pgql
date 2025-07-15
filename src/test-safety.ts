import { ConfidenceScorer } from './core/analyzer/ConfidenceScorer.js';
import { ProgressiveMigration } from './core/safety/ProgressiveMigration.js';
import { HealthCheckSystem } from './core/safety/HealthCheck.js';
import { GraphQLOperation, CodeChange } from './types/index.js';
import { parse } from 'graphql';

// Test the safety systems
async function testSafetySystems() {
  console.log('🧪 Testing Safety Systems\n');

  // Test 1: Confidence Scoring
  console.log('1️⃣ Testing Confidence Scorer...');
  const scorer = new ConfidenceScorer();
  
  const mockOperation: GraphQLOperation = {
    id: 'test-1',
    type: 'query',
    name: 'GetVentures',
    ast: parse('query GetVentures { ventures { id name } }'),
    source: 'query GetVentures { ventures { id name } }',
    file: '/src/queries/ventures.js',
    line: 10,
    column: 5,
    variables: [],
    fragments: [],
    directives: []
  };

  const mockChange: CodeChange = {
    file: mockOperation.file,
    operation: mockOperation,
    pattern: 'root-query-migration',
    oldQuery: 'query GetVentures { allVentures { id name } }',
    newQuery: 'query GetVentures { ventures { id name } }',
    transformations: [{
      type: 'field-rename',
      description: 'Renamed allVentures to ventures',
      from: 'allVentures',
      to: 'ventures',
      automated: true
    }]
  };

  const confidence = scorer.scoreTransformation(mockChange);
  console.log(`  Score: ${confidence.score}/100`);
  console.log(`  Category: ${confidence.category}`);
  console.log(`  Requires Review: ${confidence.requiresReview}`);
  console.log(`  Risks: ${confidence.risks.length === 0 ? 'None' : confidence.risks.join(', ')}\n`);

  // Test 2: Progressive Migration
  console.log('2️⃣ Testing Progressive Migration...');
  const progressive = new ProgressiveMigration();
  
  const flag = progressive.createFeatureFlag(mockOperation);
  console.log(`  Created flag: ${flag.name}`);
  
  await progressive.startRollout(mockOperation.id, 5);
  console.log(`  Started rollout at 5%`);
  
  const shouldUse = progressive.shouldUseMigratedQuery(mockOperation.id, { userId: 'user-123' });
  console.log(`  Should use migrated query: ${shouldUse}`);
  
  await progressive.increaseRollout(mockOperation.id, 20);
  const status = progressive.getRolloutStatus(mockOperation.id);
  console.log(`  Rollout status: ${status?.percentage}%\n`);

  // Test 3: Health Monitoring
  console.log('3️⃣ Testing Health Monitoring...');
  const health = new HealthCheckSystem();
  
  // Simulate some operations
  for (let i = 0; i < 150; i++) {
    if (Math.random() > 0.02) { // 98% success rate
      health.recordSuccess(mockOperation.id, Math.random() * 200 + 50);
    } else {
      health.recordError(mockOperation.id, new Error('Network timeout'), 2000);
    }
  }
  
  const healthStatus = await health.performHealthCheck(mockOperation);
  console.log(`  Status: ${healthStatus.status}`);
  console.log(`  Success Rate: ${(healthStatus.successRate * 100).toFixed(2)}%`);
  console.log(`  Error Rate: ${(healthStatus.errorRate * 100).toFixed(2)}%`);
  console.log(`  P99 Latency: ${healthStatus.latency.p99}ms`);
  
  if (healthStatus.issues.length > 0) {
    console.log('  Issues:');
    healthStatus.issues.forEach(issue => {
      console.log(`    - [${issue.severity}] ${issue.message}`);
    });
  }

  console.log('\n✅ All safety systems working correctly!');
}

// Run the test
testSafetySystems().catch(console.error);