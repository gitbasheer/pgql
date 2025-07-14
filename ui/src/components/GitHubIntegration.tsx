import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import '../styles/github-integration.css';

interface GitHubIntegrationProps {
  onRepoCloned: (path: string) => void;
}

export default function GitHubIntegration({ onRepoCloned }: GitHubIntegrationProps) {
  const [repoUrl, setRepoUrl] = useState('');
  const [showCloneDialog, setShowCloneDialog] = useState(false);

  const cloneRepo = useMutation({
    mutationFn: async (url: string) => {
      const response = await fetch('/api/github/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: url }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to clone repository');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast.success('Repository cloned successfully!');
      onRepoCloned(data.localPath);
      setShowCloneDialog(false);
      setRepoUrl('');
    },
    onError: (error: Error) => {
      toast.error(`Failed to clone repository: ${error.message}`);
    },
  });

  const handleClone = (e: React.FormEvent) => {
    e.preventDefault();
    if (repoUrl) {
      cloneRepo.mutate(repoUrl);
    }
  };

  return (
    <div className="github-integration">
      <button 
        type="button"
        className="github-btn"
        onClick={() => setShowCloneDialog(true)}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path fillRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        Clone from GitHub
      </button>

      {showCloneDialog && createPortal(
        <div className="clone-dialog-overlay" onClick={() => setShowCloneDialog(false)}>
          <div className="clone-dialog" role="dialog" aria-labelledby="clone-dialog-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="clone-dialog-title">Clone GitHub Repository</h3>
            <form onSubmit={handleClone}>
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                required
                autoFocus
              />
              <div className="dialog-actions">
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setShowCloneDialog(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={cloneRepo.isPending}
                >
                  {cloneRepo.isPending ? 'Cloning...' : 'Clone'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}