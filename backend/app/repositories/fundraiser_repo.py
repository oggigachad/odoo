import datetime
from decimal import Decimal
from typing import Optional, Sequence

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import NotFoundError
from app.models.schema_models import Fundraiser, FundraiserTask, Payment


class FundraiserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(
        self,
        title: str,
        description: Optional[str],
        event_date: Optional[datetime.date],
        goal_amount: Optional[Decimal],
    ) -> Fundraiser:
        f = Fundraiser(
            title=title.strip(),
            description=description.strip() if description else None,
            event_date=event_date,
            goal_amount=goal_amount,
        )
        self.session.add(f)
        await self.session.flush()
        await self.session.refresh(f)
        return f

    async def list(self) -> Sequence[Fundraiser]:
        result = await self.session.execute(select(Fundraiser).order_by(Fundraiser.event_date.asc()))
        return result.scalars().all()

    async def get_by_id(self, fundraiser_id: int) -> Optional[Fundraiser]:
        return await self.session.get(Fundraiser, fundraiser_id)

    async def create_task(
        self,
        fundraiser_id: int,
        title: str,
        description: Optional[str],
        assigned_to: Optional[int],
        due_date: Optional[datetime.date],
    ) -> FundraiserTask:
        task = FundraiserTask(
            fundraiser_id=fundraiser_id,
            title=title.strip(),
            description=description.strip() if description else None,
            assigned_to=assigned_to,
            due_date=due_date,
            status="todo",
        )
        self.session.add(task)
        await self.session.flush()
        await self.session.refresh(task)
        return task

    async def get_task_by_id(self, task_id: int) -> Optional[FundraiserTask]:
        stmt = (
            select(FundraiserTask)
            .options(selectinload(FundraiserTask.assignee))
            .where(FundraiserTask.task_id == task_id)
        )
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def list_tasks(self, fundraiser_id: int) -> Sequence[FundraiserTask]:
        result = await self.session.execute(
            select(FundraiserTask)
            .options(selectinload(FundraiserTask.assignee))
            .where(FundraiserTask.fundraiser_id == fundraiser_id)
            .order_by(FundraiserTask.due_date.asc())
        )
        return result.scalars().all()

    async def update_task(
        self,
        task_id: int,
        title: Optional[str] = None,
        description: Optional[str] = None,
        assigned_to: Optional[int] = None,
        status: Optional[str] = None,
        due_date: Optional[datetime.date] = None,
    ) -> FundraiserTask:
        task = await self.get_task_by_id(task_id)
        if not task:
            raise NotFoundError("Task not found.")
        if title is not None:
            task.title = title.strip()
        if description is not None:
            task.description = description.strip()
        if assigned_to is not None:
            task.assigned_to = assigned_to
        if status is not None:
            task.status = status
        if due_date is not None:
            task.due_date = due_date
        await self.session.flush()
        await self.session.refresh(task)
        return task

    async def get_progress(self, fundraiser_id: int) -> tuple[Fundraiser, int, int, Decimal]:
        f = await self.get_by_id(fundraiser_id)
        if not f:
            raise NotFoundError("Fundraiser not found.")

        tasks_res = await self.session.execute(
            select(
                func.count(FundraiserTask.task_id),
                func.count(case((FundraiserTask.status == "done", 1))),
            ).where(FundraiserTask.fundraiser_id == fundraiser_id)
        )
        tasks_row = tasks_res.one()
        tasks_total = tasks_row[0] or 0
        tasks_done = tasks_row[1] or 0

        raised_res = await self.session.execute(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.fundraiser_id == fundraiser_id,
                Payment.category == "fundraiser",
            )
        )
        raised = raised_res.scalar_one()

        return f, tasks_total, tasks_done, Decimal(str(raised))
