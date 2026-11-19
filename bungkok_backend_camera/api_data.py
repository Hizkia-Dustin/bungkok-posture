import asyncio
from copy import deepcopy
import os
import time
from typing import Literal
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, select
from sqlalchemy.orm.attributes import flag_modified

from auth import current_user
from models_db import Account, AppConfiguration, ExerciseSession, PostureLog
from session_service import (CATALOG, account, date_label, empty_metrics, finish_session,
                             owned_session, snapshot, state_response)


class StartInput(BaseModel):
    calibration_id: str
    mode: Literal['work', 'active'] = 'work'
    sound: bool = True
    request_id: uuid.UUID


class ProfileInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str | None = Field(default=None, min_length=1, max_length=80)
    avatar: str | None = Field(default=None, max_length=3000000)
    targetDuration: int | None = Field(default=None, ge=5, le=60)
    reminderSoundActive: bool | None = None
    reminderVolume: int | None = Field(default=None, ge=0, le=100)
    breakReminderActive: bool | None = None
    selectedBadge: str | None = Field(default=None, max_length=80)


class PauseInput(BaseModel):
    paused: bool


class TicketInput(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    category: str = Field(min_length=1, max_length=60)
    description: str = Field(min_length=10, max_length=5000)
    device: str = Field(default='', max_length=300)


class ReplyInput(BaseModel):
    text: str = Field(min_length=1, max_length=5000)


class AdminTicketUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    status: Literal['Diterima', 'Ditangani', 'Selesai']
    message: str | None = Field(default=None, min_length=1, max_length=5000)


class ShopItem(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: str = Field(min_length=2, max_length=60, pattern=r'^[a-z0-9-]+$')
    name: str = Field(min_length=2, max_length=80)
    type: str = Field(min_length=2, max_length=60)
    price: int = Field(ge=0, le=100000)
    description: str = Field(min_length=3, max_length=300)
    enabled: bool = True


class ReminderConfig(BaseModel):
    model_config = ConfigDict(extra='forbid')
    mode: Literal['speech', 'tone'] = 'speech'
    message: str = Field(min_length=3, max_length=180)
    language: str = Field(default='id-ID', min_length=2, max_length=16)
    rate: float = Field(default=1, ge=.6, le=1.5)


class AdminConfigInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    shop: list[ShopItem] = Field(max_length=100)
    reminder: ReminderConfig


def data_router(app, calibrations):
    router = APIRouter(prefix='/api')
    app.state.data_lock = asyncio.Lock()

    async def transaction():
        async with app.state.data_lock:
            with app.state.db() as db:
                try:
                    yield db
                    for row in list(db.identity_map.values()):
                        if isinstance(row, Account) and row not in db.deleted:
                            flag_modified(row, 'state')
                    db.commit()
                except Exception:
                    db.rollback()
                    raise

    app.state.transaction = transaction

    def configuration(db):
        row = db.get(AppConfiguration, 'runtime')
        if not row:
            row = AppConfiguration(key='runtime', value={
                'shop': [{**item, 'enabled': True} for item in CATALOG['shop']],
                'reminder': {'mode': 'speech', 'message': 'Badan kamu mulai bungkuk. Yuk, tegakkan posturmu.',
                             'language': 'id-ID', 'rate': 1},
            })
            db.add(row)
            db.flush()
        row.value = deepcopy(row.value)
        existing_ids = {item['id'] for item in row.value.get('shop', [])}
        row.value.setdefault('shop', []).extend(
            {**item, 'enabled': True} for item in CATALOG['shop'] if item['id'] not in existing_ids
        )
        return row

    def require_admin(user, db):
        owner = account(db, user)
        if owner.role != 'admin':
            raise HTTPException(403, 'Halaman ini hanya dapat diakses administrator')
        return owner

    @router.get('/configuration')
    def public_configuration(user=Depends(current_user), db=Depends(transaction)):
        value = configuration(db).value
        return {'shop': [item for item in value['shop'] if item.get('enabled', True)],
                'reminder': value['reminder']}

    @router.get('/account')
    def get_account(user=Depends(current_user), db=Depends(transaction)):
        return state_response(account(db, user))

    @router.patch('/account')
    def update_profile(body: ProfileInput, user=Depends(current_user), db=Depends(transaction)):
        owner = account(db, user)
        update = body.model_dump(exclude_none=True)
        if 'name' in update:
            update['name'] = update['name'].strip()
            if not update['name']:
                raise HTTPException(422, 'Nama tidak boleh kosong')
        if 'avatar' in update and not (update['avatar'].startswith('/assets/') or update['avatar'].startswith(('data:image/png;base64,', 'data:image/jpeg;base64,', 'data:image/webp;base64,'))):
            raise HTTPException(422, 'Avatar harus berupa JPEG, PNG, atau WebP')
        if 'selectedBadge' in update and not any(b['title'] == update['selectedBadge'] and b['unlocked'] for b in owner.state['badges']):
            raise HTTPException(422, 'Badge belum diperoleh')
        owner.state['user'].update(update)
        return state_response(owner)

    @router.post('/sessions/start')
    def start(body: StartInput, user=Depends(current_user), db=Depends(transaction)):
        account(db, user)
        existing = db.get(ExerciseSession, str(body.request_id))
        if existing:
            owned_session(db, existing.id, user)
            return {'id': existing.id, 'started_at': existing.started_at, 'metrics': snapshot(existing)}
        calibration = calibrations.get(body.calibration_id)
        if not calibration or calibration['user_id'] != user['id'] or time.monotonic() - calibration['created_at'] > 3600:
            raise HTTPException(404, 'Kalibrasi berakhir. Silakan kalibrasi ulang')
        active = db.scalar(select(ExerciseSession).where(ExerciseSession.user_id == user['id'], ExerciseSession.ended_at.is_(None)))
        if active:
            raise HTTPException(409, 'Masih ada sesi aktif. Batalkan sesi lama atau selesaikan latihan tersebut')
        now = time.time()
        metrics = empty_metrics()
        metrics['lastHeartbeatAt'] = now
        row = ExerciseSession(id=str(body.request_id), user_id=user['id'], started_at=now, last_sample_at=now,
            calibration=deepcopy(calibration['calibration']), config={'mode': body.mode, 'sound': body.sound}, metrics=metrics)
        db.add(row)
        return {'id': row.id, 'started_at': now, 'metrics': row.metrics}

    @router.get('/sessions/active')
    def active(user=Depends(current_user), db=Depends(transaction)):
        row = db.scalar(select(ExerciseSession).where(ExerciseSession.user_id == user['id'], ExerciseSession.ended_at.is_(None)))
        if not row:
            return None
        metrics = snapshot(row)
        heartbeat_at = metrics.get('lastHeartbeatAt', row.started_at)
        return {'id': row.id, 'startedAt': row.started_at, 'metrics': metrics,
                'config': row.config, 'paused': bool(row.paused),
                'connectionStatus': 'interrupted' if time.time() - heartbeat_at > 15 else 'connected',
                'lastSampleAt': row.last_sample_at, 'lastHeartbeatAt': heartbeat_at}

    @router.post('/sessions/{session_id}/heartbeat')
    def heartbeat(session_id: str, user=Depends(current_user), db=Depends(transaction)):
        row = owned_session(db, session_id, user)
        if row.ended_at:
            raise HTTPException(409, 'Sesi sudah selesai')
        now = time.time()
        metrics = snapshot(row, now)
        metrics['lastHeartbeatAt'] = now
        row.metrics = metrics
        return {'status': 'connected', 'serverTime': now, 'paused': bool(row.paused),
                'metrics': metrics, 'lastSampleAt': row.last_sample_at}

    @router.delete('/sessions/{session_id}/active')
    def cancel_active(session_id: str, user=Depends(current_user), db=Depends(transaction)):
        row = owned_session(db, session_id, user)
        if row.ended_at:
            raise HTTPException(409, 'Sesi tersebut sudah selesai')
        db.delete(row)
        return {'status': 'cancelled'}

    @router.post('/sessions/{session_id}/pause')
    def pause(session_id: str, body: PauseInput, user=Depends(current_user), db=Depends(transaction)):
        row = owned_session(db, session_id, user)
        if row.ended_at:
            raise HTTPException(409, 'Sesi sudah selesai')
        now = time.time()
        m = snapshot(row, now)
        if body.paused and not row.paused:
            row.pause_started_at = now
            m['breaks'] += 1
        elif not body.paused:
            row.pause_started_at = None
        m['uprightStreak'] = m['leanStreak'] = 0
        row.metrics, row.paused, row.last_sample_at = m, int(body.paused), now
        if body.paused:
            row.pause_started_at = now
        return {'metrics': m, 'paused': bool(row.paused)}

    @router.post('/sessions/{session_id}/finish')
    def finish(session_id: str, user=Depends(current_user), db=Depends(transaction)):
        owner = account(db, user)
        return finish_session(db, owned_session(db, session_id, user), owner)

    @router.get('/sessions/history')
    def history(user=Depends(current_user), db=Depends(transaction)):
        rows = db.scalars(select(ExerciseSession).where(ExerciseSession.user_id == user['id'], ExerciseSession.ended_at.is_not(None)).order_by(ExerciseSession.started_at.desc())).all()
        return [row.result['session'] for row in rows if row.result]

    @router.get('/dashboard/stats')
    def stats(user=Depends(current_user), db=Depends(transaction)):
        rows = history(user, db)
        valid = sum(s['validSeconds'] for s in rows)
        upright = sum(s['uprightSeconds'] for s in rows)
        return {'session_count': len(rows), 'valid_seconds': valid, 'upright_percentage': round(upright / valid * 100) if valid else 0}

    @router.delete('/sessions/history')
    def clear_history(user=Depends(current_user), db=Depends(transaction)):
        ids = select(ExerciseSession.id).where(ExerciseSession.user_id == user['id'], ExerciseSession.ended_at.is_not(None))
        db.execute(delete(PostureLog).where(PostureLog.session_id.in_(ids)))
        db.execute(delete(ExerciseSession).where(ExerciseSession.id.in_(ids)))
        return {'status': 'deleted'}

    @router.post('/challenges/{challenge_id}/join')
    def join(challenge_id: str, user=Depends(current_user), db=Depends(transaction)):
        owner = account(db, user)
        challenge = next((c for c in owner.state['challenges'] if c['id'] == challenge_id), None)
        if not challenge:
            raise HTTPException(404, 'Tantangan tidak ditemukan')
        if challenge['type'] == 'tersedia':
            challenge.update(type='diikuti', status='Sedang diikuti', joinedDate=date_label(time.time()))
        return state_response(owner)

    @router.post('/rewards/{item_id}/redeem')
    def redeem(item_id: str, user=Depends(current_user), db=Depends(transaction)):
        owner = account(db, user)
        state = owner.state
        item = next((i for i in configuration(db).value['shop'] if i['id'] == item_id and i.get('enabled', True)), None)
        if not item:
            raise HTTPException(404, 'Hadiah tidak ditemukan')
        if not state['ownedItems'].get(item_id):
            admin_testing = owner.role == 'admin'
            if not admin_testing and state['user']['points'] < item['price']:
                raise HTTPException(409, 'Poin belum cukup')
            if not admin_testing:
                state['user']['points'] -= item['price']
            state['ownedItems'][item_id] = True
            if not admin_testing:
                state['pointsHistory'].insert(0, dict(date=date_label(time.time()), activity=f'Tukar {item["name"]}',
                    change=f'-{item["price"]}', type='out', note='Hadiah dimiliki'))
        return state_response(owner)

    @router.post('/achievements/{badge_id}/claim')
    def claim_achievement(badge_id: str, user=Depends(current_user), db=Depends(transaction)):
        owner = account(db, user)
        badge = next((item for item in owner.state['badges'] if item['id'] == badge_id), None)
        if not badge:
            raise HTTPException(404, 'Pencapaian tidak ditemukan')
        if not badge['unlocked']:
            raise HTTPException(409, 'Pencapaian belum diperoleh')
        if badge.get('claimed'):
            raise HTTPException(409, 'Hadiah pencapaian sudah diklaim')
        reward = int(badge.get('rewardPoints', 0))
        badge['claimed'] = True
        owner.state['user']['points'] += reward
        owner.state['user']['totalPointsCumulative'] += reward
        owner.state['pointsHistory'].insert(0, dict(date=date_label(time.time()), activity=f'Klaim {badge["title"]}',
            change=f'+{reward}', type='in', note='Hadiah pencapaian diklaim'))
        return state_response(owner)

    @router.put('/rewards/equipped')
    def equip(body: dict[str, bool], user=Depends(current_user), db=Depends(transaction)):
        owner = account(db, user)
        if owner.role != 'admin' and any(not owner.state['ownedItems'].get(key) for key, value in body.items() if value):
            raise HTTPException(422, 'Hadiah belum dimiliki')
        owner.state['equippedItems'] = body
        return state_response(owner)

    @router.post('/reports')
    def report(body: TicketInput, user=Depends(current_user), db=Depends(transaction)):
        owner = account(db, user)
        ticket = dict(id=f'BGK-{uuid.uuid4().hex[:10].upper()}', **body.model_dump(), date=date_label(time.time()),
            createdAt=time.time(), status='Diterima', statusBadgeColor='bg-amber-100 text-amber-800', teamReply=None)
        owner.state['reports'].insert(0, ticket)
        return ticket

    @router.post('/reports/{ticket_id}/replies')
    def reply(ticket_id: str, body: ReplyInput, user=Depends(current_user), db=Depends(transaction)):
        owner = account(db, user)
        ticket = next((t for t in owner.state['reports'] if t['id'] == ticket_id), None)
        if not ticket or not ticket['teamReply']:
            raise HTTPException(409, 'Belum ada balasan tim untuk laporan ini')
        ticket['teamReply']['userReply'] = body.text
        return state_response(owner)

    @router.delete('/account')
    async def delete_account(user=Depends(current_user), db=Depends(transaction)):
        key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        if not key:
            raise HTTPException(503, 'Penghapusan akun belum dikonfigurasi oleh administrator')
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.delete(f'{os.environ["SUPABASE_URL"]}/auth/v1/admin/users/{user["id"]}',
                headers={'apikey': key, 'Authorization': f'Bearer {key}'})
        if response.status_code not in (200, 404):
            raise HTTPException(502, 'Akun belum dapat dihapus. Coba lagi')
        ids = select(ExerciseSession.id).where(ExerciseSession.user_id == user['id'])
        db.execute(delete(PostureLog).where(PostureLog.session_id.in_(ids)))
        db.execute(delete(ExerciseSession).where(ExerciseSession.user_id == user['id']))
        db.execute(delete(Account).where(Account.id == user['id']))
        return {'status': 'deleted'}

    @router.get('/admin/overview')
    def admin_overview(user=Depends(current_user), db=Depends(transaction)):
        require_admin(user, db)
        accounts = db.scalars(select(Account).order_by(Account.email)).all()
        session_count = len(db.scalars(select(ExerciseSession)).all())
        users = []
        reports = []
        for row in accounts:
            profile = row.state.get('user', {})
            users.append({'id': row.id, 'email': row.email, 'name': profile.get('name', 'Pengguna'),
                          'role': row.role, 'points': profile.get('points', 0),
                          'level': profile.get('totalPointsCumulative', 0) // 100 + 1,
                          'avatar': profile.get('avatar', '')})
            reports.extend({**ticket, 'user': {'id': row.id, 'email': row.email,
                'name': profile.get('name', 'Pengguna'), 'avatar': profile.get('avatar', '')}}
                for ticket in row.state.get('reports', []))
        reports.sort(key=lambda ticket: ticket.get('createdAt', 0), reverse=True)
        return {'stats': {'total_users': len(accounts), 'total_admins': sum(a.role == 'admin' for a in accounts),
                          'total_sessions': session_count, 'total_reports': len(reports),
                          'open_reports': sum(ticket.get('status') != 'Selesai' for ticket in reports)},
                'users': users, 'reports': reports,
                'configuration': configuration(db).value}

    @router.patch('/admin/reports/{ticket_id}')
    def update_report(ticket_id: str, body: AdminTicketUpdate,
                      user=Depends(current_user), db=Depends(transaction)):
        require_admin(user, db)
        accounts = db.scalars(select(Account)).all()
        for row in accounts:
            ticket = next((item for item in row.state.get('reports', []) if item['id'] == ticket_id), None)
            if not ticket:
                continue
            row.state = deepcopy(row.state)
            ticket = next(item for item in row.state['reports'] if item['id'] == ticket_id)
            ticket['status'] = body.status
            ticket['statusBadgeColor'] = {
                'Diterima': 'bg-amber-100 text-amber-800',
                'Ditangani': 'bg-blue-100 text-blue-800',
                'Selesai': 'bg-emerald-100 text-emerald-800',
            }[body.status]
            if body.message:
                previous_user_reply = (ticket.get('teamReply') or {}).get('userReply')
                ticket['teamReply'] = {'message': body.message, 'date': date_label(time.time()),
                                       'userReply': previous_user_reply}
            profile = row.state.get('user', {})
            return {**ticket, 'user': {'id': row.id, 'email': row.email,
                'name': profile.get('name', 'Pengguna'), 'avatar': profile.get('avatar', '')}}
        raise HTTPException(404, 'Laporan tidak ditemukan')

    @router.put('/admin/configuration')
    def update_configuration(body: AdminConfigInput, user=Depends(current_user), db=Depends(transaction)):
        require_admin(user, db)
        ids = [item.id for item in body.shop]
        if len(ids) != len(set(ids)):
            raise HTTPException(422, 'ID hadiah tidak boleh sama')
        row = configuration(db)
        row.value = body.model_dump()
        return row.value

    return router
