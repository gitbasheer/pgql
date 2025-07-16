import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useQuery as useApolloQuery, gql } from '@apollo/client';
import DiffViewer from 'react-diff-viewer-continued';
import Modal from 'react-modal';
import { getBaselineComparisons } from '../services/api';
import { constructAuthCookies } from '../utils/auth';
import type {
  ExtractedQuery,
  TransformationResult,
  CohortResponse,
} from '../types/api.types';
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
  const [activeTab, setActiveTab] = useState<
    'transformation' | 'baseline' | 'validation'
  >('transformation');
  const [validationEnabled, setValidationEnabled] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('queryTableColumns');
    return saved
      ? JSON.parse(saved)
      : {
          queryName: true,
          file: true,
          type: true,
          endpoint: true,
          status: true,
          changes: true,
          actions: true,
        };
  });
  const [showColumnDropdown, setShowColumnDropdown] = useState(false);

  // Save column preferences
  useEffect(() => {
    localStorage.setItem('queryTableColumns', JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.column-dropdown')) {
        setShowColumnDropdown(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const { data: baselineComparisons } = useQuery({
    queryKey: ['baseline-comparisons', selectedQuery?.query.queryName],
    queryFn: () => getBaselineComparisons(selectedQuery!.query.queryName || ''),
    enabled: !!selectedQuery?.query.queryName && activeTab === 'baseline',
  });

  // Hivemind cohort fetch using Apollo
  const GET_COHORT = gql`
    query GetCohort($queryId: String!, $cohortType: String!) {
      getCohort(queryId: $queryId, cohortType: $cohortType) {
        cohortId
        experimentName
        variant
        confidence
        metrics {
          successRate
          responseTime
          errorCount
        }
      }
    }
  `;

  const { data: cohortData } = useApolloQuery(GET_COHORT, {
    variables: {
      queryId: selectedQuery?.query.queryName || '',
      cohortType: 'new-queries',
    },
    skip: !selectedQuery?.query.queryName,
    context: {
      headers: {
        Cookie: constructAuthCookies(),
      },
    },
    errorPolicy: 'ignore',
  });

  const getCohortId = useCallback(
    (response: CohortResponse, _cohortType: string) => {
      if (!response?.data?.getCohort) return 'Unknown';
      return response.data.getCohort.cohortId || 'Unknown';
    },
    []
  );

  // GraphQL query validation using Apollo Client
  let validationQuery;
  try {
    validationQuery = selectedQuery?.query.content
      ? gql(selectedQuery.query.content)
      : gql`
          query {
            __typename
          }
        `;
  } catch (error) {
    console.error('Failed to parse GraphQL query:', error);
    validationQuery = gql`
      query {
        __typename
      }
    `;
  }

  const { data: validationResult, error: validationError } = useApolloQuery(
    validationQuery,
    {
      skip:
        !validationEnabled ||
        !selectedQuery?.query.content ||
        activeTab !== 'validation',
      errorPolicy: 'all', // Get validation errors without throwing
      fetchPolicy: 'no-cache', // Always validate fresh
    }
  );

  const handleCloseModal = () => {
    setSelectedQuery(null);
    setActiveTab('transformation');
    setValidationEnabled(false); // Reset validation state
  };

  const filteredQueries = queries.filter((item) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      item.query.queryName?.toLowerCase().includes(searchLower) ||
      item.query.filePath?.toLowerCase().includes(searchLower) ||
      item.query.operation?.toLowerCase().includes(searchLower)
    );
  });

  const toggleColumn = (column: string) => {
    setVisibleColumns((prev: typeof visibleColumns) => ({
      ...prev,
      [column]: !prev[column as keyof typeof prev],
    }));
  };

  return (
    <div className="query-diff-viewer">
      <div className="column-controls">
        <div className="column-dropdown">
          <button
            className="column-dropdown-btn"
            onClick={() => setShowColumnDropdown(!showColumnDropdown)}
          >
            COLUMNS ▼
          </button>
          <div
            className={`column-dropdown-content ${showColumnDropdown ? 'show' : ''}`}
          >
            <label>
              <input
                type="checkbox"
                checked={visibleColumns.queryName}
                onChange={() => toggleColumn('queryName')}
              />
              QUERY NAME
            </label>
            <label>
              <input
                type="checkbox"
                checked={visibleColumns.file}
                onChange={() => toggleColumn('file')}
              />
              FILE PATH
            </label>
            <label>
              <input
                type="checkbox"
                checked={visibleColumns.type}
                onChange={() => toggleColumn('type')}
              />
              TYPE
            </label>
            <label>
              <input
                type="checkbox"
                checked={visibleColumns.endpoint}
                onChange={() => toggleColumn('endpoint')}
              />
              ENDPOINT
            </label>
            <label>
              <input
                type="checkbox"
                checked={visibleColumns.status}
                onChange={() => toggleColumn('status')}
              />
              STATUS
            </label>
            <label>
              <input
                type="checkbox"
                checked={visibleColumns.changes}
                onChange={() => toggleColumn('changes')}
              />
              CHANGES
            </label>
            <label>
              <input
                type="checkbox"
                checked={visibleColumns.actions}
                onChange={() => toggleColumn('actions')}
              />
              ACTIONS
            </label>
          </div>
        </div>
        <input
          type="text"
          className="search-box"
          placeholder="SEARCH QUERIES..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      <div className="queries-grid">
        {filteredQueries.map((item, index) => (
          <div key={index} className="query-card">
            <div className="query-card-header">
              <h4 className="query-name">
                {item.query.queryName || 'Anonymous'}
              </h4>
            </div>
            <div className="query-card-body">
              <div className="query-details">
                {visibleColumns.file && (
                  <div className="detail-row">
                    <span className="detail-label">FILE:</span>
                    <span className="detail-value">
                      {item.query.filePath}:{item.query.lineNumber}
                    </span>
                  </div>
                )}
                {visibleColumns.type && (
                  <div className="detail-row">
                    <span className="detail-label">TYPE:</span>
                    <span className="detail-value">
                      {item.query.operation || 'query'}
                    </span>
                  </div>
                )}
                {visibleColumns.endpoint && (
                  <div className="detail-row">
                    <span className="detail-label">ENDPOINT:</span>
                    <span className="detail-value">
                      {item.query.endpoint || 'productGraph'}
                    </span>
                  </div>
                )}
                {visibleColumns.status && (
                  <div className="detail-row">
                    <span className="detail-label">STATUS:</span>
                    <span
                      className={`status-badge ${item.transformation ? 'transformed' : 'validated'}`}
                    >
                      {item.transformation ? 'TRANSFORMED' : 'VALIDATED'}
                    </span>
                  </div>
                )}
                {visibleColumns.changes && (
                  <div className="detail-row">
                    <span className="detail-label">CHANGES:</span>
                    <span className="detail-value">
                      {item.transformation?.changes?.length || '0'}
                    </span>
                  </div>
                )}
              </div>
              {visibleColumns.actions && (
                <div className="query-actions">
                  <button
                    className="view-diff-btn"
                    onClick={() => setSelectedQuery(item)}
                    disabled={!item.transformation}
                  >
                    {item.transformation ? 'VIEW DIFF' : 'NO CHANGES'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
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
              <button className="close-btn" onClick={handleCloseModal}>
                ×
              </button>
            </div>

            <div className="query-info">
              <p>
                <strong>Query:</strong>{' '}
                {selectedQuery.query.queryName || 'Anonymous'}
              </p>
              <p>
                <strong>File:</strong> {selectedQuery.query.filePath}:
                {selectedQuery.query.lineNumber}
              </p>
              <p>
                <strong>A/B Cohort:</strong>{' '}
                {getCohortId(cohortData, 'new-queries')}
              </p>
              {cohortData?.getCohort && (
                <div className="cohort-details">
                  <p>
                    <strong>Experiment:</strong>{' '}
                    {cohortData.getCohort.experimentName || 'N/A'}
                  </p>
                  <p>
                    <strong>Variant:</strong>{' '}
                    {cohortData.getCohort.variant || 'N/A'}
                  </p>
                  <p>
                    <strong>Confidence:</strong>{' '}
                    {cohortData.getCohort.confidence || 'N/A'}%
                  </p>
                  {cohortData.getCohort.metrics && (
                    <div className="cohort-metrics">
                      <small>
                        Success Rate:{' '}
                        {cohortData.getCohort.metrics.successRate || 'N/A'}% |
                        Response Time:{' '}
                        {cohortData.getCohort.metrics.responseTime || 'N/A'}ms |
                        Errors: {cohortData.getCohort.metrics.errorCount || 0}
                      </small>
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'transformation' &&
                selectedQuery.transformation?.warnings && (
                  <div className="warnings">
                    <h4>Warnings:</h4>
                    <ul>
                      {selectedQuery.transformation.warnings.map(
                        (warning, i) => (
                          <li key={i}>{warning}</li>
                        )
                      )}
                    </ul>
                  </div>
                )}
            </div>

            {activeTab === 'transformation' ? (
              <>
                <div className="diff-container">
                  {/* Full Before */}
                  <div className="diff-section">
                    <h3>ORIGINAL QUERY</h3>
                    <pre className="code-block before">
                      {selectedQuery.transformation?.originalQuery ||
                        selectedQuery.query.content ||
                        ''}
                    </pre>
                  </div>

                  {/* Full After */}
                  <div className="diff-section">
                    <h3>TRANSFORMED QUERY</h3>
                    <pre className="code-block after">
                      {selectedQuery.transformation?.transformedQuery ||
                        selectedQuery.query.content ||
                        ''}
                    </pre>
                  </div>

                  {/* Line by Line Diff */}
                  <div className="diff-section">
                    <h3>CHANGES</h3>
                    <DiffViewer
                      oldValue={
                        selectedQuery.transformation?.originalQuery ||
                        selectedQuery.query.content ||
                        ''
                      }
                      newValue={
                        selectedQuery.transformation?.transformedQuery ||
                        selectedQuery.query.content ||
                        ''
                      }
                      splitView={false}
                      showDiffOnly={false}
                      leftTitle=""
                      rightTitle=""
                      hideLineNumbers={false}
                      styles={{
                        variables: {
                          dark: {
                            diffViewerBackground: '#050505',
                            diffViewerColor: '#00ff88',
                            addedBackground: '#00ff8820',
                            addedColor: '#00ff88',
                            removedBackground: '#ff444420',
                            removedColor: '#ff4444',
                            wordAddedBackground: '#00ff8840',
                            wordRemovedBackground: '#ff444440',
                            addedGutterBackground: '#00ff8820',
                            removedGutterBackground: '#ff444420',
                            gutterBackground: '#0a0a0a',
                            gutterBackgroundDark: '#050505',
                            highlightBackground: '#00ff8810',
                            highlightGutterBackground: '#00ff8820',
                            codeFoldGutterBackground: '#0a0a0a',
                            codeFoldBackground: '#00ff8810',
                          },
                        },
                      }}
                      useDarkTheme={true}
                    />
                  </div>
                </div>

                {selectedQuery.transformation?.mappingCode && (
                  <div className="mapping-code">
                    <h3>RESPONSE MAPPING UTILITY</h3>
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
                          <div
                            className={`comparison-status ${baseline.comparison.matches ? 'success' : 'warning'}`}
                          >
                            {baseline.comparison.matches
                              ? '✓ Matches baseline'
                              : '⚠ Differences found'}
                          </div>
                          {!baseline.comparison.matches && (
                            <div className="baseline-diff">
                              <DiffViewer
                                oldValue={JSON.stringify(
                                  baseline.baseline,
                                  null,
                                  2
                                )}
                                newValue={JSON.stringify(
                                  baseline.response,
                                  null,
                                  2
                                )}
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
                          <pre>
                            {JSON.stringify(baseline.baseline, null, 2)}
                          </pre>
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
                  <p>
                    Test query syntax and execution against the GraphQL schema
                    using Apollo Client.
                  </p>
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
                              <strong>Location:</strong> Line{' '}
                              {error.locations?.[0]?.line}, Column{' '}
                              {error.locations?.[0]?.column}
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
                    <p>
                      The query passes GraphQL schema validation and can be
                      executed.
                    </p>
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
                    <p>
                      Query validation not started. Switch to this tab to begin
                      validation.
                    </p>
                  </div>
                )}

                <div className="query-source">
                  <h4>Query Source:</h4>
                  <pre className="query-code">
                    {selectedQuery.query.content}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
