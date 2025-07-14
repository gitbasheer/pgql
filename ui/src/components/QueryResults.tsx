import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import QueryDiffViewer from './QueryDiffViewer';
import type { ExtractedQuery, TransformationResult } from '@types/pgql.types';
import '../styles/query-results.css';

interface QueryResultsProps {
  pipelineId?: string;
  isActive: boolean;
}

interface QueryWithTransformation {
  query: ExtractedQuery;
  transformation?: TransformationResult;
}

export default function QueryResults({ pipelineId, isActive }: QueryResultsProps) {
  const { data: queries, isLoading, error } = useQuery<QueryWithTransformation[]>({
    queryKey: ['pipeline-queries', pipelineId],
    queryFn: async () => {
      if (!pipelineId) throw new Error('No pipeline ID');
      
      const response = await fetch(`/api/pipeline/${pipelineId}/queries`);
      if (!response.ok) {
        throw new Error('Failed to fetch queries');
      }
      
      return response.json();
    },
    enabled: !!pipelineId && isActive,
    refetchInterval: 5000, // Poll every 5 seconds while active
    onError: (error: Error) => {
      toast.error(`Failed to load queries: ${error.message}`);
    },
  });

  if (!isActive || !pipelineId) {
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
          <span>Total: {queries?.length || 0}</span>
          <span>Transformed: {queries?.filter(q => q.transformation).length || 0}</span>
        </div>
      </div>
      {queries && queries.length > 0 ? (
        <QueryDiffViewer queries={queries} />
      ) : (
        <div className="empty-state">
          <p>No queries found yet. They will appear as the extraction progresses.</p>
        </div>
      )}
    </div>
  );
}