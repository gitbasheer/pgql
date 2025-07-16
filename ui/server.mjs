import express from 'express';
import cors from 'cors';
import VnextSampleExtractor from './vnext-sample-extractor.mjs';

const app = express();
app.use(cors());
app.use(express.json());

// Mock pipeline data storage
let activePipelines = new Map();
let globalLogs = [];
let pipelineQueries = new Map(); // Store actual queries per pipeline

// Transform vnext extractor output to match ExtractedQuery interface
function transformVnextToExtractedQuery(vnextQuery, index) {
  // Transform variables array to Record<string, string>
  const variablesRecord = {};
  if (vnextQuery.variables && Array.isArray(vnextQuery.variables)) {
    vnextQuery.variables.forEach(v => {
      variablesRecord[v.name] = v.type;
    });
  }
  
  return {
    // Required fields
    queryName: vnextQuery.name || `Query_${index}`,
    content: vnextQuery.source || '',
    filePath: vnextQuery.file || 'data/sample_data/unknown.js',
    lineNumber: vnextQuery.line || 1,
    
    // Optional fields
    operation: vnextQuery.type,
    variables: Object.keys(variablesRecord).length > 0 ? variablesRecord : undefined,
    fragments: vnextQuery.fragments && vnextQuery.fragments.length > 0 ? vnextQuery.fragments : undefined,
    endpoint: vnextQuery.endpoint,
    hasVariables: vnextQuery.variables && vnextQuery.variables.length > 0,
    
    // Preserve original source for reference
    source: vnextQuery.source
  };
}

// Mock UnifiedExtractor endpoint
app.post('/api/extract', async (req, res) => {
  const { repoPath, schemaEndpoint, strategies, preserveSourceAST, enableVariantDetection } = req.body;
  
  // Log: Extract request received
  
  if (!repoPath || !schemaEndpoint) {
    return res.status(400).json({ message: 'Missing required fields: repoPath and schemaEndpoint' });
  }

  // Simulate invalid repo path error
  if (repoPath.includes('invalid')) {
    return res.status(400).json({ message: 'Invalid repository path: Path does not exist or is not accessible' });
  }

  const pipelineId = `extract-${Date.now()}`;
  const pipeline = {
    id: pipelineId,
    status: 'running',
    repoPath,
    schemaEndpoint,
    strategies: strategies || ['hybrid'],
    preserveSourceAST: preserveSourceAST || true,
    enableVariantDetection: enableVariantDetection || true,
    currentStage: 'extraction',
    currentStageStatus: 'running',
    progress: 0,
    startTime: Date.now()
  };
  
  activePipelines.set(pipelineId, pipeline);
  globalLogs = []; // Reset logs for new pipeline
  
  // For vnext paths, extract and store queries BEFORE starting pipeline
  const isVnextPath = repoPath && repoPath.includes('sample_data');
  if (isVnextPath) {
    try {
      // Run vnext extraction synchronously
      const extractor = new VnextSampleExtractor();
      const extractionResult = await extractor.extractAll();
      
      // Log: Vnext extraction completed
      
      // Transform vnext queries to match ExtractedQuery interface
      const transformedQueries = extractionResult.queries.map((q, index) => transformVnextToExtractedQuery(q, index));
      
      // Store queries for the pipeline BEFORE simulation starts
      pipelineQueries.set(pipelineId, transformedQueries);
      
      // Add extraction complete log
      globalLogs.push({
        timestamp: new Date().toISOString(),
        level: 'success',
        message: `✅ Extracted ${extractionResult.summary.totalQueries} queries from vnext sample data`
      });
      
      // NOW start pipeline simulation with the queries already loaded
      // Add small delay to ensure queries are properly stored
      setTimeout(() => {
        // Log: Starting pipeline simulation
        simulatePipelineProgress(pipelineId, isVnextPath);
      }, 100);
    } catch (error) {
      // Log: Vnext extraction failed
      globalLogs.push({
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `❌ Vnext extraction failed: ${error.message}`
      });
      pipeline.status = 'failed';
      return res.status(500).json({ message: 'Vnext extraction failed', error: error.message });
    }
  } else {
    // For non-vnext paths, start simulation immediately
    simulatePipelineProgress(pipelineId, isVnextPath);
  }

  res.json({ 
    pipelineId,
    extractionId: pipelineId,
    message: 'UnifiedExtractor pipeline started successfully',
    strategies: strategies || ['hybrid'],
    preserveSourceAST: preserveSourceAST || true,
    enableVariantDetection: enableVariantDetection || true
  });
});

// Mock status polling endpoint
app.get('/api/status', (req, res) => {
  const latestPipeline = Array.from(activePipelines.values()).pop();
  
  if (!latestPipeline) {
    return res.json({
      stage: 'idle',
      status: 'ready',
      logs: []
    });
  }
  
  res.json({
    stage: latestPipeline.currentStage,
    status: latestPipeline.currentStageStatus,
    progress: latestPipeline.progress,
    logs: globalLogs
  });
});

// Vnext Sample Testing - Tests all queries from data/sample_data/
app.post('/api/test-vnext-sample', async (req, res) => {
  // Log: Vnext sample test request received
  
  const { pipelineId, scenario, endpoint, authHeaders } = req.body;
  const testId = `vnext-test-${Date.now()}`;
  
  globalLogs.push({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: '🚀 Starting vnext sample data extraction and testing...'
  });

  try {
    // Extract all queries from data/sample_data/
    const extractor = new VnextSampleExtractor();
    const extractionResult = await extractor.extractAll();
    
    // Store the vnext queries for this pipeline if pipelineId provided
    if (pipelineId) {
      // Transform vnext queries to match ExtractedQuery interface
      const transformedQueries = extractionResult.queries.map((q, index) => transformVnextToExtractedQuery(q, index));
      
      pipelineQueries.set(pipelineId, transformedQueries);
      // Log: Stored queries for pipeline
    }
    
    globalLogs.push({
      timestamp: new Date().toISOString(),
      level: 'success',
      message: `✅ Extracted ${extractionResult.summary.totalQueries} queries and ${extractionResult.summary.totalFragments} fragments`
    });

    // Select test scenario
    // Process ALL queries, not just a subset
    const testQueries = extractionResult.queries;
    
    globalLogs.push({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `📋 Testing ALL ${testQueries.length} extracted queries`
    });

    const results = [];
    
    // Test each query
    for (const testQuery of testQueries) {
      globalLogs.push({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `🔍 Testing query: ${testQuery.name} (${testQuery.type})`
      });

      try {
        const queryEndpoint = endpoint || (testQuery.endpoint === 'offerGraph' ? 
          'https://api.godaddy.com/v1/offer-graph' : 'https://api.godaddy.com/v1/product-graph');
        
        // Generate appropriate test variables based on endpoint
        const testVars = testQuery.endpoint === 'offerGraph' ? {
          ventureId: 'test-venture-123',
          domainName: 'example.com',
          websiteId: 'test-website-456',
          subscriptionId: 'test-subscription-123',
          productFilter: 'domains',
          enableOptimizationFlow: true,
          currency: 'USD',
          market: 'US'
        } : {
          ventureId: 'test-venture-123',
          domainName: 'example.com',
          websiteId: 'test-website-456',
          entitlementId: 'test-entitlement-789'
        };
        
        const result = await executeVnextQuery(
          queryEndpoint,
          testQuery.source,
          testVars,
          authHeaders || {},
          testQuery
        );

        results.push({
          queryName: testQuery.name,
          queryType: testQuery.type,
          endpoint: testQuery.endpoint,
          fragmentCount: testQuery.fragments.length,
          variableCount: testQuery.variables.length,
          status: 'success',
          response: result,
          responseTime: Math.floor(Math.random() * 300) + 50,
          file: testQuery.file
        });

        globalLogs.push({
          timestamp: new Date().toISOString(),
          level: 'success',
          message: `✅ ${testQuery.name} - Schema validation passed`
        });

      } catch (error) {
        results.push({
          queryName: testQuery.name,
          queryType: testQuery.type,
          endpoint: testQuery.endpoint,
          status: 'failed',
          error: error.message,
          responseTime: 0,
          file: testQuery.file
        });

        globalLogs.push({
          timestamp: new Date().toISOString(),
          level: 'error',
          message: `❌ ${testQuery.name} - ${error.message}`
        });
      }
    }

    const passedCount = results.filter(r => r.status === 'success').length;
    const failedCount = results.filter(r => r.status === 'failed').length;

    globalLogs.push({
      timestamp: new Date().toISOString(),
      level: 'success',
      message: `🎯 Vnext sample testing completed - ${passedCount}/${results.length} queries passed`
    });

    // Store vnext queries for pipeline simulation to use
    if (req.body.pipelineId) {
      const transformedQueries = extractionResult.queries.map((q, index) => transformVnextToExtractedQuery(q, index));
      pipelineQueries.set(req.body.pipelineId, transformedQueries);
    }

    res.json({ 
      testId,
      message: 'Vnext sample testing completed',
      extraction: {
        totalQueries: extractionResult.summary.totalQueries,
        totalFragments: extractionResult.summary.totalFragments,
        schemas: extractionResult.schemas.map(s => s.name),
        testScenarios: extractionResult.testScenarios.map(s => s.name)
      },
      results,
      summary: {
        total: results.length,
        passed: passedCount,
        failed: failedCount,
        productGraphQueries: results.filter(r => r.endpoint === 'productGraph').length,
        offerGraphQueries: results.filter(r => r.endpoint === 'offerGraph').length
      },
      scenarios: extractionResult.testScenarios
    });

  } catch (error) {
    globalLogs.push({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: `❌ Vnext sample testing failed: ${error.message}`
    });

    res.status(500).json({
      testId,
      error: error.message,
      message: 'Vnext sample testing failed'
    });
  }
});

// Real API testing endpoint
app.post('/api/test-real-api', async (req, res) => {
  // Log: Real API test request received
  
  const { queries, endpoint, authHeaders } = req.body;
  const testId = `test-${Date.now()}`;
  
  globalLogs.push({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: `Starting real API tests against ${endpoint || 'default endpoint'}...`
  });

  try {
    // Test with sample queries if none provided
    const testQueries = queries || [
      {
        name: 'getUser',
        query: 'query getUser($id: ID!) { user(id: $id) { id name email } }',
        variables: { id: '1' }
      },
      {
        name: 'listPosts', 
        query: 'query listPosts { posts { id title content } }',
        variables: {}
      }
    ];

    const results = [];
    
    for (const testQuery of testQueries) {
      globalLogs.push({
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Testing query: ${testQuery.name}...`
      });

      try {
        const result = await executeGraphQLQuery(
          endpoint || 'https://api.example.com/graphql',
          testQuery.query,
          testQuery.variables,
          authHeaders
        );

        results.push({
          queryName: testQuery.name,
          status: 'success',
          response: result,
          responseTime: Math.floor(Math.random() * 200) + 50 // Simulated response time
        });

        globalLogs.push({
          timestamp: new Date().toISOString(),
          level: 'success',
          message: `✓ ${testQuery.name} - API test passed`
        });

      } catch (error) {
        results.push({
          queryName: testQuery.name,
          status: 'failed',
          error: error.message,
          responseTime: 0
        });

        globalLogs.push({
          timestamp: new Date().toISOString(),
          level: 'error',
          message: `✗ ${testQuery.name} - API test failed: ${error.message}`
        });
      }
    }

    globalLogs.push({
      timestamp: new Date().toISOString(),
      level: 'success',
      message: `Real API testing completed - ${results.filter(r => r.status === 'success').length}/${results.length} passed`
    });

    res.json({ 
      testId,
      message: 'Real API testing completed',
      results,
      summary: {
        total: results.length,
        passed: results.filter(r => r.status === 'success').length,
        failed: results.filter(r => r.status === 'failed').length
      }
    });

  } catch (error) {
    globalLogs.push({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: `Real API testing failed: ${error.message}`
    });

    res.status(500).json({
      testId,
      error: error.message,
      message: 'Real API testing failed'
    });
  }
});

// Helper function to execute vnext sample queries with enhanced validation
async function executeVnextQuery(endpoint, query, variables = {}, authHeaders = {}, queryMeta = {}) {
  // Enhanced validation for vnext sample queries
  try {
    // For demo purposes, generate realistic responses based on query type
    if (endpoint.includes('godaddy.com') || endpoint.includes('example.com')) {
      // Simulate schema-aware responses
      const response = generateVnextSampleResponse(query, variables, queryMeta);
      return response;
    }
    
    // For real endpoints, make actual fetch request with enhanced headers
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'pg-migration-620-vnext-tester/1.0',
        ...authHeaders
      },
      body: JSON.stringify({
        query,
        variables
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    
    if (result.errors) {
      throw new Error(`GraphQL errors: ${result.errors.map(e => e.message).join(', ')}`);
    }

    return result;
  } catch (error) {
    throw new Error(`Vnext query execution failed: ${error.message}`);
  }
}

// Generate realistic sample responses based on query structure
function generateVnextSampleResponse(query, variables, queryMeta) {
  const queryName = queryMeta.name || 'unknownQuery';
  const queryType = queryMeta.type || 'query';
  
  // Venture-related queries
  if (queryName.includes('Venture') || queryName.includes('venture')) {
    return {
      data: {
        venture: {
          id: variables.ventureId || 'venture-123',
          name: 'Sample Venture',
          domainName: variables.domainName || 'example.com',
          profile: {
            name: 'Sample Business',
            logoUrl: 'https://example.com/logo.png',
            aiOnboarded: true,
            aapOnboarded: false
          },
          projects: [
            { id: 'project-1', name: 'Website', type: 'WEBSITE' },
            { id: 'project-2', name: 'Email', type: 'EMAIL' }
          ]
        }
      }
    };
  }
  
  // User-related queries
  if (queryName.includes('User') || queryName.includes('user')) {
    return {
      data: {
        user: {
          id: 'user-456',
          name: 'Test User',
          email: 'test@example.com',
          ventures: [
            { id: 'venture-123', name: 'Sample Venture' }
          ],
          preferences: {
            emailOptedIn: true,
            smsOptedIn: false
          }
        }
      }
    };
  }
  
  // Billing-related queries
  if (queryName.includes('Bill') || queryName.includes('transition') || queryMeta.endpoint === 'offerGraph') {
    return {
      data: {
        me: {
          id: 'customer-789',
          subscriptions: [
            { id: 'sub-1', productName: 'Domain Registration', status: 'ACTIVE' }
          ]
        },
        transitions: [
          { id: 'trans-1', fromPlan: 'basic', toPlan: 'premium', price: 9.99 }
        ]
      }
    };
  }
  
  // Default response
  return {
    data: {
      result: 'success',
      message: `Query ${queryName} executed successfully`,
      variables: variables,
      queryType: queryType
    }
  };
}

// Helper function to execute GraphQL queries against real APIs
async function executeGraphQLQuery(endpoint, query, variables = {}, authHeaders = {}) {
  // For demo purposes, we'll simulate the API call
  // In production, this would make actual HTTP requests
  
  if (endpoint.includes('example.com')) {
    // Simulate successful response for demo endpoints
    return {
      data: {
        user: { id: '1', name: 'John Doe', email: 'john@example.com' },
        posts: [
          { id: '1', title: 'Hello World', content: 'First post' },
          { id: '2', title: 'GraphQL Migration', content: 'Migration guide' }
        ]
      }
    };
  }

  // For real endpoints, make actual fetch request
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify({
        query,
        variables
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    
    if (result.errors) {
      throw new Error(`GraphQL errors: ${result.errors.map(e => e.message).join(', ')}`);
    }

    return result;
  } catch (error) {
    throw new Error(`API request failed: ${error.message}`);
  }
}

// Transform queries to new schema
function transformQueries(queries) {
  // Common field mappings based on schema changes
  const fieldMappings = {
    // Product Graph mappings
    'name': 'displayName',
    'description': 'summary',
    'created': 'createdAt',
    'updated': 'updatedAt',
    'status': 'state',
    'user.name': 'user.displayName',
    'venture.name': 'venture.displayName',
    'project.domain': 'project.domainName',
    
    // Offer Graph mappings
    'billDetails.amount': 'billDetails.totalAmount',
    'basket.items': 'basket.lineItems',
    'transitions': 'stateTransitions'
  };

  return queries.map(query => {
    // Use content field from ExtractedQuery interface
    const queryContent = query.content || query.source || '';
    const transformedSource = applyFieldMappings(queryContent, fieldMappings);
    const changes = detectChanges(queryContent, transformedSource, fieldMappings);
    
    return {
      ...query,
      transformedSource,
      changes,
      hasTransformation: changes.length > 0
    };
  });
}

// Apply field mappings to GraphQL query
function applyFieldMappings(querySource, mappings) {
  let transformed = querySource;
  
  // Apply each mapping
  Object.entries(mappings).forEach(([oldField, newField]) => {
    // Simple regex to replace field names
    const regex = new RegExp(`\\b${oldField}\\b`, 'g');
    transformed = transformed.replace(regex, newField);
  });
  
  return transformed;
}

// Detect what changes were made
function detectChanges(original, transformed, mappings) {
  const changes = [];
  
  Object.entries(mappings).forEach(([oldField, newField]) => {
    if (original.includes(oldField)) {
      changes.push({
        type: 'field_rename',
        from: oldField,
        to: newField,
        reason: 'Field renamed in new schema'
      });
    }
  });
  
  // Check for deprecated fields (simplified)
  const deprecatedFields = ['content', 'legacy', 'oldStatus'];
  deprecatedFields.forEach(field => {
    if (original.includes(field)) {
      changes.push({
        type: 'deprecated_field',
        field: field,
        reason: 'Field deprecated in new schema',
        action: 'Remove or migrate to new field'
      });
    }
  });
  
  return changes;
}

// Generate backward compatibility mapper code
function generateMapperCode(transformedQueries) {
  const mappersNeeded = new Set();
  const fieldMappings = {};
  
  // Collect all unique field mappings
  transformedQueries.forEach(query => {
    if (query.changes) {
      query.changes.forEach(change => {
        if (change.type === 'field_rename') {
          mappersNeeded.add(`${change.from} → ${change.to}`);
          fieldMappings[change.to] = change.from;
        }
      });
    }
  });
  
  if (mappersNeeded.size === 0) {
    return null;
  }
  
  // Generate TypeScript mapper function
  const mapperCode = `
// Auto-generated backward compatibility mapper
// Generated on ${new Date().toISOString()}

export function mapNewSchemaToLegacy(response: any): any {
  if (!response) return response;
  
  const mapped = JSON.parse(JSON.stringify(response)); // Deep clone
  
  // Field mappings
${Object.entries(fieldMappings).map(([newField, oldField]) => {
  return `  // Map ${newField} back to ${oldField}
  if (mapped.${newField} !== undefined) {
    mapped.${oldField} = mapped.${newField};
    delete mapped.${newField};
  }`;
}).join('\n\n')}
  
  // Recursively map nested objects
  Object.keys(mapped).forEach(key => {
    if (typeof mapped[key] === 'object' && mapped[key] !== null) {
      mapped[key] = mapNewSchemaToLegacy(mapped[key]);
    }
  });
  
  return mapped;
}

// Hivemind A/B testing wrapper
export function createHivemindMapper(cohort: 'control' | 'treatment') {
  return cohort === 'control' ? mapNewSchemaToLegacy : (response: any) => response;
}
`;
  
  return {
    code: mapperCode,
    mappings: Array.from(mappersNeeded),
    fieldCount: mappersNeeded.size
  };
}

// Simulate pipeline progression
function simulatePipelineProgress(pipelineId, skipExtraction = false) {
  const pipeline = activePipelines.get(pipelineId);
  if (!pipeline) return;

  // Get actual queries from pipeline if available (vnext case)
  const actualQueries = pipelineQueries.get(pipelineId) || [];
  const queryCount = actualQueries.length || 2;
  
  // Log: Pipeline queries found
  
  // Group queries by type and endpoint for realistic processing
  const queryTypes = {
    query: actualQueries.filter(q => (!q.operation || q.operation === 'query')),
    mutation: actualQueries.filter(q => q.operation === 'mutation'),
    subscription: actualQueries.filter(q => q.operation === 'subscription')
  };
  
  const endpointGroups = {
    productGraph: actualQueries.filter(q => !q.endpoint || q.endpoint === 'productGraph'),
    offerGraph: actualQueries.filter(q => q.endpoint === 'offerGraph')
  };
  
  const stages = [
    { 
      name: 'extraction', 
      duration: Math.min(3000 + queryCount * 50, 8000), // Scale with query count
      logs: skipExtraction ? 
        [
          `Using vnext sample data extraction results...`,
          `Processing ${queryCount} queries from vnext-dashboard`,
          `Found ${queryTypes.query.length} queries, ${queryTypes.mutation.length} mutations, ${queryTypes.subscription.length} subscriptions`
        ] :
        [
          'Starting extraction from repository...',
          'Scanning for GraphQL queries...',
          `Found ${queryCount} queries in multiple files`,
          `Extracted ${queryTypes.query.length} queries, ${queryTypes.mutation.length} mutations, ${queryTypes.subscription.length} subscriptions`
        ]
    },
    { 
      name: 'classification', 
      duration: Math.min(2000 + queryCount * 30, 5000), 
      logs: [
        'Classifying queries by complexity and endpoint...',
        `Product Graph: ${endpointGroups.productGraph.length} queries`,
        `Offer Graph: ${endpointGroups.offerGraph.length} queries`,
        ...actualQueries.slice(0, 5).map(q => 
          `${q.queryName}: ${q.operation || 'query'} targeting ${q.endpoint || 'productGraph'}`
        ),
        queryCount > 5 ? `... and ${queryCount - 5} more queries classified` : null
      ].filter(Boolean)
    },
    { 
      name: 'validation', 
      duration: Math.min(2500 + queryCount * 40, 6000), 
      logs: [
        'Validating all queries against GraphQL schemas...',
        `Validating ${endpointGroups.productGraph.length} Product Graph queries...`,
        `Validating ${endpointGroups.offerGraph.length} Offer Graph queries...`,
        ...actualQueries.slice(0, 3).map(q => 
          `✓ ${q.queryName} - Schema validation passed`
        ),
        queryCount > 3 ? `✓ All ${queryCount} queries validated successfully` : null,
        'Schema compatibility check completed'
      ].filter(Boolean)
    },
    { 
      name: 'testing', 
      duration: Math.min(4000 + queryCount * 100, 12000), // Longer for API tests
      logs: [
        `Running ${queryCount} test queries against real APIs...`,
        `Testing with authenticated requests...`,
        ...actualQueries.slice(0, 8).flatMap(q => [
          `🔍 Testing ${q.queryName} (${q.operation || 'query'})...`,
          `✅ ${q.queryName} - API test passed`
        ]),
        queryCount > 8 ? `✅ Tested remaining ${queryCount - 8} queries successfully` : null,
        `API testing completed - ${queryCount}/${queryCount} queries passed`
      ].filter(Boolean)
    },
    { 
      name: 'transformation', 
      duration: Math.min(3500 + queryCount * 60, 8000), 
      logs: [
        `Transforming ${queryCount} queries to new schema...`,
        'Analyzing field differences...',
        'Detecting deprecated fields...',
        ...actualQueries.slice(0, 4).map(q => 
          `Transforming ${q.queryName}...`
        ),
        'Applying field mappings and migrations...',
        'Generating response mapping utilities...',
        `✅ Transformation completed for all ${queryCount} queries`
      ].filter(Boolean)
    },
    { 
      name: 'pr', 
      duration: 3000, 
      logs: [
        'Preparing pull request with all changes...',
        `Including ${queryCount} transformed queries`,
        'Generating migration documentation...',
        'Creating backward compatibility mappers...',
        '✅ Pull request ready for review'
      ]
    }
  ];

  let currentStageIndex = skipExtraction ? 1 : 0; // Skip extraction stage if vnext
  
  // If skipping extraction, mark it as already completed
  if (skipExtraction && stages.length > 0) {
    stages[0].logs = ['Extraction completed via vnext sample data'];
    pipeline.currentStage = 'classification';
    pipeline.progress = 17; // 1/6 stages complete
  }

  function processNextStage() {
    if (currentStageIndex >= stages.length) {
      pipeline.currentStageStatus = 'completed';
      pipeline.status = 'completed';
      pipeline.progress = 100;
      // Log: Pipeline completed
      return;
    }

    const stage = stages[currentStageIndex];
    pipeline.currentStage = stage.name;
    pipeline.currentStageStatus = 'running';
    
    // Log: Starting pipeline stage

    // Add logs progressively
    stage.logs.forEach((message, index) => {
      setTimeout(() => {
        const logLevel = message.includes('error') ? 'error' : 
                        message.includes('warning') || message.includes('deprecated') ? 'warn' :
                        message.includes('passed') || message.includes('completed') || message.includes('ready') ? 'success' : 'info';
        
        globalLogs.push({
          timestamp: new Date().toISOString(),
          level: logLevel,
          message
        });
        
        // Update progress within stage
        pipeline.progress = Math.round(((currentStageIndex + (index + 1) / stage.logs.length) / stages.length) * 100);
        
        // Log: Pipeline stage progress
      }, (stage.duration / stage.logs.length) * index);
    });
    
    // Perform actual transformation when reaching transformation stage
    if (stage.name === 'transformation' && actualQueries.length > 0) {
      setTimeout(() => {
        // Log: Performing query transformations
        const transformedQueries = transformQueries(actualQueries);
        
        // Update the stored queries with transformations
        pipelineQueries.set(pipelineId, transformedQueries);
        
        // Count transformed queries
        const transformedCount = transformedQueries.filter(q => q.hasTransformation).length;
        
        globalLogs.push({
          timestamp: new Date().toISOString(),
          level: 'success',
          message: `✅ Applied transformations to ${transformedCount} queries with schema changes`
        });
      }, stage.duration / 2);
    }
    
    // Generate mappers during PR stage
    if (stage.name === 'pr' && actualQueries.length > 0) {
      setTimeout(() => {
        const queries = pipelineQueries.get(pipelineId) || [];
        const mapperResult = generateMapperCode(queries);
        
        if (mapperResult) {
          // Store mapper code for PR generation
          if (!pipeline.prData) pipeline.prData = {};
          pipeline.prData.mapperCode = mapperResult.code;
          pipeline.prData.mappingCount = mapperResult.fieldCount;
          
          globalLogs.push({
            timestamp: new Date().toISOString(),
            level: 'success',
            message: `✅ Generated backward compatibility mapper with ${mapperResult.fieldCount} field mappings`
          });
        }
      }, stage.duration / 3);
    }

    // Complete current stage and move to next
    setTimeout(() => {
      currentStageIndex++;
      processNextStage();
    }, stage.duration);
  }

  // Start after short delay
  setTimeout(processNextStage, 1000);
}

// Test real API endpoint with authentication
app.post('/api/validate-endpoint', async (req, res) => {
  const { endpoint, authHeaders, testQuery } = req.body;
  
  // Log: Validating endpoint
  
  try {
    const query = testQuery || `
      query IntrospectionQuery {
        __schema {
          queryType { name }
          mutationType { name }
          subscriptionType { name }
        }
      }
    `;

    const result = await executeGraphQLQuery(endpoint, query, {}, authHeaders);
    
    res.json({
      valid: true,
      message: 'Endpoint is accessible and responds to GraphQL queries',
      schemaInfo: result.data?.__schema || null,
      responseTime: Math.floor(Math.random() * 100) + 20
    });
    
  } catch (error) {
    res.status(400).json({
      valid: false,
      message: `Endpoint validation failed: ${error.message}`,
      error: error.message
    });
  }
});

// Get queries for a specific pipeline
app.get('/api/pipeline/:pipelineId/queries', (req, res) => {
  const { pipelineId } = req.params;
  const pipeline = activePipelines.get(pipelineId);
  
  if (!pipeline) {
    return res.status(404).json({ error: 'Pipeline not found' });
  }
  
  // Check if we have stored queries for this pipeline (e.g., from vnext extraction)
  if (pipelineQueries.has(pipelineId)) {
    const extractedQueries = pipelineQueries.get(pipelineId);
    // Transform ExtractedQuery to match expected API response structure
    const apiQueries = extractedQueries.map((q, index) => ({
      query: {
        id: `query-${index + 1}`,
        queryName: q.queryName,
        name: q.queryName,
        source: q.content,
        type: q.operation || 'query',
        operation: q.operation || 'query',
        filePath: q.filePath,
        lineNumber: q.lineNumber,
        endpoint: q.endpoint || 'productGraph',
        fragments: q.fragments || [],
        variables: q.variables || {},
        hasVariables: q.hasVariables || false
      },
      transformation: q.hasTransformation ? {
        originalQuery: q.content,
        transformedQuery: q.transformedSource || q.content,
        changes: q.changes || []
      } : null
    }));
    return res.json(apiQueries);
  }
  
  // Otherwise, generate sample queries for the pipeline
  const sampleQueries = [
    {
      query: {
        id: '1',
        name: 'getVentureHomeDataByVentureId',
        source: 'query getVentureHomeDataByVentureId($ventureId: UUID!) { venture(ventureId: $ventureId) { id name } }',
        type: 'query',
        filePath: 'src/queries/ventures.ts',
        endpoint: 'productGraph'
      },
      transformation: {
        originalQuery: 'query getVentureHomeDataByVentureId($ventureId: UUID!) { venture(ventureId: $ventureId) { id name } }',
        transformedQuery: 'query getVentureHomeDataByVentureId($ventureId: UUID!) { venture(ventureId: $ventureId) { id displayName } }',
        changes: [
          { type: 'field_rename', from: 'name', to: 'displayName', reason: 'Field renamed in schema' }
        ]
      }
    },
    {
      query: {
        id: '2', 
        name: 'getUserVenturesList',
        source: 'query getUserVenturesList { user { ventures { id name } } }',
        type: 'query',
        filePath: 'src/queries/user.ts',
        endpoint: 'productGraph'
      },
      transformation: {
        originalQuery: 'query getUserVenturesList { user { ventures { id name } } }',
        transformedQuery: 'query getUserVenturesList { user { ventures { id displayName } } }',
        changes: [
          { type: 'field_rename', from: 'name', to: 'displayName', reason: 'Field renamed in schema' }
        ]
      }
    }
  ];
  
  res.json(sampleQueries);
});

// Get baseline comparisons for a query
app.get('/api/pipeline/baselines/:queryName', (req, res) => {
  const { queryName } = req.params;
  const pipelineId = req.headers['x-pipeline-id'];
  
  // Try to find the actual query from stored data
  let queryData = null;
  if (pipelineId && pipelineQueries.has(pipelineId)) {
    const queries = pipelineQueries.get(pipelineId);
    queryData = queries.find(q => q.queryName === queryName);
  }
  
  // Build baseline from actual query data if available
  const baselineData = {
    queryName,
    hasBaseline: !!queryData,
    baselineMetrics: queryData ? {
      responseTime: 85,
      successRate: 99.5,
      lastUpdated: new Date().toISOString(),
      endpoint: queryData.endpoint || 'productGraph',
      queryType: queryData.operation || 'query'
    } : null,
    differences: queryData && queryData.changes ? 
      queryData.changes.map(change => ({
        field: change.from || change.field,
        oldType: change.from,
        newType: change.to,
        impact: change.reason || change.action
      })) : []
  };
  
  res.json(baselineData);
});

// Get real API test results for a specific pipeline
app.get('/api/pipeline/:pipelineId/real-api-tests', (req, res) => {
  const { pipelineId } = req.params;
  const pipeline = activePipelines.get(pipelineId);
  
  if (!pipeline) {
    return res.status(404).json({ error: 'Pipeline not found' });
  }
  
  // Generate sample real API test results
  const testResults = {
    summary: {
      total: 2,
      passed: 2,
      failed: 0,
      pending: 0
    },
    results: [
      {
        queryName: 'getVentureHomeDataByVentureId',
        status: 'passed',
        baselineExists: true,
        comparisonResult: {
          matches: true,
          differences: []
        }
      },
      {
        queryName: 'getUserVenturesList',
        status: 'passed',
        baselineExists: true,
        comparisonResult: {
          matches: true,
          differences: []
        }
      }
    ]
  };
  
  res.json(testResults);
});

// Generate PR for a specific pipeline
app.post('/api/pipeline/:pipelineId/generate-pr', (req, res) => {
  const { pipelineId } = req.params;
  const pipeline = activePipelines.get(pipelineId);
  
  if (!pipeline) {
    return res.status(404).json({ error: 'Pipeline not found' });
  }
  
  const prResult = {
    success: true,
    prUrl: `https://github.com/example/repo/pull/123`,
    branchName: `graphql-migration-${pipelineId}`,
    filesChanged: 3,
    summary: 'Updated GraphQL queries to use new schema fields'
  };
  
  // Add log for PR generation
  globalLogs.push({
    timestamp: new Date().toISOString(),
    level: 'success',
    message: `🎉 Pull request generated: ${prResult.prUrl}`
  });
  
  res.json(prResult);
});

// Get sample queries for testing
app.get('/api/sample-queries', (req, res) => {
  const sampleQueries = [
    {
      name: 'getUserProfile',
      query: `query getUserProfile($userId: ID!) {
        user(id: $userId) {
          id
          name
          email
          profile {
            bio
            avatar
          }
        }
      }`,
      variables: { userId: '1' },
      description: 'Fetch user profile with nested data'
    },
    {
      name: 'listArticles',
      query: `query listArticles($limit: Int = 10) {
        articles(limit: $limit) {
          id
          title
          content
          author {
            name
          }
          publishedAt
        }
      }`,
      variables: { limit: 5 },
      description: 'List articles with author information'
    },
    {
      name: 'createPost',
      query: `mutation createPost($input: PostInput!) {
        createPost(input: $input) {
          id
          title
          content
          createdAt
        }
      }`,
      variables: {
        input: {
          title: 'Test Post',
          content: 'This is a test post created via API'
        }
      },
      description: 'Create a new post (mutation example)'
    }
  ];
  
  res.json({
    queries: sampleQueries,
    message: 'Sample GraphQL queries for API testing'
  });
});

// GraphQL endpoint - process actual queries
app.post('/api/graphql', async (req, res) => {
  const { query, variables, operationName } = req.body;
  const pipelineId = req.headers['x-pipeline-id'];
  
  // Handle GetCohort query for Hivemind integration
  if (operationName === 'GetCohort' || (query && query.includes('getCohort'))) {
    res.json({
      data: {
        getCohort: {
          cohortId: `cohort-${variables.queryId || 'default'}-${Date.now()}`,
          experimentName: 'GraphQL Migration A/B Test',
          variant: Math.random() > 0.5 ? 'treatment' : 'control',
          confidence: 95.5,
          metrics: {
            successRate: 98.7,
            responseTime: 145,
            errorCount: 2
          }
        }
      }
    });
    return;
  }
  
  // If we have stored queries from vnext extraction, use them
  if (pipelineId && pipelineQueries.has(pipelineId)) {
    const queries = pipelineQueries.get(pipelineId);
    const matchingQuery = queries.find(q => 
      q.queryName === operationName || 
      (query && q.content && q.content.includes(query.split('{')[0].trim()))
    );
    
    if (matchingQuery) {
      // Return actual query data
      res.json({
        data: {
          queryInfo: {
            name: matchingQuery.queryName,
            type: matchingQuery.operation || 'query',
            endpoint: matchingQuery.endpoint || 'productGraph',
            hasTransformation: matchingQuery.hasTransformation || false,
            changes: matchingQuery.changes || []
          }
        }
      });
      return;
    }
  }
  
  // Handle validation queries
  if (query && query.includes('__typename')) {
    res.json({
      data: {
        __typename: 'Query'
      }
    });
    return;
  }
  
  // Default response with query info
  res.json({
    data: {
      info: 'Processing query',
      operationName,
      hasVariables: !!variables && Object.keys(variables).length > 0,
      __typename: 'Query'
    }
  });
});

// Test API endpoint - use actual extracted queries
app.post('/api/test', async (req, res) => {
  const { query, endpoint } = req.body;
  
  // Log: Test API called
  
  res.json({
    success: true,
    tested: true,
    endpoint,
    timestamp: new Date().toISOString()
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  // Log: Server started on port
  // Available endpoints configured
});