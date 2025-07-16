import '../styles/loading-overlay.css';

interface LoadingOverlayProps {
  isLoading: boolean;
  message?: string;
}

export default function LoadingOverlay({
  isLoading,
  message = 'Loading...',
}: LoadingOverlayProps) {
  if (!isLoading) return null;

  return (
    <div className="loading-overlay">
      <div className="loading-content">
        <div className="loading-spinner" />
        <p>{message}</p>
      </div>
    </div>
  );
}
