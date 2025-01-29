"""
config.py
- settings for the FastAPI app
- environment variables
"""
import os

from dotenv import load_dotenv

load_dotenv()

# Environment variables
GOOGLE_CLOUD_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT")
FIRE_LOGIN_API_URL = os.getenv("FIRE_LOGIN_API_URL")
FIRE_WEB_API_KEY=os.getenv('FIRE_WEB_API_KEY', '')
FIRE_LOGIN_API_URL=os.getenv('FIRE_LOGIN_API_URL', f'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIRE_WEB_API_KEY}')
SECRET_KEY=os.getenv('SECRET_KEY', 'wrtxsQA28DT9lolMKvdlgwd2nY5www')
CHAT_COLLECTION_NAME=os.getenv('CHAT_COLLECTION_NAME', 'chat')
MODEL_COLLECTION_NAME=os.getenv('MODEL_COLLECTION_NAME', 'model')
USER_COLLECTION_NAME=os.getenv('USER_COLLECTION_NAME', 'user')
TEMPLATE_COLLECTION_NAME=os.getenv('TEMPLATE_COLLECTION_NAME', 'template')
CONNECTOR_COLLECTION_NAME=os.getenv('CONNECTOR_COLLECTION_NAME', 'connector')
