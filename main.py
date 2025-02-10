"""
This is the main file for the FastAPI application. It contains the routes for the API endpoints.
"""
from fastapi import FastAPI, Request
from fastapi.routing import APIRoute
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import sentry_sdk
from starlette.middleware.cors import CORSMiddleware

from app.api.main import api_router
from app.core.config import settings
from app.utils import auth_required
from app.models import CompletionInput, Message


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

app.mount("/assets", StaticFiles(directory=f"{settings.BUILD_PATH}/assets"), name="assets")
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
@app.get("/templates")
@app.get("/chats")
@app.get("/messages")
@app.get("/admin")
@app.get("/signup")
@app.get("/recover-password")
async def serve_index(request: Request):
  """
  Serve the frontend application.
  """
  return templates.TemplateResponse("index.html", {"request": request})

if __name__ == "__main__":
  import uvicorn
  uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)
