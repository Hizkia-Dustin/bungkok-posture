export const minuteLabel = (seconds) => `${Math.round(seconds / 6) / 10}m`;
export const clockLabel = (seconds) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
export const dayKey = (date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

export function buildSession(metrics, startedAt, config, id) {
  const date = new Date(startedAt);
  const end = new Date(date.getTime() + metrics.total * 1000);
  const format = (options) =>
    new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", ...options });
  const valid = metrics.upright + metrics.forward + metrics.backward;
  const monitored = metrics.total - metrics.paused;
  const coverage = monitored > 0 ? Math.round((valid / monitored) * 100) : 0;
  const eligible = valid >= 300 && coverage >= 70;
  return {
    id,
    dateKey: dayKey(date),
    startedAt: date.toISOString(),
    date: format({ day: "numeric", month: "short" }).format(date),
    fullDate: format({
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date),
    time: format({ hour: "2-digit", minute: "2-digit" }).format(date),
    timeRange: `${format({ hour: "2-digit", minute: "2-digit" }).format(date)}–${format({ hour: "2-digit", minute: "2-digit" }).format(end)} WIB`,
    totalDuration: minuteLabel(metrics.total),
    validDuration: minuteLabel(valid),
    validSeconds: valid,
    uprightDuration: minuteLabel(metrics.upright),
    uprightSeconds: metrics.upright,
    longestUprightSeconds: metrics.longestUpright || 0,
    uprightPercentage: valid ? Math.round((metrics.upright / valid) * 100) : 0,
    forwardLean: minuteLabel(metrics.forward),
    backwardLean: minuteLabel(metrics.backward),
    pauseDuration: minuteLabel(metrics.paused),
    unmonitoredDuration: minuteLabel(metrics.unknown),
    remindersCount: metrics.reminders,
    breaks: metrics.breaks,
    coverage,
    pointsEarned: eligible ? Math.min(25, Math.floor(valid / 60)) : 0,
    eligible,
    status: "Selesai",
    simulation: false,
    config,
  };
}

export function evaluateChallenges(challenges, session) {
  let bonus = 0;
  const completed = [];
  const updated = challenges.map((challenge) => {
    if (challenge.type !== "diikuti" || challenge.completed) return challenge;
    const days = challenge.creditedDays || [];
    const increment =
      challenge.id === "ingat-jeda"
        ? session.breaks
        : session.eligible && !days.includes(session.dateKey)
          ? 1
          : 0;
    const current = Math.min(challenge.total, challenge.current + increment);
    const done = current >= challenge.total;
    if (done) {
      completed.push(challenge);
      bonus += Number(challenge.rewardValue.match(/^\+(\d+)/)?.[1] || 0);
    }
    return {
      ...challenge,
      current,
      completed: done,
      type: done ? "selesai" : challenge.type,
      status: done ? `Selesai pada ${session.date}` : challenge.status,
      creditedDays:
        session.eligible && challenge.id !== "ingat-jeda"
          ? [...new Set([...days, session.dateKey])]
          : days,
    };
  });
  return { updated, bonus, completed };
}

export function sessionWeek(sessions) {
  const latest = sessions && sessions.length > 0 ? sessions[0] : null;
  const end = latest?.start_time
    ? new Date(latest.start_time)
    : latest?.startedAt
      ? new Date(latest.startedAt)
      : new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(end);
    date.setDate(date.getDate() - 6 + i);
    const key = dayKey(date);
    const short = new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
      timeZone: "Asia/Jakarta",
    }).format(date);
    const matches = (sessions || []).filter((s) => {
      if (s.dateKey) return s.dateKey === key;
      if (s.date) return s.date.startsWith(short) || s.fullDate?.includes(short);
      return false;
    });
    return {
      day: short,
      value:
        Math.round(
          (matches.reduce(
            (sum, s) =>
              sum + (s.validSeconds ?? (parseFloat(s.validDuration) || 0) * 60),
            0,
          ) /
            60) *
            10,
        ) / 10,
      isCurrent: i === 6,
    };
  });
}
