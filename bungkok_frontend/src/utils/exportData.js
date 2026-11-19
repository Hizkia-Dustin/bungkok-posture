export function downloadAccountData({ user, sessions, pointsHistory }) {
  const cell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = [
    ['Bagian', 'Tanggal', 'Keterangan', 'Nilai'],
    ['Profil', '', 'Nama', user.name], ['Profil', '', 'Email', user.email],
    ['Preferensi', '', 'Target durasi', user.targetDuration],
    ['Preferensi', '', 'Volume pengingat', user.reminderVolume],
    ...sessions.map((session) => ['Latihan', session.fullDate, `${session.timeRange}; valid ${session.validDuration}; tegak ${session.uprightPercentage}%`, session.pointsEarned]),
    ...pointsHistory.map((entry) => ['Poin', entry.date, entry.activity, entry.change]),
  ];
  const blob = new Blob(['\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n')], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'bungkok-data.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function playReminder(volume = 60, reminder = {}) {
  if (reminder.mode !== 'tone' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      reminder.message || 'Badan kamu mulai bungkuk. Yuk, tegakkan posturmu.'
    );
    utterance.lang = reminder.language || 'id-ID';
    utterance.rate = reminder.rate || 1;
    utterance.volume = Math.min(1, Math.max(0, volume / 100));
    window.speechSynthesis.speak(utterance);
    return;
  }
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) throw new Error('Browser ini belum mendukung pemutaran suara.');
  const audio = new AudioContext();
  await audio.resume();
  const tone = audio.createOscillator();
  const gain = audio.createGain();
  tone.type = 'sine';
  tone.frequency.setValueAtTime(660, audio.currentTime);
  tone.frequency.setValueAtTime(880, audio.currentTime + .16);
  gain.gain.setValueAtTime(0, audio.currentTime);
  gain.gain.linearRampToValueAtTime(volume / 100 * .18, audio.currentTime + .03);
  gain.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + .5);
  tone.connect(gain).connect(audio.destination);
  tone.start();
  tone.stop(audio.currentTime + .5);
  tone.onended = () => audio.close();
}
