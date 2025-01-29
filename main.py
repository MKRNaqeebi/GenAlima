"""
This is the main file for the FastAPI application. It contains the routes for the API endpoints.
"""
from fastapi import FastAPI, HTTPException

from app.completions import chat_completions
from app.utils import auth_required
from app.schema import CompletionsInputSchema, MessageSchema, LargeModelSchema, PromptTemplateSchema
from app.firestore import get_documents_from_firebase
from app.config import MODEL_COLLECTION_NAME, TEMPLATE_COLLECTION_NAME, CONNECTOR_COLLECTION_NAME

app = FastAPI()

@app.get("/")
def read_root():
    return {"Hello": "World"}

@app.get("/completions")
@auth_required()
def get_completions(request: Request, user_input: CompletionsInputSchema) -> list[MessageSchema]:
    return chat_completions(user_input)

@app.get("/models")
@auth_required()
def get_model(request: Request) -> LargeModelSchema:
    return get_documents_from_firebase(MODEL_COLLECTION_NAME)

@app.get("/templates")
@auth_required()
def get_templates(request: Request) -> PromptTemplateSchema:
    return get_documents_from_firebase(TEMPLATE_COLLECTION_NAME)

@app.get("/connectors")
@auth_required()
def get_connectors(request: Request) -> PromptTemplateSchema:
    return get_documents_from_firebase(CONNECTOR_COLLECTION_NAME)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
