import secrets
from datetime import date
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import (
    DuplicateEmailError,
    RateLimitedError,
    ServiceUnavailableError,
    UnauthenticatedError,
    ValidationError,
)
from app.core.redis import (
    check_rate_limit,
    consume_magic_link_token,
    enqueue_email,
    store_magic_link_token,
    store_otp,
    verify_and_consume_otp,
)
from app.core.security import (
    create_magic_link_token,
    create_session_token,
    decode_magic_link_token,
    hash_password,
    verify_password,
)
from app.repositories.member_repo import MemberRepository
from app.schemas.auth import MemberInfo


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = MemberRepository(session)

    async def request_magic_link(self, email: str, portal: Optional[str] = "member") -> str:
        """Generate magic link token stored in Redis with 15-min TTL.

        Puts email job onto queue:emails.
        If Redis is unreachable, raises ServiceUnavailableError (503).
        Never reveals whether the email exists.
        """
        token = create_magic_link_token(email)
        stored = await store_magic_link_token(
            token=token,
            data={"email": email.lower(), "portal": portal or "member"},
            ttl_seconds=900,
        )
        if not stored:
            raise ServiceUnavailableError("Authentication temporarily unavailable.")

        member = await self.repo.get_by_email(email)
        if member:
            # Enqueue email task to background queue:emails
            await enqueue_email(
                {
                    "to": email.lower(),
                    "type": "magic_link",
                    "token": token,
                    "portal": portal or "member",
                }
            )

        return token

    async def exchange_token(self, token: str) -> str:
        """Atomically consume token from Redis (GETDEL) and produce 24h session JWT."""
        cached_data = await consume_magic_link_token(token)
        if not cached_data:
            raise UnauthenticatedError("Invalid, expired, or already-used magic link.")

        email = decode_magic_link_token(token)
        member = await self.repo.get_by_email(email)
        if not member:
            raise UnauthenticatedError("No registered member found for this email.")

        return create_session_token(member.member_id)

    @staticmethod
    def resolve_access_level(roles: list[str], is_active: bool) -> str:
        """Collapse DB leadership positions into the five dashboard access levels."""
        lowered = {r.lower() for r in roles}
        if "admin" in lowered:
            return "Admin"
        if lowered & {"treasurer", "accountant"}:
            return "Treasurer"
        if lowered & {"president", "vice president", "secretary", "officer"}:
            return "Officer"
        return "Member" if is_active else "Guest"

    async def get_current_user_info(self, member_id: int) -> MemberInfo:
        member = await self.repo.get_by_id(member_id)
        if not member:
            raise UnauthenticatedError("Member not found.")

        today = date.today()
        current_year = today.year
        roles = list(await self.repo.get_roles_for_year(member_id, current_year))
        is_active = await self.repo.has_active_membership(member_id, today)
        valid_until = await self.repo.get_latest_valid_until(member_id)

        return MemberInfo(
            member_id=member.member_id,
            full_name=member.full_name,
            email=member.email,
            phone=member.phone,
            is_active=is_active,
            roles=roles,
            role=self.resolve_access_level(roles, is_active),
            student_id=member.student_id,
            valid_until=valid_until.isoformat() if valid_until else None,
        )

    # ------------------------------------------------------------------
    # Password / Google sign-in
    # ------------------------------------------------------------------
    async def login_with_password(self, email: str, password: str, client_ip: str) -> tuple[str, MemberInfo]:
        allowed, retry_after = await check_rate_limit("login_ip", client_ip, limit=10, window_secs=300)
        if not allowed:
            raise RateLimitedError(f"Too many sign-in attempts. Please wait {retry_after}s.")
        allowed, retry_after = await check_rate_limit(f"login_{email.lower()}", "global", limit=8, window_secs=300)
        if not allowed:
            raise RateLimitedError(f"Too many sign-in attempts for this account. Please wait {retry_after}s.")

        member = await self.repo.get_by_email(email)
        if not member or not verify_password(password, member.password_hash):
            raise UnauthenticatedError("Email or password incorrect")
        return create_session_token(member.member_id), await self.get_current_user_info(member.member_id)

    @staticmethod
    def _domain_matches(email: str, domains: list[str]) -> bool:
        host = email.lower().rsplit("@", 1)[-1]
        return any(host == d or host.endswith("." + d) for d in domains)

    def check_signup_domain(self, email: str) -> str:
        """Return 'admin' or 'student' for an allowed sign-up address, otherwise reject it."""
        if self._domain_matches(email, settings.admin_domains):
            return "admin"
        if self._domain_matches(email, settings.student_domains):
            return "student"
        raise ValidationError(
            "Sign up with a student email ("
            + ", ".join("@" + d for d in settings.student_domains)
            + ") or your organisation email ("
            + ", ".join("@" + d for d in settings.admin_domains)
            + ")."
        )

    async def _bootstrap_first_admin(self, member_id: int, kind: str) -> None:
        """The very first organisation-domain sign-up becomes Admin; everyone else is assigned roles by an Admin."""
        if kind != "admin":
            return
        from sqlalchemy import text

        exists = (await self.session.execute(text("SELECT 1 FROM leadership_roles WHERE LOWER(position)='admin' LIMIT 1"))).first()
        if not exists:
            await self.session.execute(
                text("INSERT INTO leadership_roles (member_id, position, term_year) VALUES (:m,'Admin',:y) ON CONFLICT DO NOTHING"),
                {"m": member_id, "y": date.today().year},
            )

    async def register(
        self, full_name: str, email: str, password: str, phone: str | None, student_id: str | None, otp: str
    ) -> tuple[str, MemberInfo]:
        """Create an account. The inbox must be proven with the emailed code; everyone starts as a Guest (first org-domain sign-up is Admin)."""
        kind = self.check_signup_domain(email)
        if await self.repo.get_by_email(email):
            raise DuplicateEmailError()
        is_valid, reason = await verify_and_consume_otp(email, otp)
        if not is_valid:
            raise UnauthenticatedError(reason)
        member = await self.repo.create(full_name, email, phone)
        member.password_hash = hash_password(password)
        member.student_id = student_id
        await self._bootstrap_first_admin(member.member_id, kind)
        await self.session.commit()
        return create_session_token(member.member_id), await self.get_current_user_info(member.member_id)

    async def login_with_google(self, credential: str) -> tuple[str, MemberInfo]:
        """Verify a Google ID token server-side, then sign in an existing member (never creates accounts)."""
        import httpx

        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                res = await client.get("https://oauth2.googleapis.com/tokeninfo", params={"id_token": credential})
        except httpx.HTTPError as err:
            raise ServiceUnavailableError("Google sign-in is temporarily unavailable.") from err
        if res.status_code != 200:
            raise UnauthenticatedError("Google sign-in could not be verified.")
        info = res.json()
        if settings.GOOGLE_CLIENT_ID and info.get("aud") != settings.GOOGLE_CLIENT_ID:
            raise UnauthenticatedError("Google credential was issued for a different application.")
        if str(info.get("email_verified")).lower() != "true" or not info.get("email"):
            raise UnauthenticatedError("Your Google email is not verified.")

        email = info["email"].lower()
        member = await self.repo.get_by_email(email)
        if not member:
            # Google can only sign in to an account that already exists; first-time users must sign up with email.
            raise UnauthenticatedError("No account exists for this Google email. Create your account with the sign-up form first.")
        return create_session_token(member.member_id), await self.get_current_user_info(member.member_id)

    async def change_password(self, member_id: int, current_password: str | None, new_password: str) -> None:
        member = await self.repo.get_by_id(member_id)
        if not member:
            raise UnauthenticatedError("Member not found.")
        if member.password_hash and not verify_password(current_password or "", member.password_hash):
            raise ValidationError("Current password is incorrect.")
        member.password_hash = hash_password(new_password)
        await self.session.commit()

    async def generate_otp(self, email: str, client_ip: str, purpose: str = "login") -> tuple[str | None, int]:
        """
        Generate cryptographically secure 6-digit OTP code.
        Protected by rate-limiting (max 5 per IP and 3 per email per 5 minutes).
        Stores in Redis with 5-min TTL and enqueues notification.
        """
        # Only mail addresses that can actually use a code: nobody can make us email random inboxes
        known = await self.repo.get_by_email(email.lower())
        if purpose == "register":
            self.check_signup_domain(email)  # refuses addresses outside the allowed sign-up domains
            if known:
                raise DuplicateEmailError()
        elif not known:
            return None, 300  # unknown account: same answer, no code stored, no email sent

        # One code per address per minute, 3 per 15 minutes, 5 per IP per 5 minutes
        allowed_cd, retry_cd = await check_rate_limit(f"otp_cd_{email.lower()}", "global", limit=1, window_secs=60)
        if not allowed_cd:
            raise RateLimitedError(f"A code was just sent. Please wait {retry_cd}s before asking again.")

        # IP rate limit: 5 requests / 5 min
        allowed_ip, retry_after_ip = await check_rate_limit("otp_ip", client_ip, limit=5, window_secs=300)
        if not allowed_ip:
            raise RateLimitedError(f"Too many verification requests from this IP. Please wait {retry_after_ip}s.")

        # Email rate limit: 3 requests / 5 min
        allowed_email, retry_after_email = await check_rate_limit(f"otp_mail_{email.lower()}", "global", limit=3, window_secs=900)
        if not allowed_email:
            raise RateLimitedError(f"Too many OTP requests for this email. Please wait {retry_after_email}s.")

        # Generate 6-digit numeric OTP using CSPRNG
        otp = f"{secrets.randbelow(900000) + 100000}"

        stored = await store_otp(email, otp, ttl_seconds=300)
        if not stored:
            raise ServiceUnavailableError("Authentication service temporarily unavailable.")

        # Enqueue background email delivery
        await enqueue_email({
            "to": email.lower(),
            "type": "otp",
            "otp": otp,
        })

        return otp, 300

    async def verify_otp(self, email: str, otp: str) -> str:
        """
        Verify OTP with brute-force attempt limits, delete on success,
        and generate 24h session JWT.
        """
        is_valid, reason = await verify_and_consume_otp(email, otp)
        if not is_valid:
            raise UnauthenticatedError(reason)

        member = await self.repo.get_by_email(email)
        if not member:
            raise UnauthenticatedError("No registered member found for this email.")

        return create_session_token(member.member_id)

    async def verify_otp_and_register(
        self, full_name: str, email: str, phone: str | None, student_id: str | None, otp: str, password: str | None = None
    ) -> tuple[str, MemberInfo]:
        """Verify OTP on sign-up, create user account, and issue session token."""
        kind = self.check_signup_domain(email)  # only student (gmail.com / student.edu.in) or organisation addresses
        is_valid, reason = await verify_and_consume_otp(email, otp)
        if not is_valid:
            raise UnauthenticatedError(reason)

        existing = await self.repo.get_by_email(email)
        if existing:
            return create_session_token(existing.member_id), await self.get_current_user_info(existing.member_id)

        member = await self.repo.create(full_name, email, phone)
        member.student_id = student_id
        if password:
            member.password_hash = hash_password(password)
        await self._bootstrap_first_admin(member.member_id, kind)
        await self.session.commit()
        return create_session_token(member.member_id), await self.get_current_user_info(member.member_id)
