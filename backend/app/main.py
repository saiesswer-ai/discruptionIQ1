"""FastAPI application entrypoint for DisruptionIQ."""
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import Settings, get_settings
from app.core.database import init_database
from app.api.v1.router import api_router
from app.schemas.common import ErrorBody


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build and configure the API without coupling import time to the server."""
    app_settings = settings or get_settings()
    app = FastAPI(
        title=app_settings.project_name,
        version=app_settings.version,
        description="Backend API for DisruptionIQ Supply Chain Disruption Management Platform",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=app_settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Actor-Id", "X-Actor-Role"],
    )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_, exc: RequestValidationError) -> JSONResponse:
        body = ErrorBody(
            code="VALIDATION_ERROR", message="The request could not be validated.",
            details={"errors": exc.errors()}, timestamp=datetime.now(timezone.utc),
        )
        return JSONResponse(status_code=422, content={"error": body.model_dump(mode="json")})

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(_, exc: StarletteHTTPException) -> JSONResponse:
        if isinstance(exc.detail, dict):
            code = exc.detail.get("code", "RESOURCE_NOT_FOUND" if exc.status_code == 404 else "HTTP_ERROR")
            message = exc.detail.get("message", "The requested operation could not be completed.")
            details = exc.detail.get("details", {})
        else:
            message = exc.detail if isinstance(exc.detail, str) else "The requested operation could not be completed."
            code = "RESOURCE_NOT_FOUND" if exc.status_code == 404 else "HTTP_ERROR"
            details = {}

        body = ErrorBody(
            code=code,
            message=message,
            details=details,
            timestamp=datetime.now(timezone.utc),
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": body.model_dump(mode="json"), "detail": exc.detail},
            headers=exc.headers,
        )

    app.include_router(api_router, prefix=app_settings.api_v1_prefix)

    @app.on_event("startup")
    def initialize_database_schema() -> None:
        """Create missing additive tables before serving requests."""
        init_database()

    @app.get("/", tags=["System"])
    def root() -> dict[str, str]:
        return {"message": "Welcome to DisruptionIQ API", "documentation": "/docs", "health": f"{app_settings.api_v1_prefix}/health"}

    return app


app = create_app()
