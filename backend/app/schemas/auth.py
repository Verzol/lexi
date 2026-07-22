from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.enums import UserRole


def _validate_timezone(value: str) -> str:
    """Reject a bad IANA timezone at the edge. Without this a garbage string
    reaches `ZoneInfo()` deep in the streak/SRS day-boundary math and 500s on
    the student's first graded card — long after signup."""
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise ValueError(f"Unknown timezone: {value!r}") from exc
    return value


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

    @field_validator("timezone")
    @classmethod
    def _check_timezone(cls, v: str) -> str:
        return _validate_timezone(v)


class UserOut(BaseModel):
    id: int
    email: EmailStr
    display_name: str
    role: UserRole
    timezone: str
    daily_new_target: int
    email_verified: bool
    auth_provider: str

    model_config = {"from_attributes": True}


class VerifyEmailRequest(BaseModel):
    token: str


class GoogleLoginRequest(BaseModel):
    """The Google ID token (a signed JWT) returned by Google Identity Services."""

    credential: str


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

    @field_validator("timezone")
    @classmethod
    def _check_timezone(cls, v: str) -> str:
        return _validate_timezone(v)
