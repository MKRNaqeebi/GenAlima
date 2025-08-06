"""
Perplexity Connector
"""

import requests

from app.core.config import settings


class PerplexityConnector:
    """
    A connector for the Perplexity AI API.
    This class allows you to perform searches using the Perplexity AI API.
    """

    def __init__(self):
        self.headers = {"Authorization": f"Bearer {settings.PERPLEXITY_API_KEY}"}
        self.base_url = "https://api.perplexity.ai/chat/completions"

    def _send_request_to_perplexity(self, query: str, domains: list[str]) -> str:
        """
        Send a request to the Perplexity AI API.
        :param query: The search query string.
        :param domains: A list of domains to search within.
        :return: The search results as a JSON object.
        """
        payload = {
            "model": "sonar-deep-research",
            "messages": [
                {
                    "role": "system",
                    "content": "Please, give summary of the search results.",
                },
                {"role": "user", "content": query},
            ],
        }
        if domains:
            payload["search_domain_filter"] = domains
        response = requests.post(
            self.base_url, headers=self.headers, json=payload, timeout=199
        ).json()
        # split on new lines and take the last part
        return response["choices"][0]["message"]["content"].split("\n")[-1].strip()

    def search_by_domain(self, query: str, domains: list[str]) -> str:
        """
        Perform a search using the Perplexity AI API.
        :param query: The search query string.
        :param domains: A list of domains to search within.
        :return: The search results as a JSON object.
        """
        return self._send_request_to_perplexity(query, domains)

    def search(self, query: str, domains: list[str]) -> str:
        """
        Perform a search using the Perplexity AI API.
        :param query: The search query string.
        :param domains: A list of domains to search within.
        :return: The search results as a JSON object.
        """
        return self._send_request_to_perplexity(query, domains)


perplexity_service = PerplexityConnector()
