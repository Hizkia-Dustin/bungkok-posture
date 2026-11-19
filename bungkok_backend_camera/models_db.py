from __future__ import annotations

from sqlalchemy import Float, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Account(Base):
    """Application data keyed by the immutable Supabase Auth user id."""

    __tablename__ = "app_accounts"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), index=True, default="")
    role: Mapped[str] = mapped_column(String(16), index=True, default="user")
    state: Mapped[dict] = mapped_column(JSON, nullable=False)
    sessions: Mapped[list["ExerciseSession"]] = relationship(back_populates="owner", cascade="all, delete-orphan")


class ExerciseSession(Base):
    __tablename__ = "exercise_sessions"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("app_accounts.id"), index=True)
    started_at: Mapped[float] = mapped_column(Float)
    ended_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_sample_at: Mapped[float] = mapped_column(Float)
    pause_started_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    paused: Mapped[int] = mapped_column(Integer, default=0)
    calibration: Mapped[dict] = mapped_column(JSON, default=dict)
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    owner: Mapped[Account] = relationship(back_populates="sessions")
    logs: Mapped[list["PostureLog"]] = relationship(back_populates="session", cascade="all, delete-orphan")


class PostureLog(Base):
    __tablename__ = "exercise_posture_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("exercise_sessions.id"), index=True)
    timestamp: Mapped[float] = mapped_column(Float)
    label: Mapped[str] = mapped_column(String(24))
    cervical_angle: Mapped[float | None] = mapped_column(Float, nullable=True)
    session: Mapped[ExerciseSession] = relationship(back_populates="logs")


class AppConfiguration(Base):
    __tablename__ = "app_configuration"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, nullable=False)
