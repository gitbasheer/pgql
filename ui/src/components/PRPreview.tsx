import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import DiffViewer from 'react-diff-viewer-continued';
import '../styles/pr-preview.css';

interface PRPreviewProps {
  pipelineId?: string;
  isActive: boolean;
}

export default function PRPreview({ pipelineId, isActive }: PRPreviewProps) {
  const [prDiff, setPrDiff] = useState<string>('');
  const [prUrl, setPrUrl] = useState<string>('');
  const [showPreview, setShowPreview] = useState(false);

  const generatePR = useMutation({
    mutationFn: async () => {
      if (!pipelineId) throw new Error('No pipeline ID');

      const response = await fetch(`/api/pipeline/${pipelineId}/generate-pr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to generate PR');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setPrDiff(data.diff);
      setPrUrl(data.prUrl);
      setShowPreview(true);
      toast.success('Pull request generated successfully!');
    },
    onError: (error: Error) => {
      toast.error(`Failed to generate PR: ${error.message}`);
    },
  });

  if (!isActive || !pipelineId) {
    return (
      <div className="pr-preview">
        <h3>Pull Request Preview</h3>
        <div className="empty-state">
          <p>Pull request will be available after pipeline completes</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pr-preview">
      <h3>Pull Request Preview</h3>
      <div className="pr-actions">
        <button
          onClick={() => generatePR.mutate()}
          disabled={generatePR.isPending}
          className="generate-pr-btn"
        >
          {generatePR.isPending ? 'Generating PR...' : 'Generate Pull Request'}
        </button>
        {prUrl && (
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="view-pr-link"
          >
            View on GitHub →
          </a>
        )}
      </div>

      {showPreview && prDiff && (
        <div className="pr-diff-container">
          <div className="diff-wrapper">
            <DiffViewer
              oldValue=""
              newValue={prDiff}
              splitView={false}
              showDiffOnly={false}
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
        </div>
      )}
    </div>
  );
}