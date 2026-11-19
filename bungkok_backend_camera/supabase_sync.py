from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional
import httpx

logger = logging.getLogger("supabase_sync")

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://gmasqrgtzceaariaucuw.supabase.co").strip().rstrip("/")
SUPABASE_ANON_KEY = os.getenv(
    "SUPABASE_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtYXNxcmd0emNlYWFyaWF1Y3V3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1NTA2NzEsImV4cCI6MjExMDEyNjY3MX0.DmlQt8qJCQzaL0gCZvYnyqrOBZtFkwBjhOvwgAdvW7Q",
).strip()

HEADERS = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}


def sync_user_to_supabase(user_dict: Dict[str, Any]) -> bool:
    """Sync a user record to Supabase via REST API."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return False
    try:
        url = f"{SUPABASE_URL}/rest/v1/users"
        payload = {
            "id": user_dict.get("id"),
            "email": user_dict.get("email"),
            "name": user_dict.get("name"),
            "password_hash": user_dict.get("password_hash", ""),
            "role": user_dict.get("role", "user"),
            "provider": user_dict.get("provider", "local"),
            "avatar": user_dict.get("avatar"),
            "points": user_dict.get("points", 100),
            "level": user_dict.get("level", 1),
        }
        resp = httpx.post(url, headers=HEADERS, json=payload, timeout=4.0)
        return resp.status_code in (200, 201, 204)
    except Exception as exc:
        logger.warning(f"Failed to sync user to Supabase: {exc}")
        return False


def sync_session_to_supabase(session_dict: Dict[str, Any]) -> bool:
    """Sync a completed session record to Supabase via REST API."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return False
    try:
        url = f"{SUPABASE_URL}/rest/v1/sessions"
        payload = {
            "id": session_dict.get("id"),
            "user_id": session_dict.get("user_id"),
            "session_name": session_dict.get("session_name", "Sesi Latihan Postur"),
            "mode": session_dict.get("mode", "work"),
            "duration_seconds": session_dict.get("duration_seconds", 0),
            "upright_seconds": session_dict.get("upright_seconds", 0),
            "slump_seconds": session_dict.get("slump_seconds", 0),
            "upright_percentage": float(session_dict.get("upright_percentage", 100.0)),
            "longest_streak": session_dict.get("longest_streak", 0),
            "reminders_count": session_dict.get("reminders_count", 0),
            "score": session_dict.get("score", 100),
        }
        resp = httpx.post(url, headers=HEADERS, json=payload, timeout=4.0)
        return resp.status_code in (200, 201, 204)
    except Exception as exc:
        logger.warning(f"Failed to sync session to Supabase: {exc}")
        return False
