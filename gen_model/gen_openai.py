"""
Call openai APIs
"""
from typing import List, Dict, Any, Generator

from openai import OpenAI

from app.core.config import settings


class OpenAIService:
    """
    A wrapper class for OpenAI API calls.
    """
    def __init__(self):
        """
        Initialize the OpenAIWrapper with an API key.
        
        Args:
            api_key (str): The OpenAI API key.
        """
        self.client = OpenAI(api_key=settings.OPENAI_API_KEY)

    def get_text_to_embedding(self, text: str) -> List[float]:
        """
        Convert text to embedding representation.
        Args:
            text (str): The input text to convert.
        Returns:
            List[float]: A list representing the embedding.
        """
        embedding = self.client.embeddings.create(
            input=text,
            model="text-embedding-3-small",
        )["data"][0]["embedding"]
        return embedding

    def call_openai_model(
        self, model: str, messages: List[Dict[str, str]]
        ) -> Dict[str, Any]:
        """
        Call OpenAI API with the specified parameters.
        Args:
            model (str): The OpenAI model to use.
            messages (List[Dict[str, Any]]): The messages to send to the model.
        Returns:
            Dict[str, Any]: The response from the OpenAI API.
        """
        completion = self.client.chat.completions.create(
            model=model, messages=messages)
        return completion.choices[0].message.content

    def call_openai_model_stream(
        self, model: str, messages: List[Dict[str, str]]
        ) -> Generator[str, None, None]:
        """
        Call OpenAI API with streaming enabled.
        Args:
            model (str): The OpenAI model to use.
            messages (List[Dict[str, Any]]): The messages to send to the model.
        Returns:
            Dict[str, Any]: The response from the OpenAI API.
        """
        stream = self.client.chat.completions.create(
            model=model,
            messages=messages,
            stream=True,
        )
        for event in stream:
            yield event.choices[0].delta.content
        return ""

gen_openai_model = OpenAIService()
