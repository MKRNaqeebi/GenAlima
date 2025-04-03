"""
Call the default connector
  Openai api connector for gpt-4-mini
"""
import openai

from app.core.config import settings
from app.models import MessageBase

def get_completions(chat_history: list[MessageBase]) -> str:
  """
  Function to generate completions for the user input.
  """
  client = openai.Client(api_key=settings.OPENAI_API_KEY)
  chat_completion = client.chat.completions.create(
    messages=chat_history,
    model="gpt-4o-mini",
  )
  return chat_completion.choices[0].message.content
