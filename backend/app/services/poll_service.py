from typing import Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.schemas.polls import PollOptionResponse, PollResponse


class PollService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_active_poll(self, member_id: Optional[int] = None) -> Optional[PollResponse]:
        res = await self.session.execute(
            text("SELECT poll_id, title, description, is_active FROM polls WHERE is_active = true ORDER BY poll_id DESC LIMIT 1")
        )
        poll_row = res.fetchone()
        if not poll_row:
            return None

        poll_id, title, description, is_active = poll_row

        opts_res = await self.session.execute(
            text(
                """
                SELECT po.option_id, po.label, po.display_order, COUNT(pv.vote_id)::int as votes
                FROM poll_options po
                LEFT JOIN poll_votes pv ON pv.option_id = po.option_id
                WHERE po.poll_id = :poll_id
                GROUP BY po.option_id, po.label, po.display_order
                ORDER BY po.display_order ASC, po.option_id ASC
                """
            ),
            {"poll_id": poll_id},
        )
        options = [
            PollOptionResponse(
                option_id=row[0],
                label=row[1],
                display_order=row[2],
                votes=row[3],
            )
            for row in opts_res.fetchall()
        ]

        user_voted_option_id: Optional[int] = None
        if member_id:
            user_vote_res = await self.session.execute(
                text("SELECT option_id FROM poll_votes WHERE poll_id = :poll_id AND member_id = :member_id"),
                {"poll_id": poll_id, "member_id": member_id},
            )
            uv = user_vote_res.fetchone()
            if uv:
                user_voted_option_id = uv[0]

        total_votes = sum(o.votes for o in options)

        return PollResponse(
            poll_id=poll_id,
            title=title,
            description=description,
            is_active=is_active,
            total_votes=total_votes,
            options=options,
            user_voted_option_id=user_voted_option_id,
        )

    async def cast_vote(self, poll_id: int, option_id: int, member_id: int) -> PollResponse:
        res = await self.session.execute(
            text("SELECT poll_id, is_active FROM polls WHERE poll_id = :poll_id"),
            {"poll_id": poll_id},
        )
        poll_row = res.fetchone()
        if not poll_row:
            raise NotFoundError("Poll not found.")
        if not poll_row[1]:
            raise ValidationError("This poll is closed.")

        opt_check = await self.session.execute(
            text("SELECT option_id FROM poll_options WHERE option_id = :option_id AND poll_id = :poll_id"),
            {"option_id": option_id, "poll_id": poll_id},
        )
        if not opt_check.fetchone():
            raise ValidationError("Invalid option selected for this poll.")

        await self.session.execute(
            text(
                """
                INSERT INTO poll_votes (poll_id, option_id, member_id, voted_at)
                VALUES (:poll_id, :option_id, :member_id, now())
                ON CONFLICT (poll_id, member_id)
                DO UPDATE SET option_id = EXCLUDED.option_id, voted_at = now()
                """
            ),
            {"poll_id": poll_id, "option_id": option_id, "member_id": member_id},
        )
        await self.session.commit()

        poll = await self.get_active_poll(member_id)
        if not poll:
            raise NotFoundError("Poll not found after voting.")
        return poll
