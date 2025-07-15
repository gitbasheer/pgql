import { createServer } from 'http';
import { Server } from 'socket.io';
import express from 'express';
import cors from 'cors';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// Mock pipeline data
let activePipelines = new Map();

// Mock UnifiedExtractor endpoint (main extraction endpoint)
app.post('/api/extract', (req: any, res: any) => {
  const { repoPath, schemaEndpoint, strategies, preserveSourceAST, enableVariantDetection } = req.body;
  
  if (!repoPath || !schemaEndpoint) {
    return res.status(400).json({ message: 'Missing required fields: repoPath and schemaEndpoint' });
  }

  // Simulate invalid repo path error
  if (repoPath.includes('invalid')) {
    return res.status(400).json({ message: 'Invalid repository path: Path does not exist or is not accessible' });
  }

  const pipelineId = `extract-${Date.now()}`;
  activePipelines.set(pipelineId, {
    id: pipelineId,
    status: 'running',
    repoPath,
    schemaEndpoint,
    strategies: strategies || ['hybrid'],
    preserveSourceAST: preserveSourceAST || true,
    enableVariantDetection: enableVariantDetection || true,
    stages: {
      extraction: 'pending',
      classification: 'pending',
      validation: 'pending',
      testing: 'pending',
      transformation: 'pending',
      pr: 'pending'
    }
  });

  // Start simulating pipeline progress
  simulatePipeline(pipelineId, io);

  res.json({ 
    pipelineId,
    extractionId: pipelineId, // For backward compatibility
    message: 'UnifiedExtractor pipeline started successfully',
    strategies: strategies || ['hybrid'],
    preserveSourceAST: preserveSourceAST || true,
    enableVariantDetection: enableVariantDetection || true
  });
});

// Mock status polling endpoint
app.get('/api/status', (req: any, res: any) => {
  // Return the latest pipeline status for polling
  const latestPipeline = Array.from(activePipelines.values()).pop();
  
  if (!latestPipeline) {
    return res.json({
      stage: 'idle',
      status: 'ready',
      logs: []
    });
  }
  
  // Get current stage from pipeline
  const currentStage = getCurrentStage(latestPipeline);
  const logs = latestPipeline.logs || [];
  
  res.json({
    stage: currentStage.name,
    status: currentStage.status,
    progress: currentStage.progress,
    logs: logs
  });
});

// Helper function to get current stage
function getCurrentStage(pipeline: any) {
  const stages = ['extraction', 'classification', 'validation', 'testing', 'transformation', 'pr'];
  
  for (const stage of stages) {
    if (pipeline.stages[stage] === 'in_progress') {
      return { name: stage, status: 'running', progress: 50 };
    }
    if (pipeline.stages[stage] === 'pending') {
      return { name: stage, status: 'pending', progress: 0 };
    }
  }
  
  return { name: 'pr', status: 'completed', progress: 100 };
}

// Mock endpoint to start pipeline (legacy support)
app.post('/api/pipeline/start', (req: any, res: any) => {
  const { repoPath, schemaEndpoint } = req.body;
  
  if (!repoPath || !schemaEndpoint) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  // Simulate invalid repo path error
  if (repoPath.includes('invalid')) {
    return res.status(400).json({ message: 'Invalid repository path: Path does not exist or is not accessible' });
  }

  const pipelineId = `pipeline-${Date.now()}`;
  activePipelines.set(pipelineId, {
    id: pipelineId,
    status: 'running',
    stages: {
      extraction: 'pending',
      classification: 'pending',
      validation: 'pending',
      testing: 'pending',
      transformation: 'pending',
      pr: 'pending'
    }
  });

  // Start simulating pipeline progress
  simulatePipeline(pipelineId, io);

  res.json({ pipelineId });
});

// Mock endpoint to get queries
app.get('/api/pipeline/:id/queries', (req: any, res: any) => {
  const pipeline = activePipelines.get(req.params.id);
  
  if (!pipeline) {
    return res.status(404).json({ message: 'Pipeline not found' });
  }

  // Return mock queries based on pipeline progress
  const queries = [
    {
      query: {
        queryName: 'getUser',
        content: 'query getUser($id: ID!) { user(id: $id) { name email } }',
        filePath: '/src/queries/user.ts',
        lineNumber: 42,
        operation: 'query',
        hasVariables: true,
        isNested: false
      },
      transformation: pipeline.stages.transformation === 'completed' ? {
        transformedQuery: 'query getUser($id: ID!) { userV2(userId: $id) { fullName emailAddress } }',
        warnings: ['Field "name" renamed to "fullName"', 'Field "email" renamed to "emailAddress"'],
        mappingCode: `// Response mapping for getUser
export function mapGetUserResponse(oldResponse: any): any {
  return {
    user: {
      name: oldResponse.userV2.fullName,
      email: oldResponse.userV2.emailAddress
    }
  };
}`
      } : undefined
    },
    {
      query: {
        queryName: 'listPosts',
        content: 'query listPosts { posts { id title content author { name } } }',
        filePath: '/src/queries/posts.ts',
        lineNumber: 15,
        operation: 'query',
        hasVariables: false,
        isNested: true
      }
    }
  ];

  res.json(queries);
});

// Mock GitHub clone endpoint
app.post('/api/github/clone', async (req: any, res: any) => {
  const { repoUrl } = req.body;
  
  if (!repoUrl) {
    return res.status(400).json({ message: 'Repository URL is required' });
  }

  // Simulate cloning delay
  await new Promise(resolve => setTimeout(resolve, 2000));

  res.json({ 
    localPath: `/tmp/cloned-repos/${repoUrl.split('/').pop()}`,
    message: 'Repository cloned successfully'
  });
});

// Mock PR generation endpoint
app.post('/api/pipeline/:id/generate-pr', (req: any, res: any) => {
  const pipeline = activePipelines.get(req.params.id);
  
  if (!pipeline) {
    return res.status(404).json({ message: 'Pipeline not found' });
  }

  if (pipeline.stages.transformation !== 'completed') {
    return res.status(400).json({ message: 'Pipeline must complete transformation before generating PR' });
  }

  const prDiff = `diff --git a/src/queries/user.ts b/src/queries/user.ts
index abc123..def456 100644
--- a/src/queries/user.ts
+++ b/src/queries/user.ts
@@ -40,7 +40,7 @@ export const GET_USER = gql\`
-  query getUser($id: ID!) { 
-    user(id: $id) { 
-      name 
-      email 
-    } 
-  }
+  query getUser($id: ID!) { 
+    userV2(userId: $id) { 
+      fullName 
+      emailAddress 
+    } 
+  }
\`;`;

  res.json({
    prUrl: 'https://github.com/example/repo/pull/123',
    diff: prDiff
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Simulate pipeline progression
function simulatePipeline(pipelineId: string, io: Server) {
  const pipeline = activePipelines.get(pipelineId);
  if (!pipeline) return;

  // Initialize logs array for polling
  pipeline.logs = [];

  const stages = [
    { name: 'extraction', duration: 3000, logs: [
      { level: 'info', message: 'Starting extraction from repository...' },
      { level: 'info', message: 'Scanning for GraphQL queries...' },
      { level: 'success', message: 'Found 2 queries in 2 files' }
    ]},
    { name: 'classification', duration: 2000, logs: [
      { level: 'info', message: 'Classifying queries by complexity...' },
      { level: 'info', message: 'Query getUser: simple query with variables' },
      { level: 'info', message: 'Query listPosts: nested query with fragments' }
    ]},
    { name: 'validation', duration: 2500, logs: [
      { level: 'info', message: 'Validating queries against schema...' },
      { level: 'warn', message: 'Query listPosts uses deprecated field "content"' },
      { level: 'success', message: 'All queries are valid' }
    ]},
    { name: 'testing', duration: 4000, logs: [
      { level: 'info', message: 'Running test queries against API...' },
      { level: 'info', message: 'Testing getUser query...' },
      { level: 'success', message: 'getUser query test passed' },
      { level: 'info', message: 'Testing listPosts query...' },
      { level: 'success', message: 'listPosts query test passed' }
    ]},
    { name: 'transformation', duration: 3500, logs: [
      { level: 'info', message: 'Transforming queries to new schema...' },
      { level: 'info', message: 'Applying field mappings...' },
      { level: 'info', message: 'Generating response mapping utilities...' },
      { level: 'success', message: 'Transformation completed for 2 queries' }
    ]},
    { name: 'pr', duration: 2000, logs: [
      { level: 'info', message: 'Preparing pull request...' },
      { level: 'success', message: 'Pull request ready for review' }
    ]}
  ];

  let currentStageIndex = 0;

  function processNextStage() {
    if (currentStageIndex >= stages.length) {
      pipeline.status = 'completed';
      io.emit('pipeline:complete', { pipelineId });
      return;
    }

    const stage = stages[currentStageIndex];
    pipeline.stages[stage.name] = 'in_progress';

    // Emit stage start
    io.emit('pipeline:stage', {
      stage: stage.name,
      status: 'in_progress',
      progress: 0
    });

    // Emit logs progressively and store for polling
    stage.logs.forEach((log, index) => {
      setTimeout(() => {
        // Add timestamp to log and store for polling
        const logEntry = {
          timestamp: new Date().toISOString(),
          level: log.level,
          message: log.message
        };
        pipeline.logs.push(logEntry);

        // Emit via Socket.io for real-time updates
        io.emit('log', {
          stage: stage.name,
          ...logEntry
        });

        // Also emit pipeline:log for backward compatibility
        io.emit('pipeline:log', logEntry);

        // Update progress
        const progress = Math.round(((index + 1) / stage.logs.length) * 100);
        io.emit('pipeline:stage', {
          stage: stage.name,
          status: 'in_progress',
          progress
        });
      }, (stage.duration / stage.logs.length) * index);
    });

    // Complete stage
    setTimeout(() => {
      pipeline.stages[stage.name] = 'completed';
      io.emit('pipeline:stage', {
        stage: stage.name,
        status: 'completed',
        progress: 100
      });

      currentStageIndex++;
      processNextStage();
    }, stage.duration);
  }

  // Start processing after a short delay
  setTimeout(() => processNextStage(), 1000);
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Mock server running on port ${PORT}`);
});