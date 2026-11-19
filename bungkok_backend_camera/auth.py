import os
import time

import httpx
from fastapi import Header, HTTPException

_user_cache: dict[str, tuple[float, dict]] = {}
_CACHE_SECONDS = 30


async def current_user(authorization: str = Header(default='')):
    if not authorization.startswith('Bearer '):
        raise HTTPException(401, 'Silakan masuk terlebih dahulu')
    token = authorization[7:]
    cached = _user_cache.get(token)
    now = time.monotonic()
    if cached and cached[0] > now:
        return cached[1]

    url = os.getenv('SUPABASE_URL', '').rstrip('/')
    key = os.getenv('SUPABASE_PUBLISHABLE_KEY') or os.getenv('SUPABASE_ANON_KEY')
    if not url or not key:
        raise HTTPException(503, 'Supabase belum dikonfigurasi pada server')
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f'{url}/auth/v1/user',
                headers={'apikey': key, 'Authorization': authorization},
            )
    except httpx.RequestError as error:
        raise HTTPException(503, 'Layanan akun tidak dapat dihubungi') from error
    if response.status_code in (401, 403):
        _user_cache.pop(token, None)
        raise HTTPException(401, 'Sesi login berakhir. Silakan masuk kembali')
    if response.status_code != 200:
        raise HTTPException(503, 'Layanan akun sedang tidak tersedia')
    user = response.json()
    if not user.get('id'):
        raise HTTPException(401, 'Identitas akun tidak valid')

    if len(_user_cache) >= 256:
        _user_cache.clear()
    _user_cache[token] = (now + _CACHE_SECONDS, user)
    return user
