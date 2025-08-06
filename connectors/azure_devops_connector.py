"""
azure_devops_connector.py
This module provides a class to connect to Azure DevOps and fetch work item details.
It uses the Azure DevOps Python API to interact with the Azure DevOps REST API.
"""

import logging
from typing import List

from azure.devops.connection import Connection
from azure.devops.v7_0.work_item_tracking.models import Wiql, CommentCreate
from msrest.authentication import BasicAuthentication

logger = logging.getLogger(__name__)


class AzureDevOpsConnector:
    """
    A class to connect to Azure DevOps and fetch work item details.
    It uses the Azure DevOps Python API to interact with the Azure DevOps REST API.
    """

    def __init__(
        self, organization: str, personal_access_token: str, project_name: str
    ):
        """
        Initialize the Azure DevOps connector.
        :param organization: Azure DevOps organization name.
        :param personal_access_token: Personal Access Token for Azure DevOps.
        :param project_name: Azure DevOps project name.
        """
        self.organization_url = (
            f"""https://dev.azure.com/{organization.replace(" ", "")}"""
        )
        self.personal_access_token = personal_access_token
        self.project_name = project_name
        self.connection = None
        self.wit_client = None
        self._connect()
        self._validate_credentials()

    def _connect(self):
        """
        Establish a connection to Azure DevOps using the provided credentials.
        """
        credentials = BasicAuthentication("", self.personal_access_token)
        self.connection = Connection(base_url=self.organization_url, creds=credentials)
        self.wit_client = self.connection.clients.get_work_item_tracking_client()

    def _validate_credentials(self):
        """
        Validate the connection by attempting to fetch projects.
        """
        core_client = self.connection.clients.get_core_client()
        projects = core_client.get_projects()
        project_names = [project.name for project in projects]
        if self.project_name not in project_names:
            raise ValueError(
                f"Project '{self.project_name}' not found in organization '{self.organization_url}'"
            )

    def list_types(self) -> list:
        """
        List all available work item types in the project.
        :return: List of work item type names.
        """
        work_item_types = self.wit_client.get_work_item_types(project=self.project_name)
        all_types = sorted([type.name for type in work_item_types])
        return ", ".join([f'"{type_name}"' for type_name in all_types])

    def list_priorities(self) -> list:
        """
        List all available priorities for work items in the project.
        :return: List of priority names.
        """
        # priorities = self.wit_client.get_work_item_priorities(project=self.project_name)
        # all_priorities = sorted([priority.name for priority in priorities])
        # return ", ".join(all_priorities)
        return "1, 2, 3, 4"

    def list_all_states_by_work_item_type(self) -> list:
        """
        List all available states for all work item types in the project.
        :return: Dictionary where keys are work item types and values are lists of state names.
        """
        available_states = set()
        work_item_types = self.wit_client.get_work_item_types(project=self.project_name)

        for work_item_type in work_item_types:
            type_name = work_item_type.name
            states = self.wit_client.get_work_item_type_states(
                project=self.project_name, type=type_name
            )
            available_states.update(state.name for state in states)
        return sorted(available_states)

    def list_states(self) -> list:
        """
        List all available states for work items in the project.
        :return: List of state names.
        """
        all_states = self.list_all_states_by_work_item_type()
        return ", ".join([f'"{state_name}"' for state_name in all_states])

    def _run_wiql_query(self, states: list = None) -> list:
        """
        Run a WIQL query to fetch work item IDs.
        :return: List of work item IDs.
        """
        state_filter = ""
        if states:
            state_list = "', '".join(states)
            state_filter = f"AND [System.State] IN ('{state_list}')"
        wiql = Wiql(
            query=f"""
            SELECT [System.Id]
            FROM WorkItems
            WHERE
                [System.TeamProject] = '{self.project_name}'
                {state_filter}
            ORDER BY [System.ChangedDate] DESC
            """
        )
        results = self.wit_client.query_by_wiql(wiql).work_items
        return [item.id for item in results]

    # pylint: disable=dangerous-default-value
    def get_work_item_details_by_ids(
        self,
        work_item_ids: list,
        fields: list = [
            "System.Id",
            "System.Description",
            "System.CreatedDate",
            "System.ChangedDate",
        ],
    ) -> list:
        """
        Fetch detailed information for a list of work item IDs.
        :param work_item_ids: List of work item IDs.
        :return: List of work item details.
        """
        return self.wit_client.get_work_items(ids=work_item_ids, fields=fields)

    def create_work_item(
        self,
        document: List[dict],
        recent_messages: List[str],
        item_type: str = "Task",
    ):
        """
        Create a new work item in Azure DevOps.
        :param document: List of dictionaries containing work item fields and values.
        :param recent_messages: List of recent messages to add as comments.
        :param item_type: Type of work item to create (e.g., Bug, Feature, Task).
        :return: The created work item object.
        """
        created_work_item = self.wit_client.create_work_item(
            document=document,
            type=item_type,
            project=self.project_name,
        )

        # Add recent messages as comments if provided
        if created_work_item and recent_messages and len(recent_messages) > 0:
            self._add_recent_messages_as_comments(created_work_item.id, recent_messages)

        return created_work_item

    def run_wiql_query(self, query: str) -> list:
        """
        Run a WIQL query to fetch work item IDs.
        :param query: WIQL query string.
        :return: List of work item IDs.
        """
        my_wiql = Wiql(query=query)
        results = self.wit_client.query_by_wiql(my_wiql).work_items
        return results

    def list_fields(self) -> list:
        """
        List all available field reference names for work items in the project.
        :return: List of field reference names (e.g., 'System.Title', 'System.Description').
        """
        fields = self.wit_client.get_fields()
        my_fields = []
        for field in fields:
            if field.usage == "workItem":
                py_type = {
                    "dateTime": "datetime",
                    "integer": "int",
                    "double": "float",
                    "boolean": "bool"
                }.get(field.type, "str")
                my_fields.append({
                    "name": field.name,
                    "reference_name": field.reference_name,
                    "description": field.description,
                    "type": py_type,
                })
        return my_fields

    def get_custom_types(self, field: dict) -> str:
        """
        Get custom types for a field.
        :param field: Field dictionary.
        :return: Custom type string for the field.
        """
        if field.get("name") == "priority":
            return "Priority"
        if field.get("name") == "state":
            return "WorkItemState"
        if field.get("name") == "type":
            return "WorkItemType"
        return field.get("type", "str")

    def fields_to_schema(self, fields: list[dict] = None) -> str:
        """
        Convert fields to a Pydantic schema string.
        :param fields: List of field dictionaries with 'name', 'type', and 'description'.
        :return: Pydantic schema string.
        """
        fields_string = ""
        for field in fields:
            field_name = field.get("name", "").replace(" ", "_").lower()
            field_type = self.get_custom_types(field)
            field_description = field.get("description", "")
            fields_string += f"    {field_name}: {field_type} = Field(description=\"{field_description}\")\n"
        return fields_string

    def fields_to_param(self, fields: list[dict] = None) -> str:
        """
        Convert fields to a parameter string for Pydantic model.
        :param fields: List of field dictionaries with 'name' and 'type'.
        :return: Bug creation parameters string
        """
        param_string = ""
        for field in fields:
            param_name = field.get("name", "").replace(" ", "_").lower()
            param_type = self.get_custom_types(field)
            param_string += f"        {param_name}: {param_type},\n"
        return param_string

    def fields_to_meta(self, fields: list[dict] = None) -> str:
        """
        Convert fields to a metadata string for work item creation.
        :param fields: List of field dictionaries with 'name' and 'type'.
        :return: Metadata string for work item creation.
        """
        meta_string = ""
        for field in fields:
            field_name = field.get("name", "").replace(" ", "_").lower()
            meta_string += f"            \"{field_name}\": {field_name},\n"
        return meta_string

    def fields_to_document(self, fields: list[dict] = None) -> str:
        """
        Convert fields to a document string for work item creation.
        :param fields: List of field dictionaries with 'name' and 'type'.
        :return: Document string for work item creation.
        """
        document_string = ""
        for field in fields:
            name = field.get("name", "").replace(" ", "_").lower()
            reference_name = field.get("reference_name", "")
            document_string += f"           {{\"op\": \"add\", \"path\": \"/fields/{reference_name}\", \"value\": {name}}},\n"
        return document_string

    def list_work_items_by_state(self, state: str):
        """
        List work items by their state.
        :param state: State of the work items to filter (e.g., 'New', 'Scoping', 'Ready',
            'On Hold', 'Development', 'Testing', 'Blocked', 'Ready for Signoff',
            'Ready for Deployment').
        :return: List of work items with the specified state.
        """
        wiql = Wiql(
            query=f"""
            SELECT [System.Id]
            FROM WorkItems
            WHERE
                [System.TeamProject] = '{self.project_name}'
                AND [System.State] = '{state}'
            ORDER BY [System.ChangedDate] DESC
            """
        )
        results = self.wit_client.query_by_wiql(wiql).work_items
        detail_results = self.get_work_item_details_by_ids(
            work_item_ids=[item.id for item in results],
            fields=["System.Id", "System.Title"],
        )
        return [
            {
                "id": item.id,
                "title": item.fields.get("System.Title"),
                "description": item.fields.get("System.Description"),
            }
            for item in detail_results
        ]

    def _get_comments_for_item(self, work_item_id: int):
        """
        Fetch comments for a specific work item.
        :param work_item_id: Work item ID.
        :return: List of comments for the work item.
        """
        comments_response = self.wit_client.get_comments(
            project=self.project_name, work_item_id=work_item_id
        )
        return comments_response.comments if comments_response else []

    def add_comment_to_work_item(self, work_item_id: int, comment_text: str):
        """
        Add a comment to an existing work item.
        :param work_item_id: Work item ID.
        :param comment_text: The comment text to add.
        :return: The created comment object or None if failed.
        """
        try:
            comment_create = CommentCreate(text=comment_text)
            comment = self.wit_client.add_comment(
                request=comment_create,
                project=self.project_name,
                work_item_id=work_item_id
            )
            return comment
        except Exception as e:
            logger.error("Failed to add comment to work item %s: %s", work_item_id, e)
            return None

    def _add_recent_messages_as_comments(self, work_item_id: int, recent_messages: List[str]):
        """
        Add recent messages as comments to a work item.
        :param work_item_id: Work item ID.
        :param recent_messages: List of formatted message strings like "**User** content".
        """
        if not recent_messages:
            return

        # Format all messages into a single comment
        comment_lines = ["### Recent Messages with William AI\n"]

        for message in recent_messages:
            # Messages are already formatted as "**User** content" or "**Assistant** content"
            comment_lines.append(f"{message}\n")

        # Add all recent messages as a single comment
        full_comment = "\n".join(comment_lines)
        self.add_comment_to_work_item(work_item_id, full_comment)

    def get_detailed_work_items(self, item_states: list = None):
        """
        Fetch detailed work item information including comments.
        :return: List of detailed work items with comments.
        """
        work_item_ids = self._run_wiql_query(states=item_states)
        if not work_item_ids:
            return []

        work_items_data = []
        work_items = self.get_work_item_details_by_ids(work_item_ids)

        for item in work_items:
            fields = item.fields
            comments = self._get_comments_for_item(item.id)
            work_items_data.append(
                {
                    "id": item.id,
                    "created_date": fields.get("System.CreatedDate"),
                    "updated_date": fields.get("System.ChangedDate"),
                    "description": fields.get("System.Description"),
                    "comments": [
                        {
                            "author": comment.created_by.display_name,
                            "created_date": comment.created_date,
                            "text": comment.text,
                        }
                        for comment in comments
                    ],
                }
            )

        return work_items_data

    def list_available_fields(self) -> list[str]:
        """
        List all available field reference names for work items in the project.
        :return: List of field reference names (e.g., 'System.Title', 'System.Description').
        """
        fields = self.wit_client.get_fields(project=self.project_name)
        return sorted([f.reference_name for f in fields])

    def list_work_items_by_assignee(self, assignee_name: str = None):
        """
        List work items by their assigned user.
        :param assignee_name: Name of the assigned user. If None, returns unassigned items.
        :return: List of work items assigned to the specified user.
        """
        if assignee_name:
            wiql_query = f"""
                SELECT [System.Id]
                FROM WorkItems
                WHERE
                    [System.TeamProject] = '{self.project_name}'
                    AND [System.AssignedTo] = '{assignee_name}'
                ORDER BY [System.ChangedDate] DESC
                """
        else:
            # Query for unassigned items
            wiql_query = f"""
                SELECT [System.Id]
                FROM WorkItems
                WHERE
                    [System.TeamProject] = '{self.project_name}'
                    AND [System.AssignedTo] = ''
                ORDER BY [System.ChangedDate] DESC
                """

        wiql = Wiql(query=wiql_query)
        results = self.wit_client.query_by_wiql(wiql).work_items

        if not results:
            return []

        detail_results = self.get_work_item_details_by_ids(
            work_item_ids=[item.id for item in results],
            fields=["System.Id", "System.Title", "System.State", "System.AssignedTo"],
        )

        return [
            {
                "id": item.id,
                "title": item.fields.get("System.Title"),
                "state": item.fields.get("System.State"),
                "assigned_to": item.fields.get("System.AssignedTo", {}).get("displayName") if item.fields.get("System.AssignedTo") else None,
            }
            for item in detail_results
        ]

    def list_work_items_by_tag(self, tag: str):
        """
        List work items by their tag.
        :param tag: Tag to filter work items.
        :return: List of work items with the specified tag.
        """
        wiql = Wiql(
            query=f"""
            SELECT [System.Id]
            FROM WorkItems
            WHERE
                [System.TeamProject] = '{self.project_name}'
                AND [System.Tags] CONTAINS '{tag}'
            ORDER BY [System.ChangedDate] DESC
            """
        )
        results = self.wit_client.query_by_wiql(wiql).work_items

        if not results:
            return []

        detail_results = self.get_work_item_details_by_ids(
            work_item_ids=[item.id for item in results],
            fields=["System.Id", "System.Title", "System.State", "System.Tags"],
        )

        return [
            {
                "id": item.id,
                "title": item.fields.get("System.Title"),
                "state": item.fields.get("System.State"),
                "tags": item.fields.get("System.Tags"),
            }
            for item in detail_results
        ]

    def list_work_items_by_type(self, work_item_type: str):
        """
        List work items by their type (Bug, Task, Feature, etc.).
        :param work_item_type: Type of work items to filter.
        :return: List of work items of the specified type.
        """
        wiql = Wiql(
            query=f"""
            SELECT [System.Id]
            FROM WorkItems
            WHERE
                [System.TeamProject] = '{self.project_name}'
                AND [System.WorkItemType] = '{work_item_type}'
            ORDER BY [System.ChangedDate] DESC
            """
        )
        results = self.wit_client.query_by_wiql(wiql).work_items

        if not results:
            return []

        detail_results = self.get_work_item_details_by_ids(
            work_item_ids=[item.id for item in results],
            fields=["System.Id", "System.Title", "System.State", "System.WorkItemType", "System.AssignedTo"],
        )

        return [
            {
                "id": item.id,
                "title": item.fields.get("System.Title"),
                "state": item.fields.get("System.State"),
                "type": item.fields.get("System.WorkItemType"),
                "assigned_to": item.fields.get("System.AssignedTo", {}).get("displayName") if item.fields.get("System.AssignedTo") else None,
            }
            for item in detail_results
        ]

    def get_work_items_summary(self, include_states: list = None):
        """
        Get a summary of work items grouped by state with counts.
        :param include_states: List of states to include. If None, includes all states.
        :return: Dictionary with state summaries and recent items.
        """
        # Get all states if not specified
        if not include_states:
            include_states = self.list_all_states_by_work_item_type()

        summary = {
            "total_items": 0,
            "by_state": {},
            "recent_items": []
        }

        # Get count for each state
        for state in include_states:
            # Escape single quotes in state names
            escaped_state = state.replace("'", "''")
            wiql = Wiql(
                query=f"""
                SELECT [System.Id]
                FROM WorkItems
                WHERE
                    [System.TeamProject] = '{self.project_name}'
                    AND [System.State] = '{escaped_state}'
                """
            )
            try:
                results = self.wit_client.query_by_wiql(wiql).work_items
                count = len(results)

                if count > 0:
                    summary["by_state"][state] = count
                    summary["total_items"] += count
            except Exception as e:
                print(f"Error querying state '{state}': {e}")
                continue

        # Get recent items (last 10)
        wiql = Wiql(
            query=f"""
            SELECT TOP 10 [System.Id]
            FROM WorkItems
            WHERE [System.TeamProject] = '{self.project_name}'
            ORDER BY [System.ChangedDate] DESC
            """
        )
        try:
            results = self.wit_client.query_by_wiql(wiql).work_items
        except Exception as e:
            print(f"Error in get_work_items_summary: {e}")
            print(f"Query: {wiql.query}")
            results = []

        if results:
            detail_results = self.get_work_item_details_by_ids(
                work_item_ids=[item.id for item in results],
                fields=["System.Id", "System.Title", "System.State", "System.AssignedTo", "System.ChangedDate"],
            )

            summary["recent_items"] = [
                {
                    "id": item.id,
                    "title": item.fields.get("System.Title"),
                    "state": item.fields.get("System.State"),
                    "assigned_to": item.fields.get("System.AssignedTo", {}).get("displayName") if item.fields.get("System.AssignedTo") else None,
                    "changed_date": item.fields.get("System.ChangedDate"),
                }
                for item in detail_results
            ]

        return summary

    def search_work_items(self, search_strings: list, top: int = 100):
        """
        Search work items by text across title, description, and other fields.
        :param search_strings: List of search strings to search separately and combine results.
        :param top: Maximum number of results to return (default 100).
        :return: List of work items matching the search text.
        """
        # search each string separately and combine results
        all_results = {}
        for search_text in search_strings:
            results = self._search_single_text(search_text, top)
            # Use dict to avoid duplicates based on work item ID
            for item in results:
                all_results[item["id"]] = item
        # Convert back to list
        unique_results = list(all_results.values())
        # Limit to top results
        return unique_results[:top]

    def _search_single_text(self, search_text: str, top: int = 100):
        """
        Helper method to search for a single text string.
        :param search_text: Text to search for in work items.
        :param top: Maximum number of results to return (default 100).
        :return: List of work items matching the search text.
        """
        # Escape single quotes in search text to prevent WIQL injection
        escaped_search_text = search_text.replace("'", "''")

        # Use WIQL to search across multiple fields
        wiql = Wiql(
            query=f"""
            SELECT [System.Id], [System.Title]
            FROM WorkItems
            WHERE
                [System.TeamProject] = '{self.project_name}'
                AND (
                    [System.Title] CONTAINS '{escaped_search_text}'
                    OR [System.Description] CONTAINS '{escaped_search_text}'
                    OR [System.Tags] CONTAINS '{escaped_search_text}'
                    OR [System.History] CONTAINS '{escaped_search_text}'
                )
            ORDER BY [System.ChangedDate] DESC
            """
        )

        results = self.wit_client.query_by_wiql(wiql).work_items

        if not results:
            return []

        # Get basic details for the search results
        # Limit results to the requested top count
        limited_results = results[:top] if len(results) > top else results

        detail_results = self.get_work_item_details_by_ids(
            work_item_ids=[item.id for item in limited_results],
            fields=["System.Id", "System.Title", "System.State", "System.WorkItemType"],
        )

        return [
            {
                "id": item.id,
                "title": item.fields.get("System.Title"),
                "state": item.fields.get("System.State"),
                "type": item.fields.get("System.WorkItemType"),
            }
            for item in detail_results
        ]
