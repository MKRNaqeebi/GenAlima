"""
Dependencies for FastAPI routes.
"""
# Standard library imports
from collections.abc import Generator
from typing import Annotated, Any

# Third-party imports
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from jwt.exceptions import InvalidTokenError
from pydantic import ValidationError
from sqlmodel import Session, select

# Local application imports
from connectors.outlook_connector import OutlookMailConnector
from app.core import security
from app.core.config import settings
from app.core.db import engine
from app.models import TokenPayload, User, Connector

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/login/access-token"
)


def get_db() -> Generator[Session, None, None]:
    """
    Get a database session.
    """
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_db)]
TokenDep = Annotated[str, Depends(reusable_oauth2)]


def get_user_by_email(session: SessionDep, email: str) -> User | None:
    """
    Get a user by email.
    """
    statement = select(User).where(User.email == email)
    user = session.exec(statement).first()
    return user

def get_current_user(session: SessionDep, token: TokenDep) -> User:
    """
    Get the current user from the token.
    """
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
    except (InvalidTokenError, ValidationError) as exception:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        ) from exception
    user = session.get(User, token_data.sub)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_current_active_superuser(current_user: CurrentUser) -> User:
    """
    Get the current active superuser.
    """
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403, detail="The user doesn't have enough privileges"
        )
    return current_user

def get_outlook_connector(
    credentials_data: dict[str, str]
) -> OutlookMailConnector:
    """
    Dependency to provide an instance of OutlookMailConnector.

    Args:
        credentials_data: Dictionary containing OAuth2 credentials including:
            - access_token: OAuth2 access token
            - refresh_token: OAuth2 refresh token
            - client_id: Application client ID
            - client_secret: Application client secret
            - user_email: User's email address

    Returns:
        An instance of OutlookMailConnector
    """
    return OutlookMailConnector(credentials_data=credentials_data)

def get_connector_status(
    session: SessionDep, 
    current_user: CurrentUser
) -> dict[str, Any]:
    """
    Get connector status for the current user.
    
    This function returns status information for each connector type,
    including whether it's connected and user details.
    
    Returns:
        Dictionary with connector status information:
        {
            "outlook": {
                "connected": bool,
                "user_info": {
                    "email": str,
                    "display_name": str
                }
            },
            ...other connectors...
        }
    """
    connectors = {}
    
    # Get all user connectors from database
    statement = select(Connector).where(
        Connector.owner_id == current_user.id
    )
    user_connectors = session.exec(statement).all()
    
    # Check for Outlook connector
    outlook_connector = next((c for c in user_connectors if c.name.lower() == "outlook"), None)
    if outlook_connector:
        connectors["outlook"] = {
            "connected": True,
            "user_info": {
                "email": outlook_connector.meta_data.get("email") if outlook_connector.meta_data else None,
                "display_name": outlook_connector.meta_data.get("display_name") if outlook_connector.meta_data else None
            }
        }
    else:
        connectors["outlook"] = {
            "connected": False,
            "user_info": None
        }
    
    # Add status for other connector types as needed
    
    return connectors
