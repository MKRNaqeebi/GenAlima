"""
This is the main file for the FastAPI application. It contains the routes for the API endpoints.
"""
# Third-party imports
from fastapi import FastAPI, Request
from fastapi.routing import APIRoute
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import sentry_sdk
from starlette.middleware.cors import CORSMiddleware

# Local application imports
from app.api.main import api_router
from app.core.config import settings
from app.models import CompletionInput, Message
from app.utils import auth_required


def custom_generate_unique_id(route: APIRoute) -> str:
    """
    Custom function to generate unique id for the FastAPI application.
    """
    if route.tags:
        return f"{route.tags[0]}-{route.name}"
    return route.name


if settings.SENTRY_DSN and settings.ENVIRONMENT != "local":
    sentry_sdk.init(dsn=str(settings.SENTRY_DSN), enable_tracing=True)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    generate_unique_id_function=custom_generate_unique_id,
)

app.mount(
    "/assets", StaticFiles(directory=f"{settings.BUILD_PATH}/assets"), name="assets")
templates = Jinja2Templates(directory=settings.BUILD_PATH)

# Set all CORS enabled origins
if settings.all_cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.all_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/api/completions")
@auth_required
def get_completions(user_input: CompletionInput) -> list[Message]:
    """
    Endpoint for generating completions for the user input.
    """
    return {"completions": user_input}


@app.get("/")
@app.get("/login")
@app.get("/settings")
@app.get("/items")
@app.get("/home")
@app.get("/chats")
@app.get("/chat/{chat_id}")
@app.get("/messages")
@app.get("/admin")
@app.get("/signup")
@app.get("/recover-password")
@app.get("/workflows")
@app.get("/workflow/{workflow_id}")
async def serve_index(request: Request):
    """
    Serve the frontend application.

    index.html must not be cached: it names the hashed bundle, so a cached copy
    keeps a browser on the previous build after a rebuild (which looks like a
    fix "not working"). The hashed assets under /assets are safe to cache.
    """
    return templates.TemplateResponse(
        "index.html",
        {"request": request},
        headers={"Cache-Control": "no-store, must-revalidate"},
    )

if __name__ == "__main__":
    # Standard library imports
    import os

    # Third-party imports
    import uvicorn

    base_dir = os.path.dirname(os.path.abspath(__file__))
    # uvicorn's stat reloader walks every `.py` file under the watched
    # directories. Watching the repository root descends into
    # frontend/node_modules, where Vite and npm create and remove temporary
    # directories while the walk is in progress; that race crashes the reloader
    # with FileNotFoundError. Watch only the Python source trees.
    # Trade-off: editing this file now needs a manual restart.
    source_dirs = [
        os.path.join(base_dir, name)
        for name in ("app", "agent", "scripts")
        if os.path.isdir(os.path.join(base_dir, name))
    ]
    # Port 8000 matches README and frontend/.env (VITE_API_URL). The Dockerfile
    # overrides the port on its own command line, so this only affects local dev.
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=source_dirs or None,
    )
