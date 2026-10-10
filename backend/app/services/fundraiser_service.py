from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError, NotFoundError
from app.core.helpers import format_money, to_decimal
from app.core.redis import delete_report_cache, get_report_cache, set_report_cache
from app.models.schema_models import FundraiserTask
from app.repositories.fundraiser_repo import FundraiserRepository
from app.repositories.member_repo import MemberRepository
from app.schemas.fundraisers import (
    FundraiserCreate,
    FundraiserProgressResponse,
    FundraiserResponse,
    TaskCreate,
    TaskResponse,
    TaskUpdate,
)


class FundraiserService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = FundraiserRepository(session)
        self.member_repo = MemberRepository(session)

    async def create_fundraiser(self, data: FundraiserCreate) -> FundraiserResponse:
        goal = to_decimal(data.goal_amount) if data.goal_amount else None
        f = await self.repo.create(
            title=data.title,
            description=data.description,
            event_date=data.event_date,
            goal_amount=goal,
        )
        await self.session.commit()
        return FundraiserResponse(
            fundraiser_id=f.fundraiser_id,
            title=f.title,
            description=f.description,
            event_date=f.event_date,
            goal_amount=format_money(f.goal_amount) if f.goal_amount else None,
        )

    async def list_fundraisers(self) -> list[FundraiserResponse]:
        items = await self.repo.list()
        return [
            FundraiserResponse(
                fundraiser_id=f.fundraiser_id,
                title=f.title,
                description=f.description,
                event_date=f.event_date,
                goal_amount=format_money(f.goal_amount) if f.goal_amount else None,
            )
            for f in items
        ]

    async def get_fundraiser(self, fundraiser_id: int) -> FundraiserResponse:
        f = await self.repo.get_by_id(fundraiser_id)
        if not f:
            raise NotFoundError("Fundraiser not found.")
        return FundraiserResponse(
            fundraiser_id=f.fundraiser_id,
            title=f.title,
            description=f.description,
            event_date=f.event_date,
            goal_amount=format_money(f.goal_amount) if f.goal_amount else None,
        )

    async def create_task(self, fundraiser_id: int, data: TaskCreate) -> TaskResponse:
        f = await self.repo.get_by_id(fundraiser_id)
        if not f:
            raise NotFoundError("Fundraiser not found.")

        task = await self.repo.create_task(
            fundraiser_id=fundraiser_id,
            title=data.title,
            description=data.description,
            assigned_to=data.assigned_to,
            due_date=data.due_date,
        )
        await self.session.commit()
        await delete_report_cache(f"fundraiser_progress_{fundraiser_id}")
        return await self._format_task(task)

    async def list_tasks(self, fundraiser_id: int) -> list[TaskResponse]:
        tasks = await self.repo.list_tasks(fundraiser_id)
        return [await self._format_task(t) for t in tasks]

    async def update_task(
        self,
        task_id: int,
        data: TaskUpdate,
        caller_member_id: int,
        is_officer: bool,
    ) -> TaskResponse:
        task = await self.repo.get_task_by_id(task_id)
        if not task:
            raise NotFoundError("Task not found.")

        # Assignee can only change status; officers can change anything
        if not is_officer:
            if task.assigned_to != caller_member_id:
                raise ForbiddenError("You can only update tasks assigned to you.")
            if data.title or data.description or data.assigned_to or data.due_date:
                raise ForbiddenError("Assignees can only update the status of their assigned tasks.")

        updated = await self.repo.update_task(
            task_id=task_id,
            title=data.title if is_officer else None,
            description=data.description if is_officer else None,
            assigned_to=data.assigned_to if is_officer else None,
            status=data.status,
            due_date=data.due_date if is_officer else None,
        )
        await self.session.commit()
        await delete_report_cache(f"fundraiser_progress_{task.fundraiser_id}")
        return await self._format_task(updated)

    async def get_progress(self, fundraiser_id: int) -> FundraiserProgressResponse:
        cache_key = f"fundraiser_progress_{fundraiser_id}"
        cached = await get_report_cache(cache_key)
        if cached:
            return FundraiserProgressResponse(**cached)

        f, total, done, raised = await self.repo.get_progress(fundraiser_id)
        resp = FundraiserProgressResponse(
            fundraiser_id=f.fundraiser_id,
            title=f.title,
            goal_amount=format_money(f.goal_amount) if f.goal_amount else None,
            tasks_total=total,
            tasks_done=done,
            amount_raised=format_money(raised),
        )
        await set_report_cache(cache_key, resp.model_dump(), ttl=60)
        return resp

    async def _format_task(self, task: FundraiserTask) -> TaskResponse:
        assignee_name = None
        if task.assigned_to:
            m = await self.member_repo.get_by_id(task.assigned_to)
            assignee_name = m.full_name if m else None

        return TaskResponse(
            task_id=task.task_id,
            fundraiser_id=task.fundraiser_id,
            title=task.title,
            description=task.description,
            assigned_to=task.assigned_to,
            assignee_name=assignee_name,
            status=task.status,
            due_date=task.due_date,
        )
