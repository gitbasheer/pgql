import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  const [activeTab, setActiveTab] = useState<'transformation' | 'baseline'>('transformation');

  const { data: baselineComparisons } = useQuery({
    queryKey: ['baseline-comparisons', selectedQuery?.query.queryName],
    queryFn: () => getBaselineComparisons(selectedQuery!.query.queryName || ''),
    enabled: !!selectedQuery?.query.queryName && activeTab === 'baseline',
  });

  const handleCloseModal = () => {
    setSelectedQuery(null);
    setActiveTab('transformation');
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
            ) : (
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
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}