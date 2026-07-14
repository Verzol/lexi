from pydantic import BaseModel


class StreakOut(BaseModel):
    current_streak: int
    longest_streak: int
    freezes_remaining: int

    model_config = {"from_attributes": True}
