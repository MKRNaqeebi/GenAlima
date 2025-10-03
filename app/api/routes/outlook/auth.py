from typing import Dict, Any, Optional
from uuid import UUID

from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import APIRouter, HTTPException, Request, Depends
from starlette.responses import RedirectResponse
import structlog
from sqlmodel import Session, select

from app.api.deps import get_db, CurrentUser
from app.core.config import settings, Environment
from app.models import Connector

logger = structlog.get_logger()

# Initialize OAuth client - this will be initialized when the first request comes in
oauth = OAuth()

def get_oauth_client():
    """Get or create OAuth client with proper configuration"""
    if not hasattr(oauth, '_outlook_registered'):
        # Configure client without state validation for development
        oauth.register(
            name='outlook',
            client_id=settings.OUTLOOK_CLIENT_ID,
            client_secret=settings.OUTLOOK_CLIENT_SECRET,
            authorize_url='https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
            access_token_url='https://login.microsoftonline.com/common/oauth2/v2.0/token',
            api_base_url='https://graph.microsoft.com/v1.0/',
            client_kwargs={
                'scope': 'offline_access Mail.ReadWrite Mail.Send User.Read',
                'prompt': 'consent',
            }
        )
        
        oauth._outlook_registered = True
        logger.info("Registered Outlook OAuth client", 
                  client_id=settings.OUTLOOK_CLIENT_ID,
                  redirect_uri=settings.OUTLOOK_REDIRECT_URI)
    return oauth

router = APIRouter()

@router.get("/login")
async def outlook_login(request: Request):
    """Initiate Outlook OAuth2 login flow."""
    oauth_client = get_oauth_client()
    redirect_uri = settings.OUTLOOK_REDIRECT_URI
    
    # Generate a custom state and store it in session
    import secrets
    state = secrets.token_urlsafe(32)
    request.session['oauth_state'] = state
    
    print(f"DEBUG - Using Redirect URI: {redirect_uri}")
    print(f"DEBUG - Generated state: {state}")
    logger.info("Starting Outlook OAuth flow", redirect_uri=redirect_uri, state=state)
    
    # Use Authlib's authorize_redirect with our state
    return await oauth_client.outlook.authorize_redirect(request, redirect_uri, state=state)

@router.get("/logout/")
async def logout(request: Request):
    """Handle logout and session cleanup."""
    try:
        # Clear session data
        request.session.pop('outlook_token', None)
        return RedirectResponse(url=f"{settings.FRONTEND_HOST}/login")
    except Exception as e:
        logger.exception("Error during logout", error=str(e))
        raise HTTPException(status_code=400, detail="Logout failed")

@router.get("/callback/")
async def outlook_callback(
    request: Request,
    db: Session = Depends(get_db)
):
    """Handle OAuth2 callback from Outlook."""
    try:
        # Log incoming request parameters
        received_state = request.query_params.get('state')
        stored_state = request.session.get('oauth_state')
        code = request.query_params.get('code')
        
        print(f"DEBUG - Received state: {received_state}")
        print(f"DEBUG - Stored state: {stored_state}")
        print(f"DEBUG - Received code: {code}")
        
        logger.info("OAuth callback received", 
                   state=received_state,
                   stored_state=stored_state,
                   has_code=bool(code),
                   session_keys=list(request.session.keys()))
        
        # Check if we're in development mode
        is_dev = settings.ENVIRONMENT in [Environment.LOCAL, Environment.DEVELOPMENT]
        
        # Validate state parameter (unless in development mode with state mismatch)
        if not received_state:
            logger.error("No state received in OAuth callback")
            raise HTTPException(status_code=400, detail="No state parameter provided")
        
        if received_state != stored_state:
            if not is_dev:
                logger.error("State mismatch in OAuth callback", 
                           received=received_state, stored=stored_state)
                raise HTTPException(status_code=400, detail="Invalid state parameter")
            else:
                logger.warning("State mismatch in development mode, proceeding anyway", 
                             received=received_state, stored=stored_state)
        
        # Clear the state from session
        request.session.pop('oauth_state', None)
        
        # Check for authorization code
        if not code:
            logger.error("No authorization code in callback")
            raise HTTPException(status_code=400, detail="Missing authorization code")
        
        # Get token from Microsoft OAuth endpoint
        # Use the regular OAuth client but handle state validation errors
        oauth_client = get_oauth_client()
        try:
            token = await oauth_client.outlook.authorize_access_token(request)
        except Exception as e:
            if 'state' in str(e).lower() and is_dev:
                # In development mode, perform manual token exchange as a fallback
                logger.warning("Using manual token exchange due to state validation error")
                
                # Create a new httpx client for the token request
                import httpx
                
                token_url = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
                token_data = {
                    'client_id': settings.OUTLOOK_CLIENT_ID,
                    'client_secret': settings.OUTLOOK_CLIENT_SECRET,
                    'code': code,
                    'grant_type': 'authorization_code',
                    'redirect_uri': settings.OUTLOOK_REDIRECT_URI
                }
                
                async with httpx.AsyncClient() as client:
                    token_response = await client.post(token_url, data=token_data)
                    if token_response.status_code != 200:
                        logger.error("Manual token exchange failed", 
                                  status_code=token_response.status_code,
                                  response=token_response.text)
                        raise HTTPException(status_code=400, 
                                         detail=f"Failed to exchange authorization code: {token_response.text}")
                    
                    token = token_response.json()
            else:
                # Re-raise the exception if it's not related to state validation
                # or if we're not in development mode
                logger.error(f"Error during token exchange: {str(e)}")
                raise HTTPException(status_code=400, detail=f"Failed to get access token: {str(e)}")
        
        if not token:
            raise HTTPException(status_code=400, detail="Failed to get access token")
            
        logger.info("Successfully received OAuth token", token_type=token.get('token_type'))
        
        # Get user info from Microsoft Graph to identify the user
        from connectors.outlook_connector import OutlookMailConnector
        outlook_connector = OutlookMailConnector(credentials_data=token)
        profile = await outlook_connector.get_profile()
        
        if not profile:
            raise HTTPException(status_code=400, detail="Failed to get user profile")
        
        # Store the token and user info in session for now
        # In production, you'd want to associate this with the logged-in user
        request.session['outlook_token'] = token
        request.session['outlook_profile'] = profile
        
        logger.info("Outlook authentication successful", 
                   email=profile.get('email'),
                   display_name=profile.get('displayName'))
        
        # Redirect to frontend with success message
        return RedirectResponse(url=f"{settings.FRONTEND_HOST}/connectors?outlook_auth=success")
        
    except OAuthError as e:
        logger.exception("OAuth error in callback", error=str(e))
        raise HTTPException(
            status_code=400,
            detail=f"OAuth error: {str(e)}"
        )
    except Exception as e:
        logger.exception("Error in Outlook OAuth callback")
        raise HTTPException(
            status_code=400,
            detail=f"Authentication failed: {str(e)}"
        )

@router.post("/connect")
async def connect_outlook(
    request: Request,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Connect the authenticated Outlook account to the current user."""
    try:
        # Get the stored token from session
        token = request.session.get('outlook_token')
        profile = request.session.get('outlook_profile')
        
        if not token or not profile:
            raise HTTPException(
                status_code=400, 
                detail="No Outlook authentication found. Please authenticate with Outlook first."
            )
        
        # Check if connector already exists for this user
        existing_connector = db.exec(
            select(Connector).where(
                Connector.owner_id == current_user.id,
                Connector.name == "Outlook"
            )
        ).first()
        
        if existing_connector:
            # Update existing connector with token and user info
            existing_connector.meta_data = {
                "auth": "OAuth2",
                "email": profile.get('email'),
                "display_name": profile.get('displayName'),
                "user_id": profile.get('id'),
                "token": token  # Store OAuth token in meta_data
            }
        else:
            # Create new connector
            connector = Connector(
                owner_id=current_user.id,
                name="Outlook",
                description="Microsoft Outlook email connector",
                meta_data={
                    "auth": "OAuth2",
                    "email": profile.get('email'),
                    "display_name": profile.get('displayName'),
                    "user_id": profile.get('id'),
                    "token": token  # Store OAuth token in meta_data
                }
            )
            db.add(connector)
        
        db.commit()
        
        # Clear session data
        request.session.pop('outlook_token', None)
        request.session.pop('outlook_profile', None)
        
        logger.info("Outlook connector created successfully", 
                   user_id=current_user.id,
                   email=profile.get('email'))
        
        return {
            "success": True,
            "message": "Outlook account connected successfully",
            "email": profile.get('email'),
            "display_name": profile.get('displayName')
        }
        
    except Exception as e:
        logger.exception("Error connecting Outlook account")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to connect Outlook account: {str(e)}"
        )

@router.get("/status")
async def outlook_auth_status(
    request: Request,
    db: Session = Depends(get_db),
    current_user: CurrentUser = None
):
    """
    Check if there's a pending Outlook authentication in the session
    or if the user has an established Outlook connection.
    """
    # First check session for pending auth
    token = request.session.get('outlook_token')
    profile = request.session.get('outlook_profile')
    
    if token and profile:
        return {
            "authenticated": True,
            "email": profile.get('email'),
            "display_name": profile.get('displayName'),
            "pending": True  # This is a pending auth, not yet saved to database
        }
    
    # If no pending auth, and we have a current user, check for saved connection
    if current_user:
        outlook_connector = db.exec(
            select(Connector).where(
                Connector.owner_id == current_user.id,
                Connector.name == "Outlook"
            )
        ).first()
        
        if outlook_connector and outlook_connector.meta_data:
            return {
                "authenticated": True,
                "email": outlook_connector.meta_data.get("email"),
                "display_name": outlook_connector.meta_data.get("display_name"),
                "pending": False  # This is an established connection
            }
    
    # No auth found
    return {"authenticated": False, "pending": False}