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

// Mock vnext test endpoint
app.post('/api/test-real-api', (req, res) => {
  console.log('Real API test request:', req.body);
  
  // Simulate vnext API testing
  setTimeout(() => {
    globalLogs.push({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'Testing vnext sample queries against real API...'
    });
  }, 500);
  
  setTimeout(() => {
    globalLogs.push({
      timestamp: new Date().toISOString(),
      level: 'success',
      message: 'vnext API tests completed successfully'
    });
  }, 2000);

  res.json({ 
    testId: `test-${Date.now()}`,
    message: 'Real API testing started for vnext sample'
  });
});

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

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`✅ Mock API server running on http://localhost:${PORT}`);
  console.log('📊 Endpoints available:');
  console.log('  POST /api/extract - Start UnifiedExtractor pipeline');
  console.log('  GET  /api/status  - Poll pipeline status');
  console.log('  POST /api/test-real-api - Test vnext sample');
});