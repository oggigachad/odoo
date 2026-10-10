from typing import Optional

from pydantic import BaseModel, EmailStr


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
