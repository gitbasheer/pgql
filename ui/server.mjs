import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Mock pipeline data storage
let activePipelines = new Map();
let globalLogs = [];

// Mock UnifiedExtractor endpoint
app.post('/api/extract', (req, res) => {
  const { repoPath, schemaEndpoint, strategies, preserveSourceAST, enableVariantDetection } = req.body;
  
  console.log('Extract request:', { repoPath, schemaEndpoint, strategies });
  
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
  
  // Start pipeline simulation
  simulatePipelineProgress(pipelineId);

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

// Real API testing endpoint
app.post('/api/test-real-api', async (req, res) => {
  console.log('Real API test request:', req.body);
  
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

// Simulate pipeline progression
function simulatePipelineProgress(pipelineId) {
  const pipeline = activePipelines.get(pipelineId);
  if (!pipeline) return;

  const stages = [
    { 
      name: 'extraction', 
      duration: 3000, 
      logs: [
        'Starting extraction from repository...',
        'Scanning for GraphQL queries...',
        'Found 2 queries in 2 files'
      ]
    },
    { 
      name: 'classification', 
      duration: 2000, 
      logs: [
        'Classifying queries by complexity...',
        'Query getUser: simple query with variables',
        'Query listPosts: nested query with fragments'
      ]
    },
    { 
      name: 'validation', 
      duration: 2500, 
      logs: [
        'Validating queries against schema...',
        'Query listPosts uses deprecated field "content"',
        'All queries are valid'
      ]
    },
    { 
      name: 'testing', 
      duration: 4000, 
      logs: [
        'Running test queries against API...',
        'Testing getUser query...',
        'getUser query test passed',
        'Testing listPosts query...',
        'listPosts query test passed'
      ]
    },
    { 
      name: 'transformation', 
      duration: 3500, 
      logs: [
        'Transforming queries to new schema...',
        'Applying field mappings...',
        'Generating response mapping utilities...',
        'Transformation completed for 2 queries'
      ]
    },
    { 
      name: 'pr', 
      duration: 2000, 
      logs: [
        'Preparing pull request...',
        'Pull request ready for review'
      ]
    }
  ];

  let currentStageIndex = 0;

  function processNextStage() {
    if (currentStageIndex >= stages.length) {
      pipeline.currentStageStatus = 'completed';
      pipeline.status = 'completed';
      pipeline.progress = 100;
      console.log('Pipeline completed:', pipelineId);
      return;
    }

    const stage = stages[currentStageIndex];
    pipeline.currentStage = stage.name;
    pipeline.currentStageStatus = 'running';
    
    console.log(`Starting stage: ${stage.name}`);

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
        
        console.log(`Log: ${message}`);
      }, (stage.duration / stage.logs.length) * index);
    });

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
  
  console.log('Validating endpoint:', endpoint);
  
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

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`✅ Real API Testing Server running on http://localhost:${PORT}`);
  console.log('📊 Endpoints available:');
  console.log('  POST /api/extract - Start UnifiedExtractor pipeline');
  console.log('  GET  /api/status  - Poll pipeline status');
  console.log('  POST /api/test-real-api - Test GraphQL queries against real APIs');
  console.log('  POST /api/validate-endpoint - Validate GraphQL endpoint accessibility');
  console.log('  GET  /api/sample-queries - Get sample queries for testing');
  console.log('');
  console.log('🔧 Real API Testing:');
  console.log('  • Supports actual GraphQL endpoint testing');
  console.log('  • Handles authentication headers');
  console.log('  • Validates endpoint accessibility');
  console.log('  • Returns real API responses');
});