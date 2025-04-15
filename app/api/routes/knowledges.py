"""
Knowledges API routes.
"""
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Knowledge, KnowledgeBase, KnowledgePublic, KnowledgesPublic, Chat)
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
            Knowledge.created_at.desc())
        knowledges = session.exec(statement).all()
        return KnowledgesPublic(data=knowledges, count=count)
    count_statement = (
        # pylint: disable=not-callable
        select(func.count()).select_from(Knowledge).where(Knowledge.owner_id == current_user.id))
    count = session.exec(count_statement).one()
    statement = (
        select(Knowledge).where(Knowledge.owner_id == current_user.id).offset(skip).limit(
            # pylint: disable=no-member
            limit)).order_by(Knowledge.created_at.desc())
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
