import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Button } from '../common/SoftUI';

export default function SupportDialog({ type, payload }) {
  const { closeModal, replyToTicket, reports } = useApp();
  const navigate = useNavigate();
  const ticket = reports.find((report) => report.id === payload.ticket?.id) || payload.ticket;
  const [reply, setReply] = useState(ticket?.teamReply?.userReply || 'Saya akan mencoba langkah tersebut.');
  const back = () => { closeModal(); navigate('/app/bantuan/laporan'); };
  if (type === 'laporan-berhasil') return <><h2>Laporan berhasil dikirim</h2><p>Laporan kendala telah berhasil disimpan dan diteruskan ke tim teknis BUNGKOK.</p><div className="dialog-stack"><div className="data-pair"><span>Nomor tiket</span><strong>{ticket.id}</strong></div><div className="data-pair"><span>Status</span><strong>{ticket.status}</strong></div><p>{ticket.date} · {ticket.title}</p><p>Lihat perkembangan penanganannya di Laporan Saya.</p></div><div className="dialog-actions"><Button primary onClick={back}>Lihat laporan saya</Button></div></>;
  if (type === 'balasan-terkirim') return <><h2>Balasan terkirim</h2><p>Balasanmu ditambahkan ke tiket {payload.ticketId}. Status tetap Ditangani.</p><div className="dialog-actions"><Button primary onClick={back}>Kembali ke laporan</Button></div></>;
  return <><h2>Tiket {ticket.id}</h2><p>{ticket.title} · {ticket.date}</p><div className="dialog-stack"><span className="soft-tag">{ticket.status}</span>{ticket.teamReply ? <><strong>Tim BUNGKOK · {ticket.teamReply.date}</strong><p>{ticket.teamReply.message}</p><label className="form-field">Balasan<textarea value={reply} onChange={(event) => setReply(event.target.value)} /></label></> : <p>Laporan diterima. Tim belum memberikan tanggapan. Pembaruan status akan muncul di halaman ini.</p>}</div><div className="dialog-actions">{ticket.teamReply && <Button primary disabled={!reply.trim()} onClick={() => replyToTicket(ticket.id, reply.trim())}>Kirim balasan</Button>}<Button onClick={closeModal}>Tutup</Button></div></>;
}
