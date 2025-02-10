"""
Template routes.
"""
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import Template, TemplateCreate, TemplatePublic, TemplatesPublic, TemplateUpdate, Message

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("/", response_model=TemplatesPublic)
def read_templates(
  session: SessionDep, current_user: CurrentUser, skip: int = 0, limit: int = 100
) -> Any:
  """
  Retrieve templates.
  """
  if current_user.is_superuser:
    count_statement = select(func.count()).select_from(Template)
    count = session.exec(count_statement).one()
    statement = select(Template).offset(skip).limit(limit)
    templates = session.exec(statement).all()
  else:
    count_statement = (
      select(func.count())
      .select_from(Template)
      .where(Template.owner_id == current_user.id)
    )
    count = session.exec(count_statement).one()
    statement = (
      select(Template)
      .where(Template.owner_id == current_user.id)
      .offset(skip)
      .limit(limit)
    )
    templates = session.exec(statement).all()

  return TemplatesPublic(data=templates, count=count)


@router.get("/{id}", response_model=TemplatePublic)
def read_template(session: SessionDep, current_user: CurrentUser, id: uuid.UUID) -> Any:
  """
  Get template by ID.
  """
  template = session.get(Template, id)
  if not template:
    raise HTTPException(status_code=404, detail="Template not found")
  if not current_user.is_superuser and (template.owner_id != current_user.id):
    raise HTTPException(status_code=400, detail="Not enough permissions")
  return template


@router.post("/", response_model=TemplatePublic)
def create_template(
  *, session: SessionDep, current_user: CurrentUser, template_in: TemplateCreate
) -> Any:
  """
  Create new template.
  """
  template = Template.model_validate(template_in, update={"owner_id": current_user.id})
  session.add(template)
  session.commit()
  session.refresh(template)
  return template


@router.put("/{id}", response_model=TemplatePublic)
def update_template(
  *,
  session: SessionDep,
  current_user: CurrentUser,
  id: uuid.UUID,
  template_in: TemplateUpdate,
) -> Any:
  """
  Update an template.
  """
  template = session.get(Template, id)
  if not template:
    raise HTTPException(status_code=404, detail="Template not found")
  if not current_user.is_superuser and (template.owner_id != current_user.id):
    raise HTTPException(status_code=400, detail="Not enough permissions")
  update_dict = template_in.model_dump(exclude_unset=True)
  template.sqlmodel_update(update_dict)
  session.add(template)
  session.commit()
  session.refresh(template)
  return template


@router.delete("/{id}")
def delete_template(
  session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Message:
  """
  Delete an template.
  """
  template = session.get(Template, id)
  if not template:
    raise HTTPException(status_code=404, detail="Template not found")
  if not current_user.is_superuser and (template.owner_id != current_user.id):
    raise HTTPException(status_code=400, detail="Not enough permissions")
  session.delete(template)
  session.commit()
  return Message(message="Template deleted successfully")
