from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import current_user
from app.db import get_db
from app.models import Streak, User
from app.schemas.streaks import StreakOut

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/streak", response_model=StreakOut)
def my_streak(db: Session = Depends(get_db), user: User = Depends(current_user)) -> StreakOut:
    streak = db.scalar(select(Streak).where(Streak.student_id == user.id))
    if streak is None:
        # Admins have no streak row, and a student's row is created with the account.
        return StreakOut(current_streak=0, longest_streak=0, freezes_remaining=0)
    return StreakOut.model_validate(streak)
