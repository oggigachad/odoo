import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.errors import APIException
from app.core.middleware import request_id_context

logger = logging.getLogger(__name__)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(APIException)
    async def api_exception_handler(request: Request, exc: APIException) -> JSONResponse:
        req_id = getattr(request.state, "request_id", None) or request_id_context.get()
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details,
                    "request_id": req_id,
                }
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        req_id = getattr(request.state, "request_id", None) or request_id_context.get()
        fields = []
        for err in exc.errors():
            loc = err.get("loc", [])
            field_name = str(loc[-1]) if loc else "body"
            fields.append({"field": field_name, "message": err.get("msg", "Invalid value")})

        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Please check the highlighted fields.",
                    "details": {"fields": fields},
                    "request_id": req_id,
                }
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        req_id = getattr(request.state, "request_id", None) or request_id_context.get()
        code_map = {
            401: "UNAUTHENTICATED",
            403: "FORBIDDEN",
            404: "NOT_FOUND",
            405: "NOT_ALLOWED",
            429: "RATE_LIMITED",
            503: "SERVICE_UNAVAILABLE",
        }
        code = code_map.get(exc.status_code, "ERROR")
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": code,
                    "message": str(exc.detail),
                    "details": {},
                    "request_id": req_id,
                }
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        req_id = getattr(request.state, "request_id", None) or request_id_context.get()
        logger.error(f"Unhandled exception: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": f"Something went wrong. Reference: {req_id}.",
                    "details": {},
                    "request_id": req_id,
                }
            },
        )
