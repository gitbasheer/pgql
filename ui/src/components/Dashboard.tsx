import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { useSocket } from '../hooks/useSocket';
import { usePipelineLogs } from '../hooks/usePipelineLogs';
import PipelineProgress from './PipelineProgress';
import LogViewer from './LogViewer';
import QueryResults from './QueryResults';
import GitHubIntegration from './GitHubIntegration';
import PRPreview from './PRPreview';
import '../styles/dashboard.css';

interface PipelineConfig {
  repoPath: string;
  schemaEndpoint: string;
  testApiUrl?: string;
  testAccountId?: string;
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
  
  const { socket, isConnected } = useSocket();
  const { logs, clearLogs } = usePipelineLogs(socket);

  const startPipeline = useMutation({
    mutationFn: async (config: PipelineConfig) => {
      const response = await fetch('/api/pipeline/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to start pipeline');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setIsPipelineActive(true);
      setPipelineId(data.pipelineId);
      toast.success('Pipeline started successfully!');
    },
    onError: (error: Error) => {
      toast.error(`Failed to start pipeline: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    clearLogs();
    startPipeline.mutate(config);
  };

  const handleInputChange = (field: keyof PipelineConfig) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setConfig(prev => ({ ...prev, [field]: e.target.value }));
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>GraphQL Migration Dashboard</h1>
        <p>Real-time monitoring for your GraphQL migration pipeline</p>
        <div className="connection-status">
          <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`} />
          {isConnected ? 'Connected' : 'Disconnected'}
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
                  onRepoCloned={(path) => setConfig(prev => ({ ...prev, repoPath: path }))}
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
                placeholder="https://api.example.com/graphql"
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
                placeholder="https://test-api.example.com"
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
            <button 
              type="submit"
              className="start-pipeline"
              disabled={!config.repoPath || !config.schemaEndpoint || startPipeline.isPending}
            >
              {startPipeline.isPending ? 'Starting...' : 'Start Pipeline'}
            </button>
          </form>
        </section>

        <section className="pipeline-section">
          <h2>Pipeline Progress</h2>
          {isPipelineActive ? (
            <PipelineProgress socket={socket} isActive={isPipelineActive} />
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
        
        <PRPreview pipelineId={pipelineId} isActive={isPipelineActive} />
      </main>
    </div>
  );
}

export default Dashboard;