"""SQLite table models for the MVP backend.

Screen: signup, login, goals, and quiz result persistence.
Role: define users, goals, and quiz_results tables with SQLAlchemy.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    nickname: Mapped[str] = mapped_column(String(100), nullable=False)
    level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    exp: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    token: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    goals: Mapped[list["Goal"]] = relationship("Goal", back_populates="user")
    quiz_results: Mapped[list["QuizResult"]] = relationship("QuizResult", back_populates="user")
    study_sessions: Mapped[list["StudySession"]] = relationship("StudySession", back_populates="user")


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    certificate_name: Mapped[str] = mapped_column(String(100), nullable=False)
    period_days: Mapped[int] = mapped_column(Integer, nullable=False)
    difficulty: Mapped[str] = mapped_column(String(50), nullable=False)
    current_level: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="active", nullable=False)
    ai_learning_plan: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    user: Mapped[User] = relationship("User", back_populates="goals")
    quiz_results: Mapped[list["QuizResult"]] = relationship("QuizResult", back_populates="goal")


class QuizResult(Base):
    __tablename__ = "quiz_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    quiz_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    goal_id: Mapped[int | None] = mapped_column(ForeignKey("goals.id"), index=True, nullable=True)
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False)
    correct_count: Mapped[int] = mapped_column(Integer, nullable=False)
    score_percent: Mapped[int] = mapped_column(Integer, nullable=False)
    passed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    user: Mapped[User] = relationship("User", back_populates="quiz_results")
    goal: Mapped[Goal | None] = relationship("Goal", back_populates="quiz_results")


class StudySession(Base):
    __tablename__ = "study_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    studied_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_uninterrupted_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reward_token: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="started", index=True, nullable=False)

    user: Mapped[User] = relationship("User", back_populates="study_sessions")
    interruptions: Mapped[list["StudySessionInterruption"]] = relationship(
        "StudySessionInterruption",
        back_populates="study_session",
        cascade="all, delete-orphan",
        order_by="StudySessionInterruption.interrupted_at",
    )


class StudySessionInterruption(Base):
    __tablename__ = "study_session_interruptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    study_session_id: Mapped[int] = mapped_column(
        ForeignKey("study_sessions.id"),
        index=True,
        nullable=False,
    )
    interrupted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    segment_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reason: Mapped[str] = mapped_column(String(100), default="leave_library", nullable=False)

    study_session: Mapped[StudySession] = relationship("StudySession", back_populates="interruptions")
