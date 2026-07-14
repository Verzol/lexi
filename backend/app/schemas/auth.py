from pydantic import BaseModel, EmailStr

from app.models.enums import UserRole


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: EmailStr
    display_name: str
    role: UserRole
    timezone: str
    daily_new_target: int

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    """The refresh token is NOT in this body — it rides in an httpOnly cookie."""

    access_token: str
    token_type: str = "bearer"
    user: UserOut


class CreateStudentRequest(BaseModel):
    email: EmailStr
    display_name: str
    password: str
    timezone: str = "Asia/Ho_Chi_Minh"
    daily_new_target: int = 10
