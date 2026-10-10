from typing import Optional

import re

from pydantic import BaseModel, EmailStr, Field, field_validator


class MagicLinkRequest(BaseModel):
    email: EmailStr
    portal: Optional[str] = "member"


class TokenExchangeRequest(BaseModel):
    token: str


class TokenResponse(BaseModel):
    token: str
    token_type: str = "bearer"
    expires_in: int = 86400


class MemberInfo(BaseModel):
    member_id: int
    full_name: str
    email: str
    phone: Optional[str] = None
    is_active: bool = False
    roles: list[str] = []
    # Normalised access level: Admin | Treasurer | Officer | Member | Guest
    role: str = "Guest"
    student_id: Optional[str] = None
    valid_until: Optional[str] = None


class OTPGenerateRequest(BaseModel):
    email: EmailStr
    purpose: str = Field(default="login", pattern="^(login|register)$")


class OTPGenerateResponse(BaseModel):
    message: str
    expires_in: int = 300
    dev_otp: Optional[str] = None


class OTPVerifyRequest(BaseModel):
    email: EmailStr
    otp: str


# Campus enrollment numbers differ between universities: allow letters, digits and - / . _
STUDENT_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9\-/._]{4,31}$")


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class RegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    otp: str = Field(..., min_length=6, max_length=6)  # emailed code proving the inbox belongs to the sign-up
    phone: Optional[str] = Field(default=None, max_length=20)
    student_id: Optional[str] = Field(default=None, max_length=32)

    @field_validator("student_id")
    @classmethod
    def _check_student_id(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v.strip() == "":
            return None
        v = v.strip()
        if not STUDENT_ID_RE.match(v):
            raise ValueError("Student ID must be 5-32 characters: letters, digits and - / . _ only.")
        return v


class GoogleLoginRequest(BaseModel):
    credential: str


class ChangePasswordRequest(BaseModel):
    current_password: Optional[str] = None
    new_password: str = Field(..., min_length=8, max_length=128)


class SessionResponse(BaseModel):
    token: str
    token_type: str = "bearer"
    expires_in: int = 86400
    user: MemberInfo


class RegisterOtpRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=20)
    student_id: Optional[str] = Field(default=None, max_length=32)
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)
    otp: str = Field(..., min_length=6, max_length=6)
