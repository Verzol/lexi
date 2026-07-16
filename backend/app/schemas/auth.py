from pydantic import BaseModel, EmailStr, Field

from app.models.enums import UserRole


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    """Public self-signup — always creates a `student`. Role can't be chosen here;
    teacher accounts are still provisioned out-of-band."""

    email: EmailStr
    display_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=128)
    timezone: str = "Asia/Ho_Chi_Minh"


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
