import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useQuery as useApolloQuery, gql } from '@apollo/client';
import DiffViewer from 'react-diff-viewer-continued';
import Modal from 'react-modal';
import { getBaselineComparisons } from '../services/api';
import type { ExtractedQuery, TransformationResult } from '@types/pgql.types';
import '../styles/query-diff-viewer.css';

Modal.setAppElement('#root');

interface QueryDiffViewerProps {
  queries: Array<{
    query: ExtractedQuery;
    transformation?: TransformationResult;
  }>;
}

export default function QueryDiffViewer({ queries }: QueryDiffViewerProps) {
  const [selectedQuery, setSelectedQuery] = useState<{
    query: ExtractedQuery;
    transformation?: TransformationResult;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<'transformation' | 'baseline' | 'validation'>('transformation');
  const [validationEnabled, setValidationEnabled] = useState(false);

  const { data: baselineComparisons } = useQuery({
    queryKey: ['baseline-comparisons', selectedQuery?.query.queryName],
    queryFn: () => getBaselineComparisons(selectedQuery!.query.queryName || ''),
    enabled: !!selectedQuery?.query.queryName && activeTab === 'baseline',
  });

  // GraphQL query validation using Apollo Client
  const { data: validationResult, error: validationError } = useApolloQuery(
    selectedQuery?.query.content ? gql(selectedQuery.query.content) : gql`query { __typename }`,
    {
      skip: !validationEnabled || !selectedQuery?.query.content || activeTab !== 'validation',
      errorPolicy: 'all', // Get validation errors without throwing
      fetchPolicy: 'no-cache', // Always validate fresh
    }
  );

  const handleCloseModal = () => {
    setSelectedQuery(null);
    setActiveTab('transformation');
    setValidationEnabled(false); // Reset validation state
  };

  const getStatusBadge = (query: ExtractedQuery) => {
    if (!query.isNested) return 'simple';
    if (query.fragments?.length) return 'fragments';
    if (query.hasVariables) return 'variables';
    return 'complex';
  };

  return (
    <div className="query-diff-viewer">
      <div className="query-table">
        <table>
          <thead>
            <tr>
              <th>Query Name</th>
              <th>File</th>
              <th>Type</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {queries.map((item, index) => (
              <tr key={index}>
                <td>{item.query.queryName || 'Anonymous'}</td>
                <td className="file-path">
                  {item.query.filePath}:{item.query.lineNumber}
                </td>
                <td>{item.query.operation}</td>
                <td>
                  <span className={`status-badge ${getStatusBadge(item.query)}`}>
                    {getStatusBadge(item.query)}
                  </span>
                </td>
                <td>
                  <button
                    className="view-diff-btn"
                    onClick={() => setSelectedQuery(item)}
                    disabled={!item.transformation}
                  >
                    {item.transformation ? 'View Diff' : 'Processing...'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={!!selectedQuery}
        onRequestClose={handleCloseModal}
        className="diff-modal"
        overlayClassName="diff-modal-overlay"
      >
        {selectedQuery && (
          <div className="diff-modal-content">
            <div className="modal-header">
              <h2>Query Analysis</h2>
              <div className="modal-tabs">
                <button 
                  className={`tab-btn ${activeTab === 'transformation' ? 'active' : ''}`}
                  onClick={() => setActiveTab('transformation')}
                >
                  Transformation
                </button>
                <button 
                  className={`tab-btn ${activeTab === 'baseline' ? 'active' : ''}`}
                  onClick={() => setActiveTab('baseline')}
                >
                  Baseline Comparison
                </button>
                <button 
                  className={`tab-btn ${activeTab === 'validation' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('validation');
                    setValidationEnabled(true);
                  }}
                >
                  GraphQL Validation
                </button>
              </div>
              <button className="close-btn" onClick={handleCloseModal}>×</button>
            </div>
            
            <div className="query-info">
              <p><strong>Query:</strong> {selectedQuery.query.queryName || 'Anonymous'}</p>
              <p><strong>File:</strong> {selectedQuery.query.filePath}:{selectedQuery.query.lineNumber}</p>
              {activeTab === 'transformation' && selectedQuery.transformation?.warnings && (
                <div className="warnings">
                  <h4>Warnings:</h4>
                  <ul>
                    {selectedQuery.transformation.warnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {activeTab === 'transformation' ? (
              <>
                <div className="diff-container">
                  <DiffViewer
                    oldValue={selectedQuery.query.content}
                    newValue={selectedQuery.transformation?.transformedQuery || selectedQuery.query.content}
                    splitView={true}
                    showDiffOnly={false}
                    leftTitle="Original Query"
                    rightTitle="Transformed Query"
                    styles={{
                      variables: {
                        light: {
                          diffViewerBackground: '#fafbfc',
                          diffViewerColor: '#24292e',
                          addedBackground: '#e6ffed',
                          addedColor: '#24292e',
                          removedBackground: '#ffeef0',
                          removedColor: '#24292e',
                          wordAddedBackground: '#acf2bd',
                          wordRemovedBackground: '#fdb8c0',
                          addedGutterBackground: '#cdffd8',
                          removedGutterBackground: '#ffdce0',
                          gutterBackground: '#fafbfc',
                          gutterBackgroundDark: '#f6f8fa',
                          highlightBackground: '#fffbdd',
                          highlightGutterBackground: '#fff5b1',
                        },
                      },
                    }}
                  />
                </div>

                {selectedQuery.transformation?.mappingCode && (
                  <div className="mapping-code">
                    <h3>Response Mapping Utility</h3>
                    <pre>{selectedQuery.transformation.mappingCode}</pre>
                  </div>
                )}
              </>
            ) : activeTab === 'baseline' ? (
              <div className="baseline-content">
                {baselineComparisons && baselineComparisons.length > 0 ? (
                  baselineComparisons.map((baseline, index) => (
                    <div key={index} className="baseline-comparison">
                      <h4>Baseline {index + 1}</h4>
                      {baseline.comparison ? (
                        <div className="comparison-result">
                          <div className={`comparison-status ${baseline.comparison.matches ? 'success' : 'warning'}`}>
                            {baseline.comparison.matches ? '✓ Matches baseline' : '⚠ Differences found'}
                          </div>
                          {!baseline.comparison.matches && (
                            <div className="baseline-diff">
                              <DiffViewer
                                oldValue={JSON.stringify(baseline.baseline, null, 2)}
                                newValue={JSON.stringify(baseline.response, null, 2)}
                                splitView={true}
                                showDiffOnly={true}
                                leftTitle="Baseline Response"
                                rightTitle="Current Response"
                                styles={{
                                  variables: {
                                    light: {
                                      diffViewerBackground: '#fafbfc',
                                      diffViewerColor: '#24292e',
                                      addedBackground: '#e6ffed',
                                      addedColor: '#24292e',
                                      removedBackground: '#ffeef0',
                                      removedColor: '#24292e',
                                    },
                                  },
                                }}
                              />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="baseline-only">
                          <h5>Baseline Response:</h5>
                          <pre>{JSON.stringify(baseline.baseline, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="no-baselines">
                    <p>No baseline comparisons available for this query.</p>
                    <p>Run real API tests to generate baselines.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="validation-content">
                <div className="validation-info">
                  <h3>GraphQL Query Validation</h3>
                  <p>Test query syntax and execution against the GraphQL schema using Apollo Client.</p>
                </div>
                
                {validationError ? (
                  <div className="validation-error">
                    <h4>❌ Validation Failed</h4>
                    <div className="error-details">
                      <strong>Error Type:</strong> {validationError.name}
                      <br />
                      <strong>Message:</strong> {validationError.message}
                      {validationError.graphQLErrors?.length > 0 && (
                        <div className="graphql-errors">
                          <h5>GraphQL Errors:</h5>
                          {validationError.graphQLErrors.map((error, index) => (
                            <div key={index} className="error-item">
                              <strong>Location:</strong> Line {error.locations?.[0]?.line}, Column {error.locations?.[0]?.column}
                              <br />
                              <strong>Message:</strong> {error.message}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : validationResult ? (
                  <div className="validation-success">
                    <h4>✅ Query is Valid</h4>
                    <p>The query passes GraphQL schema validation and can be executed.</p>
                    {validationResult && (
                      <div className="validation-preview">
                        <h5>Schema Response Preview:</h5>
                        <pre>{JSON.stringify(validationResult, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                ) : validationEnabled ? (
                  <div className="validation-loading">
                    <p>🔄 Validating query against schema...</p>
                  </div>
                ) : (
                  <div className="validation-disabled">
                    <p>Query validation not started. Switch to this tab to begin validation.</p>
                  </div>
                )}
                
                <div className="query-source">
                  <h4>Query Source:</h4>
                  <pre className="query-code">{selectedQuery.query.content}</pre>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}