"""
Knowledges API routes.
"""
# Standard library imports
from datetime import datetime
from typing import Any
import uuid
from uuid import uuid4

# Third-party imports
from fastapi import APIRouter, HTTPException, UploadFile
import pymupdf
from sqlmodel import func, select

# Local application imports
from app.api.deps import CurrentUser, SessionDep
from app.models import Chat, Knowledge, KnowledgeBase, KnowledgePublic, KnowledgesPublic
from gen_model.gen_openai import gen_openai_model

router = APIRouter(prefix="/knowledges", tags=["knowledges"])


@router.get("/", response_model=KnowledgesPublic)
def read_knowledges(
    session: SessionDep, current_user: CurrentUser, skip: int = 0, limit: int = 100
) -> Any:
    """
    Retrieve knowledges.
    """
    if current_user.is_superuser:
        # pylint: disable=not-callable
        count_statement = select(func.count()).select_from(Knowledge)
        count = session.exec(count_statement).one()
        # pylint: disable=no-member
        statement = select(Knowledge).offset(skip).limit(limit).order_by(
            Knowledge.updated_at.desc())
        knowledges = session.exec(statement).all()
        return KnowledgesPublic(data=knowledges, count=count)
    count_statement = (
        # pylint: disable=not-callable
        select(func.count()).select_from(Knowledge).where(Knowledge.owner_id == current_user.id))
    count = session.exec(count_statement).one()
    statement = (
        select(Knowledge).where(Knowledge.owner_id == current_user.id).offset(skip).limit(
            # pylint: disable=no-member
            limit)).order_by(Knowledge.updated_at.desc())
    knowledges = session.exec(statement).all()
    return KnowledgesPublic(data=knowledges, count=count)


@router.get("/{id}", response_model=KnowledgePublic)
def read_knowledge(
    session: SessionDep, current_user: CurrentUser,
    # pylint: disable=redefined-builtin
    id: uuid.UUID) -> Any:
    """
    Get knowledge by ID.
    """
    knowledge = session.get(Knowledge, id)
    if not knowledge:
        raise HTTPException(status_code=404, detail="Knowledge not found")
    if not current_user.is_superuser and (knowledge.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    return knowledge


@router.post("/", response_model=KnowledgePublic)
def create_knowledge(
    *, session: SessionDep, current_user: CurrentUser, knowledge_in: KnowledgeBase
) -> Any:
    """
    Create new knowledge.
    """
    chat = session.get(Chat, knowledge_in.chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if not current_user.is_superuser and chat.owner_id != current_user.id:
        raise HTTPException(status_code=400, detail="Not enough permissions")
    content_vector = gen_openai_model.get_text_to_embedding(knowledge_in.content)
    knowledge = Knowledge.model_validate(
        knowledge_in, update={"owner_id": current_user.id, "content_vector": content_vector})
    session.add(knowledge)
    session.commit()
    session.refresh(knowledge)
    return knowledge


@router.post("/files/", response_model=KnowledgesPublic)
def create_knowledge_by_files(
    *, session: SessionDep, current_user: CurrentUser, files: list[UploadFile]) -> Any:
    """
    Create new knowledge.
    curl -X 'POST' \
        'http://127.0.0.1:8000/api/v1/knowledges/files/' \
        -H 'accept: application/json' \
        -H 'Content-Type: multipart/form-data' \
        -F 'files=@net-zero-andrea.pdf' \
        -F 'files=@phasesForAI-GoogleDocs.pdf' \
        -H 'Authorization: Bearer '
    """
    if not current_user.is_superuser:
        raise HTTPException(status_code=400, detail="Not enough permissions")
    knowledges = []
    for my_file in files:
        pdf_content = pymupdf.open(stream=my_file.file.read(), filetype="pdf")
        page_number = 0
        for page in pdf_content:
            page_text = page.get_text()
            content_vector = gen_openai_model.get_text_to_embedding(page_text)
            knowledge = Knowledge(
                id=str(uuid4()), content=page_text, content_vector=content_vector,
                owner_id=current_user.id, meta={
                    "filename": my_file.filename, "page_number": page_number,
                    "chunk_number": page_number, "category": "General"
                }, source_type="pdf", updated_at=datetime.utcnow())
            session.add(knowledge)
            session.commit()
            session.refresh(knowledge)
            page_number += 1
        pdf_content.close()
        my_file.file.close()
    return KnowledgesPublic(data=knowledges, count=len(knowledges))


@router.delete("/{id}")
def delete_knowledge(
    session: SessionDep, current_user: CurrentUser,
    # pylint: disable=redefined-builtin
    id: uuid.UUID
) -> Knowledge:
    """
    Delete an knowledge.
    """
    knowledge = session.get(Knowledge, id)
    if not knowledge:
        raise HTTPException(status_code=404, detail="Knowledge not found")
    if not current_user.is_superuser and (knowledge.owner_id != current_user.id):
        raise HTTPException(status_code=400, detail="Not enough permissions")
    session.delete(knowledge)
    session.commit()
    return Knowledge(knowledge="Knowledge deleted successfully")

@router.get("/search/{text}", response_model=KnowledgePublic)
def search_knowledge(
    session: SessionDep, current_user: CurrentUser,
    # pylint: disable=redefined-builtin
    text: str
) -> Any:
    """
    Search knowledge by content.
    # get knowledge by content with vector distance number
    session.exec(select(Knowledge).filter(Knowledge.embedding.l2_distance([3, 1, 2]) < 5))
    """
    text_vector = gen_openai_model.get_text_to_embedding(text)
    statement = (
        select(Knowledge).where(Knowledge.owner_id == current_user.id).order_by(
            # pylint: disable=no-member
            Knowledge.content_vector.l2_distance(text_vector)).limit(10))
    knowledges = session.exec(statement).all()
    if not knowledges:
        raise HTTPException(status_code=404, detail="Knowledge not found")
    return KnowledgesPublic(data=knowledges, count=len(knowledges))
