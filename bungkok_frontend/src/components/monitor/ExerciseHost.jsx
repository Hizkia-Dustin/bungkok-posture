import { useRef } from 'react';
import Dialog from '../common/Dialog';
import StartExerciseModal from '../dialogs/StartExerciseModal';
import { usePostureMonitor } from '../../context/PostureMonitorContext';

export default function ExerciseHost() {
  const { mounted, isOpen } = usePostureMonitor();
  const closeRequest = useRef(null);
  if (!mounted) return null;
  return <Dialog visible={isOpen} title="Latihan postur" className="exercise-dialog" onClose={() => closeRequest.current?.()}>
    <StartExerciseModal closeRequest={closeRequest} />
  </Dialog>;
}
