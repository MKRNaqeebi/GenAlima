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
from app.core.config import (
  settings, MODEL_COLLECTION_NAME, TEMPLATE_COLLECTION_NAME, CONNECTOR_COLLECTION_NAME,
  BUILD_PATH
)
from app.completions import chat_completions
from app.utils import auth_required
from app.models import CompletionsInput, Message, LargeModel, PromptTemplate
from app.firestore import get_documents_from_firebase


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

app.mount("/static", StaticFiles(directory=f"{BUILD_PATH}/static"), name="static")
app.mount("/assets", StaticFiles(directory=f"{BUILD_PATH}/assets"), name="assets")
templates = Jinja2Templates(directory=BUILD_PATH)

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

@app.get("/")
def read_root():
  """
  Root endpoint for the FastAPI application.
  """
  return {"Hello": "World"}

@app.get("/api/completions")
@auth_required
def get_completions(user_input: CompletionsInput) -> list[Message]:
  """
  Endpoint for generating completions for the user input.
  """
  return chat_completions(user_input)

@app.get("/api/models")
@auth_required
def get_model() -> LargeModel:
  """
  Endpoint for getting the model configuration.
  """
  return get_documents_from_firebase(MODEL_COLLECTION_NAME)

@app.get("/api/templates")
@auth_required
def get_templates() -> PromptTemplate:
  """
  Endpoint for getting the prompt templates.
  """
  return get_documents_from_firebase(TEMPLATE_COLLECTION_NAME)

@app.get("/api/connectors")
@auth_required
def get_connectors() -> PromptTemplate:
  """
  Endpoint for getting the prompt templates.
  """
  return get_documents_from_firebase(CONNECTOR_COLLECTION_NAME)

@app.get("/")
async def serve_index(request: Request):
  """
  Serve the frontend application.
  """
  return templates.TemplateResponse("index.html", {"request": request})

@app.get("/c/new")
async def serve_new(request: Request):
  """
  Serve the frontend application.
  """
  return templates.TemplateResponse("index.html", {"request": request})

@app.get("/c/settings")
async def serve_settings(request: Request):
  """
  Serve the frontend application.
  """
  return templates.TemplateResponse("index.html", {"request": request})

if __name__ == "__main__":
  import uvicorn
  uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)
