"""Server-owned time, inference results and rewards. Camera images are never retained."""
from copy import deepcopy
from datetime import datetime, timezone, timedelta
import json
import os
from pathlib import Path
import time

from fastapi import HTTPException
from sqlalchemy import select

from models_db import Account, ExerciseSession, PostureLog

CATALOG = json.loads(Path(__file__).with_name('catalog.json').read_text(encoding='utf-8'))
JAKARTA = timezone(timedelta(hours=7))


def date_label(timestamp):
    return datetime.fromtimestamp(timestamp, JAKARTA).strftime('%d %b %Y')


def account(db, user):
    row = db.scalar(select(Account).where(Account.id == user['id']).with_for_update())
    if row is None:
        row = Account(id=user['id'], email=user.get('email', ''), role='user', state={
            'user': {'name': user.get('user_metadata', {}).get('name') or user.get('email', 'Pengguna').split('@')[0],
                     'avatar': user.get('user_metadata', {}).get('avatar_url') or '', 'points': 0, 'totalPointsCumulative': 0,
                     'selectedBadge': 'Belum ada', 'targetDuration': 15, 'reminderSoundActive': True,
                     'reminderVolume': 60, 'breakReminderActive': True},
            'challenges': deepcopy(CATALOG['challenges']), 'badges': deepcopy(CATALOG['badges']),
            'ownedItems': {}, 'equippedItems': {}, 'pointsHistory': [], 'reports': [],
            'validDays': [], 'validSessions': 0,
        })
        db.add(row)
        db.flush()
    row.state = deepcopy(row.state)
    row.email = user.get('email', row.email or '')
    admin_emails = {value.strip().lower() for value in os.getenv('ADMIN_EMAILS', '').split(',') if value.strip()}
    row.role = 'admin' if row.email.lower() in admin_emails else 'user'
    row.state['user'].update(email=row.email, role=row.role, id=row.id)
    return row


def state_response(row):
    state = deepcopy(row.state)
    user = state['user']
    level = user['totalPointsCumulative'] // 100 + 1
    user.update(level=level, targetLevel=level + 1, levelProgressMax=level * 100,
                pointsToNextLevel=level * 100 - user['totalPointsCumulative'], levelTitle='Pembentuk Kebiasaan')
    return state


def owned_session(db, session_id, user):
    row = db.scalar(select(ExerciseSession).where(ExerciseSession.id == session_id,
                    ExerciseSession.user_id == user['id']).with_for_update())
    if not row:
        raise HTTPException(404, 'Sesi tidak ditemukan')
    return row


def empty_metrics():
    return dict.fromkeys(['total', 'upright', 'forward', 'backward', 'unknown', 'paused', 'breaks',
                         'reminders', 'stretches', 'uprightStreak', 'longestUpright', 'leanStreak'], 0)


def snapshot(row, now=None):
    now = now or time.time()
    m = deepcopy(row.metrics)
    m['total'] = max(0, (row.ended_at or now) - row.started_at)
    if row.paused and row.pause_started_at:
        m['paused'] += max(0, now - row.pause_started_at)
    m['unknown'] = max(0, m['total'] - sum(m[k] for k in ('upright', 'forward', 'backward', 'paused')))
    return m


def record_prediction(db, row, result):
    now = time.time()
    if row.ended_at or row.paused:
        raise HTTPException(409, 'Sesi sudah selesai atau sedang jeda')
    m = snapshot(row, now)
    gap = max(0, now - row.last_sample_at)
    # One frame represents at most two seconds; network stalls never earn posture credit.
    elapsed = min(2, gap)
    raw_label = {0: 'upright', 1: 'forward', 2: 'backward'}.get(result.get('label'), 'unknown') if result.get('status') == 'ok' else 'unknown'
    window = list(m.get('labelWindow', []))
    window.append(raw_label)
    window = window[-5:]
    label = m.get('stableLabel', raw_label)
    candidate = max(set(window), key=window.count)
    if window.count(candidate) >= 3:
        label = candidate
    m['labelWindow'], m['stableLabel'] = window, label
    if gap > 3:
        m['uprightStreak'] = m['leanStreak'] = 0
        m['labelWindow'], m['stableLabel'] = [raw_label], raw_label
        label = raw_label
        m['armFrames'] = 0
    if raw_label != 'unknown' and 'upper_is_arm_activity' in result:
        raised = bool(result['upper_is_arm_activity'])
        count = m.get('armFrames', 0)
        count = min(2, max(count, 0) + 1) if raised else max(-2, min(count, 0) - 1)
        m['armFrames'] = count
        if count == 2 and not m.get('stretchHeld'):
            m['stretches'] = m.get('stretches', 0) + 1
            m['stretchHeld'] = True
        elif count == -2:
            m['stretchHeld'] = False
    else:
        m['armFrames'] = 0
    if label != 'unknown':
        m[label] += elapsed
    m['uprightStreak'] = m['uprightStreak'] + elapsed if label == 'upright' else 0
    m['longestUpright'] = max(m['longestUpright'], m['uprightStreak'])
    previous_lean = m['leanStreak']
    m['leanStreak'] = previous_lean + elapsed if label in ('forward', 'backward') else 0
    threshold = 7 if row.config['mode'] == 'work' else 2
    remind = previous_lean < threshold <= m['leanStreak']
    if remind:
        m['reminders'] += 1
    m['unknown'] = max(0, m['total'] - sum(m[k] for k in ('upright', 'forward', 'backward', 'paused')))
    row.metrics, row.last_sample_at = m, now
    db.add(PostureLog(session_id=row.id, timestamp=now, label=label,
                     cervical_angle=result.get('cervical_angle_deg')))
    stable_prediction = {'upright': 'tegak', 'forward': 'condong_depan',
                         'backward': 'condong_belakang'}.get(label, 'tidak_yakin')
    return {'metrics': m, 'posture': label, 'stable_prediction': stable_prediction, 'remind': remind}


def finish_session(db, row, owner):
    if row.result:
        return row.result
    now = time.time()
    m = snapshot(row, now)
    row.ended_at, row.metrics, row.paused, row.pause_started_at = now, m, 0, None
    valid = sum(m[k] for k in ('upright', 'forward', 'backward'))
    monitored = m['total'] - m['paused']
    coverage = min(100, round(valid / monitored * 100)) if monitored > 0 else 0
    eligible = valid >= 300 and coverage >= 70
    points = min(25, int(valid // 60)) if eligible else 0
    date = datetime.fromtimestamp(row.started_at, JAKARTA)
    end = datetime.fromtimestamp(now, JAKARTA)
    minute = lambda seconds: f'{round(seconds / 60, 1):g}m'
    session = dict(id=row.id, dateKey=date.strftime('%Y-%m-%d'), startedAt=date.isoformat(),
        date=date.strftime('%d %b'), fullDate=date_label(row.started_at), time=date.strftime('%H.%M'),
        timeRange=f'{date:%H.%M}–{end:%H.%M} WIB', totalDuration=minute(m['total']),
        validDuration=minute(valid), validSeconds=valid, uprightDuration=minute(m['upright']),
        uprightSeconds=m['upright'], longestUprightSeconds=m['longestUpright'],
        uprightPercentage=round(m['upright'] / valid * 100) if valid else 0,
        forwardLean=minute(m['forward']), backwardLean=minute(m['backward']),
        pauseDuration=minute(m['paused']), unmonitoredDuration=minute(m['unknown']),
        stretchCount=m.get('stretches', 0), remindersCount=m['reminders'], breaks=m['breaks'], coverage=coverage,
        pointsEarned=points, eligible=eligible, status='Selesai', simulation=False, config=row.config)
    state = owner.state
    previous = state['user']['points']
    completed, unlocked, bonus = [], [], 0
    if eligible:
        state['validDays'] = sorted(set(state['validDays'] + [session['dateKey']]))
        state['validSessions'] += 1
    for challenge in state['challenges']:
        if challenge['type'] != 'diikuti' or challenge['completed']:
            continue
        increment = m['breaks'] if challenge['id'] == 'ingat-jeda' else (
            int(eligible) if challenge['unit'] == 'sesi' else int(eligible and session['dateKey'] not in challenge['creditedDays']))
        challenge['current'] = min(challenge['total'], challenge['current'] + increment)
        if eligible:
            challenge['creditedDays'] = sorted(set(challenge['creditedDays'] + [session['dateKey']]))
        if challenge['current'] >= challenge['total']:
            challenge.update(completed=True, type='selesai', status=f'Selesai pada {date_label(now)}')
            bonus += {'tiga-hari': 15, 'kembali-esok': 10}.get(challenge['id'], 0)
            completed.append(deepcopy(challenge))
    for badge in state['badges']:
        condition = {'kalibrasi-siap': True, 'langkah-pertama': eligible,
            'mulai-konsisten': len(state['validDays']) >= 3, 'pengamat-mingguan': state['validSessions'] >= 5,
            'ingat-jeda': any(c['id'] == 'ingat-jeda' and c['completed'] for c in state['challenges'])}[badge['id']]
        if not badge['unlocked'] and condition:
            badge.update(unlocked=True, date=date_label(now), progressText='')
            unlocked.append(deepcopy(badge))
    state['user']['points'] += points + bonus
    state['user']['totalPointsCumulative'] += points + bonus
    state['pointsHistory'].insert(0, dict(date=date_label(now), activity='Sesi latihan', change=f'+{points + bonus}',
                                        type='in', note=f'{session["validDuration"]} valid; bonus {bonus}'))
    row.result = dict(session=session, bonus=bonus, challenges=completed, badges=unlocked,
                      previousBalance=previous, balance=state['user']['points'])
    return row.result
