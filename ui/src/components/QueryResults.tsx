import { useQuery } from '@tanstack/react-query';
import QueryDiffViewer from './QueryDiffViewer';
import type { ExtractedQuery, TransformationResult } from '../types/api.types';
import '../styles/query-results.css';

interface QueryResultsProps {
  pipelineId?: string;
  isActive?: boolean;
}

interface QueryWithTransformation {
  query: ExtractedQuery;
  transformation?: TransformationResult;
}

export default function QueryResults({ pipelineId, isActive }: QueryResultsProps) {
  const { data: queries, isLoading, error } = useQuery({
    queryKey: ['pipeline-queries', pipelineId],
    queryFn: async (): Promise<QueryWithTransformation[]> => {
      if (!pipelineId) throw new Error('No pipeline ID');
      
      const response = await fetch(`/api/pipeline/${pipelineId}/queries`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch queries: ${response.status} ${errorText || 'Unknown error'}`);
      }
      
      const data = await response.json();
      
      // Validate response is an array
      if (!Array.isArray(data)) {
        throw new Error('Invalid response format: expected array of queries');
      }
      
      // Validate each query object
      return data.filter((item): item is QueryWithTransformation => {
        return item && 
               typeof item === 'object' && 
               'query' in item && 
               item.query &&
               typeof item.query === 'object' &&
               'queryName' in item.query &&
               'content' in item.query &&
               'filePath' in item.query;
      });
    },
    enabled: !!pipelineId,
    refetchInterval: isActive ? 5000 : false, // Only poll while pipeline is active
    staleTime: Infinity, // Keep data fresh forever once fetched
    gcTime: Infinity, // Never garbage collect (v5 renamed from cacheTime)
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnReconnect: false, // Don't refetch on reconnect
  });

  if (!pipelineId) {
    return (
      <div className="query-results">
        <div className="empty-state">
          <p>Query results will appear here after pipeline starts</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="query-results">
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading queries...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="query-results">
        <div className="error-state">
          <p>Error loading queries: {error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="query-results">
      <div className="results-header">
        <h3>Extracted Queries</h3>
        <div className="results-stats">
          <span>Total: {Array.isArray(queries) ? queries.length : 0}</span>
          <span>Transformed: {Array.isArray(queries) ? queries.filter(q => q.transformation).length : 0}</span>
        </div>
      </div>
      {queries && Array.isArray(queries) && queries.length > 0 ? (
        <QueryDiffViewer queries={queries} />
      ) : (
        <div className="empty-state">
          <p>No queries found yet. They will appear as the extraction progresses.</p>
        </div>
      )}
    </div>
  );
}