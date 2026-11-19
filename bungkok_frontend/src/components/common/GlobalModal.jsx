import { useApp } from '../../context/AppContext';
import { useRef } from 'react';
import Dialog from './Dialog';
import ChallengeDialog from '../dialogs/ChallengeDialog';
import RewardDialog from '../dialogs/RewardDialog';
import SettingsDialog from '../dialogs/SettingsDialog';
import SupportDialog from '../dialogs/SupportDialog';

const groups = [
  [ChallengeDialog, ['tantangan-detail', 'tantangan-konfirmasi', 'bergabung-sukses', 'badge-detail']],
  [RewardDialog, ['frame-preview', 'tukar-konfirmasi', 'hadiah-berhasil', 'poin-kurang', 'saldo-tersedia']],
  [SupportDialog, ['laporan-berhasil', 'tiket-detail-diterima', 'tiket-detail-ditangani', 'balasan-terkirim']],
];

export default function GlobalModal() {
  const { activeModal, closeModal } = useApp();
  const closeRequest = useRef(null);
  if (!activeModal) return null;
  const { type, payload } = activeModal;
  const Content = groups.find(([, types]) => types.includes(type))?.[0] || SettingsDialog;
  return <Dialog key={type} title="Dialog Bungkok" onClose={() => closeRequest.current ? closeRequest.current() : closeModal()}><Content type={type} payload={payload} closeRequest={closeRequest} /></Dialog>;
}
