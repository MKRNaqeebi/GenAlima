# Creating an MCP Server and Integrating with LangGraph

---

The **Model Context Protocol (MCP)** is an open protocol that standardizes how applications provide context to LLMs. MCP provides a standardized way to connect AI models to different data sources and tools. It allows you to define prompts, resources, and tools that can be accessed programmatically.

When combined with **LangGraph** (a library for building stateful, graph-based workflows), you can create sophisticated AI agents that leverage MCP’s capabilities.

In this post, we’ll walk through **creating an MCP server, interacting with it using a client, and integrating it with LangGraph**, with example outputs to demonstrate the results.

---

## What You’ll Learn

- How to set up an MCP server with prompts, resources, and tools.
- How to interact with the MCP server using a client
- How to integrate the MCP server with LangGraph to build an AI agent

---

## Prerequisites

- Install required packages:

  ```bash
  pip install mcp langchain langgraph langchain-google-genai langchain-mcp-adapters
  ```

---

## Step 1: Creating an MCP Server

The MCP server is the backbone of our system, exposing prompts, resources, and tools. Below is an example of a simple MCP server for a math assistant.

**Reference:** [github.com/modelcontextprotocol/python-sdk](https://github.com/modelcontextprotocol/python-sdk)

### Server Code

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Math")

# Prompts
@mcp.prompt()
def example_prompt(question: str) -> str:
    """Example prompt description"""
    return f"""
    You are a math assistant. Answer the question.
    Question: {question}
    """

@mcp.prompt()
def system_prompt() -> str:
    """System prompt description"""
    return """
    You are an AI assistant use the tools if needed.
    """

# Resources
@mcp.resource("greeting://{name}")
def get_greeting(name: str) -> str:
    """Get a personalized greeting"""
    return f"Hello, {name}!"

@mcp.resource("config://app")
def get_config() -> str:
    """Static configuration data"""
    return "App configuration here"

# Tools
@mcp.tool()
def add(a: int, b: int) -> int:
    """Add two numbers"""
    return a + b

@mcp.tool()
def multiply(a: int, b: int) -> int:
    """Multiply two numbers"""
    return a * b

if __name__ == "__main__":
    mcp.run()  # Run server via stdio
```

- Initializes an MCP server named “Math”.
- Defines two prompts: `example_prompt` for math questions and `system_prompt` for general instructions.
- Defines two resources: a dynamic resource `greeting://{name}` and a static resource `config://app`.
- Defines two tools: `add` and `multiply` for basic math operations.
- Runs the server using stdio

**For Streamable HTTP:**

```python
if __name__ == "__main__":
    mcp.run(transport="streamable-http")
# Run server via streamable-http
```

Will be available at `http://localhost:8000/mcp`

Save as `math_mcp_server.py`

---

## Step 2: Creating an MCP Client

To interact with the server, we use the MCP client. The client communicates with the server via stdio, allowing us to list prompts, resources, tools, and invoke them.

```python
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
import asyncio

# Math Server Parameters
server_params = StdioServerParameters(
    command="python",
    args=["math_mcp_server.py"],
    env=None,
)

async def main():
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            # List prompts
            response = await session.list_prompts()
            print("\n/////////////////prompts//////////////////")
            for prompt in response.prompts:
                print(prompt)

            # List resources
            response = await session.list_resources()
            print("\n/////////////////resources//////////////////")
            for resource in response.resources:
                print(resource)

            # List resource templates
            response = await session.list_resource_templates()
            print("\n/////////////////resource_templates//////////////////")
            for resource_template in response.resourceTemplates:
                print(resource_template)

            # List tools
            response = await session.list_tools()
            print("\n/////////////////tools//////////////////")
            for tool in response.tools:
                print(tool)

            # Get a prompt
            prompt = await session.get_prompt("example_prompt", arguments={"question": "what is 2+2"})
            print("\n/////////////////prompt//////////////////")
            print(prompt.messages.content.text)

            # Read a resource
            content, mime_type = await session.read_resource("greeting://Alice")
            print("\n/////////////////content//////////////////")
            print(content)

            # Call a tool
            result = await session.call_tool("add", arguments={"a": 2, "b": 2})
            print("\n/////////////////result//////////////////")
            print(result.content.text)

if __name__ == "__main__":
    asyncio.run(main())
```

### Example Output

- Available prompts: `example_prompt`, `system_prompt`
- Available resources: `config://app`, dynamic: `greeting://{name}`
- Available tools: `add`, `multiply`
- Demonstrations for calling prompts, reading resources, and tool invocations

---

## Step 3: Integrating MCP with LangGraph

LangGraph allows building stateful workflows using a graph-based approach. We can integrate the MCP client with LangGraph to create an AI agent that uses the server’s tools and prompts.

```python
from typing import List, Annotated
from typing_extensions import TypedDict
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.prebuilt import tools_condition, ToolNode
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import AnyMessage, add_messages
from langgraph.checkpoint.memory import MemorySaver
from langchain_mcp_adapters.tools import load_mcp_tools
from langchain_mcp_adapters.resources import load_mcp_resources
from langchain_mcp_adapters.prompts import load_mcp_prompt
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
import asyncio

# ... (server_params as defined before)

async def create_graph(session):
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.0-flash",
        temperature=0,
        api_key="your_google_api_key"
    )
    tools = await load_mcp_tools(session)
    llm_with_tool = llm.bind_tools(tools)
    system_prompt = await load_mcp_prompt(session, "system_prompt")
    prompt_template = ChatPromptTemplate.from_messages([
        ("system", system_prompt.content),
        MessagesPlaceholder("messages")
    ])
    chat_llm = prompt_template | llm_with_tool

    class State(TypedDict):
        messages: Annotated[List[AnyMessage], add_messages]

    def chat_node(state: State) -> State:
        state["messages"] = chat_llm.invoke({"messages": state["messages"]})
        return state

    graph_builder = StateGraph(State)
    graph_builder.add_node("chat_node", chat_node)
    graph_builder.add_node("tool_node", ToolNode(tools=tools))
    graph_builder.add_edge(START, "chat_node")
    graph_builder.add_conditional_edges("chat_node", tools_condition, {
        "tools": "tool_node",
        "__end__": END
    })
    graph_builder.add_edge("tool_node", "chat_node")
    graph = graph_builder.compile(checkpointer=MemorySaver())

    return graph

# ... main async block launching agent (see article for details)

```

- Lists available tools (`add`, `multiply`) and prompts.
- Agent responds to user inputs and can invoke the `add` tool via dialogue.

---

## Step 4: Integrating Multiple MCP Servers with LangGraph

You can use a `MultiServerMCPClient` to connect to multiple servers (e.g., a Math server and a BMI server).
See the article code for a multi-server LangGraph integration, keep sessions open for both servers, and combine tools in a single workflow.

---

## Conclusion

By combining MCP with LangGraph, you can build flexible, modular AI systems that leverage structured prompts and tools within a stateful workflow. The MCP server provides a clean interface for defining AI capabilities, while LangGraph orchestrates the flow of information.

---
