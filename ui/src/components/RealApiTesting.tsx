import { useState, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { getRealApiTestResults, triggerRealApiTests } from '../services/api';
import type { DifferenceDetail } from '../types/api.types';
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
  // Use refs to store auth data to avoid exposing in React DevTools
  const authConfigRef = useRef<AuthConfig>({
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
    mutationFn: () => triggerRealApiTests(pipelineId!, authConfigRef.current),
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
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    
    const cookies = formData.get('cookies') as string;
    const appKey = formData.get('appKey') as string;
    
    if (!cookies || !appKey) {
      toast.error('Both cookies and app key are required');
      return;
    }
    
    // Store in ref to avoid React DevTools exposure
    authConfigRef.current = { cookies, appKey };
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
            <form onSubmit={handleAuthSubmit} className="auth-form" aria-label="Authentication form for real API testing">
              <div className="auth-inputs">
                <input
                  type="password"
                  name="cookies"
                  placeholder="Cookies (session data)"
                  aria-label="Authentication cookies"
                  autoComplete="off"
                  required
                />
                <input
                  type="password"
                  name="appKey"
                  placeholder="App Key"
                  aria-label="Application key"
                  autoComplete="off"
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
        <div className="loading-state" role="status" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
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
            {testResults.results?.map((result, index) => (
              <div key={index} className={`test-item ${result.status}`}>
                <div className="test-info">
                  <span className="query-name">{result.queryName}</span>
                  <div className="test-badges">
                    <span className={`status-badge ${result.status}`} role="status" aria-label={`Test status: ${result.status}`}>
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
                          {result.comparisonResult.differences?.map((diff: DifferenceDetail, i: number) => (
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