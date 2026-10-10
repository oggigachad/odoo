from pydantic import BaseModel, EmailStr


class MagicLinkRequest(BaseModel):
    email: EmailStr


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
    phone: str | None = None
    is_active: bool = False
    roles: list[str] = []
