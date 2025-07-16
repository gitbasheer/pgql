import { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import PipelineProgress from './PipelineProgress';
import LogViewer from './LogViewer';
import QueryResults from './QueryResults';
import RealApiTesting from './RealApiTesting';
import GitHubIntegration from './GitHubIntegration';
import PRPreview from './PRPreview';
import { constructAuthCookies } from '../utils/auth';
import '../styles/dashboard.css';

interface PipelineConfig {
  repoPath: string;
  schemaEndpoint: string;
  testApiUrl?: string;
  testAccountId?: string;
}

interface PipelineStatus {
  stage: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  logs: Array<{
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'success';
    message: string;
  }>;
}

function Dashboard() {
  const [config, setConfig] = useState<PipelineConfig>({
    repoPath: '',
    schemaEndpoint: '',
    testApiUrl: '',
    testAccountId: '',
  });
  const [isPipelineActive, setIsPipelineActive] = useState(false);
  const [pipelineId, setPipelineId] = useState<string>();
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(
    null
  );
  const [logs, setLogs] = useState<
    Array<{
      timestamp: string;
      level: 'info' | 'warn' | 'error' | 'success';
      message: string;
    }>
  >([]);

  const pollingIntervalRef = useRef<number | null>(null);

  // Polling function to replace Socket.io
  const pollPipelineStatus = useCallback(async () => {
    if (!pipelineId || !isPipelineActive) return;

    try {
      const response = await fetch('/api/status', {
        headers: {
          'x-app-key': 'vnext-dashboard',
          Cookie: constructAuthCookies(),
        },
      });

      if (response.ok) {
        const data = await response.json();

        // Validate response structure
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid response format from server');
        }

        const status = data as PipelineStatus;
        setPipelineStatus(status);

        // Update logs if new ones are available with proper validation
        if (Array.isArray(status.logs) && status.logs.length > logs.length) {
          // Validate each log entry
          const validLogs = status.logs.filter(
            (log) =>
              log &&
              typeof log === 'object' &&
              'message' in log &&
              'level' in log &&
              'timestamp' in log
          );
          setLogs(validLogs);
        }

        // Check if pipeline is completed
        if (status.status === 'completed' || status.status === 'failed') {
          setIsPipelineActive(false);
          if (pollingIntervalRef.current !== null) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }

          // Notify user of completion
          if (status.status === 'completed') {
            toast.success('Pipeline completed successfully');
          } else {
            toast.error('Pipeline failed. Check logs for details.');
          }
        }
      } else {
        // Handle non-OK responses
        const errorText = await response.text();
        throw new Error(
          `Server error (${response.status}): ${errorText || 'Unknown error'}`
        );
      }
    } catch (error) {
      // Proper error handling without exposing sensitive data
      if (error instanceof Error) {
        toast.error(`Connection error: ${error.message}`);
      } else {
        toast.error('An unexpected error occurred. Please try again.');
      }
    }
  }, [pipelineId, isPipelineActive, logs.length]);

  // Start polling when pipeline becomes active
  useEffect(() => {
    if (isPipelineActive && pipelineId && !pollingIntervalRef.current) {
      pollingIntervalRef.current = setInterval(pollPipelineStatus, 1000);
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [isPipelineActive, pipelineId, pollPipelineStatus]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const startPipeline = useMutation({
    mutationFn: async (config: PipelineConfig) => {
      // Call the UnifiedExtractor backend endpoint
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoPath: config.repoPath,
          schemaEndpoint: config.schemaEndpoint,
          testApiUrl: config.testApiUrl,
          testAccountId: config.testAccountId,
          // Additional extraction options per CLAUDE.md guidance
          strategies: ['hybrid'], // Use both AST and pluck strategies
          preserveSourceAST: true, // For better context analysis
          enableVariantDetection: true, // For dynamic query patterns
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to start extraction pipeline');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setIsPipelineActive(true);
      setPipelineId(data.pipelineId || data.extractionId);
      toast.success('GraphQL extraction pipeline started successfully!');
    },
    onError: (error: Error) => {
      toast.error(`Failed to start extraction: ${error.message}`);
    },
  });

  // Step 4: Full Flow Test with Z's mock vnext-dashboard
  const testVnextSampleData = useMutation({
    mutationFn: async () => {
      // Load Z's sample data path and trigger full pipeline
      const vnextConfig = {
        repoPath: 'data/sample_data/vnext-dashboard', // Z's mock data
        schemaEndpoint:
          import.meta.env.REACT_APP_APOLLO_PG_ENDPOINT ||
          'http://localhost:5173/api/graphql',
        testApiUrl:
          import.meta.env.REACT_APP_TEST_API_URL ||
          'http://localhost:5173/api/test',
        testAccountId:
          import.meta.env.REACT_APP_TEST_ACCOUNT_ID || 'test-vnext-123',
      };

      // First, extract from repo
      const extractResponse = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...vnextConfig,
          strategies: ['hybrid'],
          preserveSourceAST: true,
          enableVariantDetection: true,
        }),
      });

      if (!extractResponse.ok) {
        const error = await extractResponse.json();
        throw new Error(
          error.message || 'Failed to extract from vnext sample data'
        );
      }

      const extractData = await extractResponse.json();

      // For vnext, the extract endpoint handles everything
      return {
        extraction: extractData,
      };
    },
    onSuccess: (data) => {
      setIsPipelineActive(true);
      setPipelineId(data.extraction.pipelineId || data.extraction.extractionId);
      toast.success('vnext sample data pipeline started successfully!');
      toast.info('Running real API tests with masked authentication...');
    },
    onError: (error: Error) => {
      toast.error(`vnext testing failed: ${error.message}`);
    },
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      clearLogs();
      startPipeline.mutate(config);
    },
    [config, clearLogs, startPipeline]
  );

  const handleVnextTest = useCallback(() => {
    clearLogs();
    testVnextSampleData.mutate();
  }, [clearLogs, testVnextSampleData]);

  const handleInputChange = useCallback(
    (field: keyof PipelineConfig) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setConfig((prev) => ({ ...prev, [field]: e.target.value }));
      },
    []
  );

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>GraphQL Migration Dashboard</h1>
        <p>Real-time monitoring for your GraphQL migration pipeline</p>
        <div className="connection-status">
          <span
            className={`status-indicator ${isPipelineActive ? 'connected' : 'disconnected'}`}
          />
          {isPipelineActive
            ? `Polling Status (${pipelineStatus?.stage || 'unknown'})`
            : 'Ready'}
        </div>
      </header>

      <main className="dashboard-main">
        <section className="input-section">
          <h2>Pipeline Configuration</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="repo-path">Repository Path/URL *</label>
              <div className="input-with-action">
                <input
                  id="repo-path"
                  type="text"
                  value={config.repoPath}
                  onChange={handleInputChange('repoPath')}
                  placeholder="Enter local path or GitHub URL"
                  required
                />
                <GitHubIntegration
                  onRepoCloned={(path) =>
                    setConfig((prev) => ({ ...prev, repoPath: path }))
                  }
                />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="schema-endpoint">Schema Endpoint *</label>
              <input
                id="schema-endpoint"
                type="text"
                value={config.schemaEndpoint}
                onChange={handleInputChange('schemaEndpoint')}
                placeholder="http://localhost:5173/api/graphql"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="test-api">Test API URL (Optional)</label>
              <input
                id="test-api"
                type="text"
                value={config.testApiUrl}
                onChange={handleInputChange('testApiUrl')}
                placeholder="http://localhost:5173/api/test"
              />
            </div>
            <div className="form-group">
              <label htmlFor="test-account">Test Account ID (Optional)</label>
              <input
                id="test-account"
                type="text"
                value={config.testAccountId}
                onChange={handleInputChange('testAccountId')}
                placeholder="test-account-123"
              />
            </div>
            <div className="button-group">
              <button
                type="submit"
                className="start-pipeline"
                disabled={
                  !config.repoPath ||
                  !config.schemaEndpoint ||
                  startPipeline.isPending
                }
              >
                {startPipeline.isPending ? 'Starting...' : 'Start Pipeline'}
              </button>

              <button
                type="button"
                className="test-vnext-btn"
                onClick={handleVnextTest}
                disabled={
                  testVnextSampleData.isPending || startPipeline.isPending
                }
                title="Test with Z's vnext sample data + real API endpoints"
              >
                {testVnextSampleData.isPending
                  ? 'Testing vnext...'
                  : '🧪 Test vnext Sample'}
              </button>
            </div>
          </form>
        </section>

        <section className="pipeline-section">
          <h2>Pipeline Progress</h2>
          {isPipelineActive ? (
            <PipelineProgress
              isActive={isPipelineActive}
              currentStage={pipelineStatus?.stage}
              pipelineStatus={pipelineStatus || undefined}
            />
          ) : (
            <div className="pipeline-placeholder">
              <p>Pipeline will appear here once started...</p>
            </div>
          )}
        </section>

        <section className="logs-section">
          <div className="logs-header">
            <h2>Real-time Logs</h2>
            {logs.length > 0 && (
              <button onClick={clearLogs} className="clear-logs">
                Clear Logs
              </button>
            )}
          </div>
          <LogViewer logs={logs} />
        </section>

        <QueryResults pipelineId={pipelineId} isActive={isPipelineActive} />

        <RealApiTesting pipelineId={pipelineId} isActive={isPipelineActive} />

        <PRPreview pipelineId={pipelineId} isActive={isPipelineActive} />
      </main>
    </div>
  );
}

export default Dashboard;
