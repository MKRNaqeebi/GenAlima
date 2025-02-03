"""
This module contains the logic for generating completions for the user input.
"""
import importlib

# from openai import
from app.firestore import get_document_by_id
from app.models import CompletionsInput, Message

def chat_completions(user_input: CompletionsInput) -> list[Message]:
  """
  Generate completions for the user input.
  """
  # get template from firebase by id
  prompt_template = get_document_by_id("TEMPLATE_COLLECTION_NAME", user_input.prompt)
  # get model from firebase by id
  large_model = get_document_by_id("MODEL_COLLECTION_NAME", prompt_template.model)
  # get connector from firebase by id
  connector = get_document_by_id("CONNECTOR_COLLECTION_NAME", prompt_template.connector)
  # create the completion request
  connector_function = importlib.import_module(f'Connector.{connector.function}')
  context_from_connector = connector_function(user_input.query)
  # create the completion request
  completion_function = importlib.import_module(f'LargeModel.{large_model.function}')
  completion_response = completion_function(
    user_input.query, prompt_template, context_from_connector)
  return completion_response
