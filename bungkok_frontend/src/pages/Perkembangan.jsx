import { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Button,
  Card,
  Distribution,
  EmptyState,
  PageHeader,
  Progress,
  Stat,
  Tabs,
  WeekChart,
} from '../components/common/SoftUI';
import { sessionWeek } from '../utils/exercise';

export default function Perkembangan() {
  const { hasData, sessions } = useApp();
  const [tab, setTab] = useState('mingguan');
  const [selectedSessionId, setSelectedSessionId] = useState('');

  // Active session for daily view
  const activeSession =
    sessions.find((item) => item.id === selectedSessionId) || sessions[0];

  // Dynamically calculate weekly metrics from real sessions
  const week = sessionWeek(sessions);
  const totalMinutes = Math.round(week.reduce((sum, d) => sum + d.value, 0) * 10) / 10;
  const activeDays = week.filter((d) => d.value > 0).length;

  const validSessions = sessions.filter((s) => s.uprightPercentage !== undefined);
  const avgUpright =
    validSessions.length > 0
      ? Math.round(
          validSessions.reduce((sum, s) => sum + s.uprightPercentage, 0) /
            validSessions.length
        )
      : 0;

  const totalUprightMinutes =
    Math.round(
      validSessions.reduce((sum, s) => {
        const up =
          parseFloat(s.uprightDuration) ||
          ((s.uprightPercentage || 0) / 100) * (parseFloat(s.validDuration) || 0);
        return sum + up;
      }, 0) * 10
    ) / 10;

  const totalForwardMinutes = Math.max(
    0,
    Math.round((totalMinutes - totalUprightMinutes) * 10) / 10
  );
  const forwardPercent =
    totalMinutes > 0 ? Math.round((totalForwardMinutes / totalMinutes) * 100) : 0;

  const dateRangeLabel = `${week[0]?.day || 'Sen'} – ${week[6]?.day || 'Min'} · minggu berjalan`;

  return (
    <div className="app-page">
      <PageHeader
        title="Perkembangan"
        subtitle="Kenali ritme latihan dan peningkatan posturmu dari hari ke hari."
      />

      {!hasData || !sessions.length ? (
        <EmptyState title="Belum cukup data untuk melihat pola.">
          Selesaikan latihan pada beberapa hari berbeda. Grafik akan terisi dari hasil
          latihanmu; data tersimpan langsung di database.
        </EmptyState>
      ) : (
        <>
          <div className="soft-tabs">
            <Tabs
              items={[
                ['mingguan', 'Mingguan'],
                ['harian', 'Harian'],
              ]}
              value={tab}
              onChange={setTab}
              label="Rentang perkembangan"
            />
            {tab === 'mingguan' ? (
              <span className="soft-button">{dateRangeLabel}</span>
            ) : (
              <select
                className="soft-button"
                aria-label="Tanggal perkembangan"
                value={selectedSessionId || activeSession?.id}
                onChange={(event) => setSelectedSessionId(event.target.value)}
              >
                {sessions.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.fullDate || item.date} · {item.time || item.timeRange}
                  </option>
                ))}
              </select>
            )}
          </div>

          {tab === 'mingguan' ? (
            <>
              {/* Row 1: Weekly chart & consistency */}
              <div className="app-grid grid-main-side">
                <Card className="stack">
                  <h3>Ritme latihan minggu ini</h3>
                  <small>
                    {totalMinutes} menit valid · {activeDays} hari aktif
                  </small>
                  <WeekChart data={week} />
                  <small>0–30 menit · Hari tanpa sesi ditampilkan sebagai nol.</small>
                </Card>

                <Card sky className="stack">
                  <span className="soft-tag">Konsistensi minggu ini</span>
                  <strong style={{ fontSize: 40 }}>{activeDays} dari 7</strong>
                  <p>hari mencatat latihan aktif</p>
                  <Progress value={activeDays} max={7} label="Hari aktif" />
                  <p>
                    {activeDays >= 3
                      ? 'Konsistensi luar biasa! Mempertahankan ritme latihan membangun kebiasaan tulang belakang yang sehat.'
                      : 'Lakukan sesi berkala setiap hari untuk membentuk kebiasaan postur yang ergonomis.'}
                  </p>
                  <Button to="/app/riwayat">Lihat riwayat latihan</Button>
                </Card>
              </div>

              {/* Row 2: Posture Line & Distribution */}
              <div className="app-grid grid-two">
                <Card className="stack">
                  <h3>Persentase waktu tegak rata-rata</h3>
                  <small>{avgUpright}% kepatuhan tegak pada sesi tercatat</small>
                  <div
                    className="posture-line-chart"
                    role="img"
                    aria-label={`Rata-rata waktu tegak ${avgUpright} persen`}
                  >
                    <span>100%</span>
                    <span>50%</span>
                    <span>0%</span>
                    <i style={{ top: `${Math.max(10, 100 - avgUpright)}%` }} />
                    <b style={{ top: `calc(${Math.max(10, 100 - avgUpright)}% - 3px)` }} />
                  </div>
                  <small>
                    Skala 0–100% · {week[0]?.day} s/d {week[6]?.day}
                  </small>
                </Card>

                <Card sky className="stack">
                  <h3>Dari {totalMinutes} menit yang terbaca</h3>
                  <Distribution
                    session={{
                      uprightDuration: `${totalUprightMinutes} m`,
                      uprightPercentage: avgUpright,
                      forwardLean: `${totalForwardMinutes} m · ${forwardPercent}%`,
                      backwardLean: '0 m · 0%',
                    }}
                  />
                  <small>Data sesi real-time. Engine AI MediaPipe 3D V3.</small>
                </Card>
              </div>
            </>
          ) : (
            <>
              {/* Harian View */}
              {activeSession && (
                <>
                  <div className="app-grid grid-three">
                    <Stat
                      sky
                      label="Waktu valid sesi ini"
                      value={activeSession.validDuration}
                      note="Postur berhasil terbaca AI"
                    />
                    <Stat
                      label="Waktu tegak"
                      value={`${activeSession.uprightPercentage}%`}
                      note={`${activeSession.uprightDuration} dari waktu valid`}
                    />
                    <Stat
                      label="Poin sesi"
                      value={`+${activeSession.pointsEarned}`}
                      note="Tersimpan di akun"
                    />
                  </div>

                  <div className="app-grid grid-main-side">
                    <Card className="stack">
                      <h3>Ringkasan harian: {activeSession.fullDate}</h3>
                      <Distribution session={activeSession} />
                      <hr className="soft-rule" />
                      <div className="data-pair">
                        <span>Jeda / tidak terpantau</span>
                        <strong>
                          {activeSession.pauseDuration} / {activeSession.unmonitoredDuration}
                        </strong>
                      </div>
                      <Button to={`/app/riwayat/${activeSession.id}`}>
                        Lihat detail sesi
                      </Button>
                    </Card>

                    <Card sky className="stack">
                      <h3>Setiap langkah berarti.</h3>
                      <p>
                        Jeda tetap bagian latihan. Tidak perlu menahan satu posisi secara kaku,
                        lakukan peregangan saat notifikasi muncul.
                      </p>
                      <Button to="/app/riwayat">Lihat riwayat latihan</Button>
                    </Card>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
