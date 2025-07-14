import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { testOnRealApi, getRealApiTestResults, triggerRealApiTests, type TestParams } from '../services/api';
import '../styles/real-api-testing.css';

interface RealApiTestingProps {
  pipelineId?: string;
  isActive: boolean;
}

interface AuthConfig {
  cookies: string;
  appKey: string;
}

export default function RealApiTesting({ pipelineId, isActive }: RealApiTestingProps) {
  const [authConfig, setAuthConfig] = useState<AuthConfig>({
    cookies: '',
    appKey: '',
  });
  const [showAuthForm, setShowAuthForm] = useState(false);

  const { data: testResults, isLoading, refetch } = useQuery({
    queryKey: ['real-api-tests', pipelineId],
    queryFn: () => getRealApiTestResults(pipelineId!),
    enabled: !!pipelineId && isActive,
    refetchInterval: 10000, // Poll every 10 seconds
  });

  const triggerTests = useMutation({
    mutationFn: () => triggerRealApiTests(pipelineId!, authConfig),
    onSuccess: () => {
      toast.success('Real API tests triggered successfully!');
      setShowAuthForm(false);
      refetch();
    },
    onError: (error: Error) => {
      toast.error(`Failed to trigger tests: ${error.message}`);
    },
  });

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!authConfig.cookies || !authConfig.appKey) {
      toast.error('Both cookies and app key are required');
      return;
    }
    triggerTests.mutate();
  };

  if (!isActive || !pipelineId) {
    return (
      <div className="real-api-testing">
        <div className="section-header">
          <h3>Real API Testing</h3>
          <p>Tests queries against real API with baseline comparison</p>
        </div>
        <div className="empty-state">
          <p>Real API testing will be available after pipeline starts</p>
        </div>
      </div>
    );
  }

  return (
    <div className="real-api-testing">
      <div className="section-header">
        <h3>Real API Testing</h3>
        <div className="test-actions">
          {!showAuthForm ? (
            <button 
              onClick={() => setShowAuthForm(true)}
              className="trigger-tests-btn"
              disabled={triggerTests.isPending}
            >
              Test Against Real API
            </button>
          ) : (
            <form onSubmit={handleAuthSubmit} className="auth-form">
              <div className="auth-inputs">
                <input
                  type="password"
                  placeholder="Cookies (session data)"
                  value={authConfig.cookies}
                  onChange={(e) => setAuthConfig(prev => ({ ...prev, cookies: e.target.value }))}
                  required
                />
                <input
                  type="text"
                  placeholder="App Key"
                  value={authConfig.appKey}
                  onChange={(e) => setAuthConfig(prev => ({ ...prev, appKey: e.target.value }))}
                  required
                />
              </div>
              <div className="auth-actions">
                <button type="submit" disabled={triggerTests.isPending}>
                  {triggerTests.isPending ? 'Starting...' : 'Start Tests'}
                </button>
                <button type="button" onClick={() => setShowAuthForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading test results...</p>
        </div>
      ) : testResults ? (
        <div className="test-results">
          <div className="test-summary">
            <div className="stat">
              <span className="stat-label">Total Queries</span>
              <span className="stat-value">{testResults.total}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Tested</span>
              <span className="stat-value">{testResults.tested}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Passed</span>
              <span className="stat-value success">{testResults.passed}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Failed</span>
              <span className="stat-value error">{testResults.failed}</span>
            </div>
          </div>

          <div className="test-details">
            {testResults.results.map((result, index) => (
              <div key={index} className={`test-item ${result.status}`}>
                <div className="test-info">
                  <span className="query-name">{result.queryName}</span>
                  <div className="test-badges">
                    <span className={`status-badge ${result.status}`}>
                      {result.status}
                    </span>
                    {result.baselineExists && (
                      <span className="baseline-badge">Baseline Available</span>
                    )}
                  </div>
                </div>
                
                {result.comparisonResult && (
                  <div className="comparison-details">
                    {result.comparisonResult.matches ? (
                      <span className="comparison-success">✓ Matches baseline</span>
                    ) : (
                      <details className="comparison-differences">
                        <summary className="comparison-warning">
                          ⚠ {result.comparisonResult.differences?.length || 0} differences found
                        </summary>
                        <div className="differences-list">
                          {result.comparisonResult.differences?.map((diff: any, i: number) => (
                            <div key={i} className="difference-item">
                              <strong>{diff.path}:</strong> {diff.description}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <p>No test results available. Trigger tests to see real API validation.</p>
        </div>
      )}
    </div>
  );
}