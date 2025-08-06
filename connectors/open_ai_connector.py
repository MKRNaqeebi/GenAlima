"""
OpenAI API connector for handling requests and responses.
"""

from openai import OpenAI


class OpenAIConnector:
    """
    A class to handle OpenAI API requests and responses.
    """

    def __init__(self):
        """
        Initialize the OpenAIConnector with an API key.

        :param api_key: The API key for OpenAI.
        """
        self.client = OpenAI()

    def get_small_embedding(self, text: str) -> list:
        """
        Get the embedding for a given text.

        :param text: The text to get the embedding for.
        :return: The embedding as a list.
        """
        response = self.client.embeddings.create(
            input=text, model="text-embedding-3-small"
        )
        return response.data[0].embedding

    def get_large_embedding(self, text: str) -> list:
        """
        Get the embedding for a given text.

        :param text: The text to get the embedding for.
        :return: The embedding as a list.
        """
        response = self.client.embeddings.create(
            input=text, model="text-embedding-3-large"
        )
        return response.data[0].embedding


open_ai_service = OpenAIConnector()
