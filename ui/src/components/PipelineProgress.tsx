import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import '../styles/pipeline-progress.css';

export interface PipelineStage {
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  progress?: number;
  message?: string;
}

const PIPELINE_STAGES: PipelineStage[] = [
  { name: 'Extraction', status: 'pending' },
  { name: 'Classification', status: 'pending' },
  { name: 'Validation', status: 'pending' },
  { name: 'Testing', status: 'pending' },
  { name: 'Transformation', status: 'pending' },
  { name: 'PR Generation', status: 'pending' },
];

interface PipelineProgressProps {
  socket?: Socket | null;
  isActive: boolean;
  currentStage?: string;
}

export default function PipelineProgress({ socket, isActive, currentStage: _currentStage }: PipelineProgressProps) {
  const [stages, setStages] = useState<PipelineStage[]>(PIPELINE_STAGES);

  useEffect(() => {
    if (!socket || !isActive) return;

    const handleStageUpdate = (data: { stage: string; status: PipelineStage['status']; progress?: number; message?: string }) => {
      setStages(prev => prev.map(stage => 
        stage.name.toLowerCase() === data.stage.toLowerCase()
          ? { ...stage, status: data.status, progress: data.progress, message: data.message }
          : stage
      ));
    };

    socket.on('pipeline:stage', handleStageUpdate);

    return () => {
      socket.off('pipeline:stage', handleStageUpdate);
    };
  }, [socket, isActive]);

  useEffect(() => {
    if (!isActive) {
      setStages(PIPELINE_STAGES);
    }
  }, [isActive]);

  const getStageIcon = (status: PipelineStage['status']) => {
    switch (status) {
      case 'completed':
        return '✓';
      case 'in_progress':
        return '⊙';
      case 'error':
        return '✗';
      default:
        return '○';
    }
  };

  const completedStages = stages.filter(s => s.status === 'completed').length;

  return (
    <div className="pipeline-progress" role="progressbar" aria-label="Pipeline progress" aria-valuenow={completedStages} aria-valuemin={0} aria-valuemax={stages.length}>
      <div className="pipeline-stages">
        {stages.map((stage, _index) => (
          <div key={stage.name} className={`pipeline-stage ${stage.status}`}>
            <div className="stage-connector" />
            <div className="stage-icon" aria-label={`${stage.name}: ${stage.status}`}>
              {getStageIcon(stage.status)}
            </div>
            <div className="stage-info">
              <h4>{stage.name}</h4>
              {stage.message && <p className="stage-message">{stage.message}</p>}
              {stage.progress !== undefined && stage.status === 'in_progress' && (
                <div className="stage-progress">
                  <div className="progress-bar" role="progressbar" aria-valuenow={stage.progress} aria-valuemin={0} aria-valuemax={100}>
                    <div 
                      className="progress-fill" 
                      style={{ width: `${stage.progress}%` }}
                    />
                  </div>
                  <span className="progress-text" aria-label={`${stage.name} progress: ${stage.progress}%`}>{stage.progress}%</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}