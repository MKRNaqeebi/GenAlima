# GenAlima - Enterprise AI Search Platform

<div align="center">
  <h3>🤖 Build Your Enterprise AI Search Agent in Minutes</h3>
  <p>Unify your scattered business knowledge into a single, intelligent interface</p>
</div>

## 🌟 Overview

GenAlima is an enterprise-grade AI search platform that enables businesses to create intelligent AI agents capable of searching and answering questions from all their business data sources. Built with cutting-edge AI technologies and a modern tech stack, GenAlima transforms how organizations access and utilize their knowledge.

## ✨ Key Features

### 🔍 Intelligent Search & Retrieval

- **Vector Search**: Semantic search across all your documents using pgvector
- **RAG (Retrieval Augmented Generation)**: Combines search results with LLM responses for accurate answers
- **Multi-format Support**: Process PDFs, Word documents, text files, and more
- **Real-time Streaming**: Get AI responses as they're generated

### 🔌 Data Source Connectors

- **Google Workspace**: Gmail integration with OAuth2
- **Azure DevOps**: Project management and collaboration
- **Notion**: Workspace and documentation (coming soon)
- **Custom APIs**: Flexible connector architecture for any data source

### 🤖 Advanced AI Capabilities

- **Multiple LLM Support**: OpenAI, Google Gemini, Anthropic Claude
- **LangGraph Agent**: Sophisticated multi-step reasoning and tool chaining
- **Context-Aware Responses**: Maintains conversation history and context
- **Dynamic Tool Selection**: Automatically chooses the right tools for each query

### 🔐 Enterprise Security

- **JWT Authentication**: Secure token-based authentication
- **Role-Based Access Control**: Manage user permissions
- **Encrypted Credentials**: Secure storage of API keys and tokens
- **Read-Only Data Access**: Ensures data integrity

### 💬 Chat & Collaboration

- **Template-Based Chats**: Pre-configured templates for common use cases
- **Persistent History**: Save and retrieve conversation history
- **Markdown Support**: Rich text formatting in messages
- **Session Management**: Maintain state across conversations

## 🚀 Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 14+ with pgvector extension
- OpenAI API key (or other LLM provider keys)

### Installation

1. **Clone the repository**

    ```bash
    git clone https://github.com/yourusername/GenAlima.git
    cd GenAlima
    ```

2. **Set up the backend**

    ```bash
    # Create virtual environment
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate

    # Install dependencies
    pip install -r requirements.txt

    # Set up environment variables
    cp .example.env .env
    # Edit .env with your configuration
    ```

3. **Set up the database**

    ```bash
    # Create PostgreSQL database with pgvector
    createdb alima
    psql -d alima -c "CREATE EXTENSION vector;"

    # Run migrations
    alembic upgrade head
    ```

4. **Set up the frontend**

    ```bash
    cd frontend
    npm install
    ```

5. **Configure environment variables**

    Edit `.env` file with your settings:

    ```env
    # Database
    POSTGRES_SERVER=localhost
    POSTGRES_PORT=5432
    POSTGRES_DB=alima
    POSTGRES_USER=postgres
    POSTGRES_PASSWORD=your_password

    # OpenAI (or other LLM provider)
    OPENAI_API_KEY=your_openai_api_key

    # Frontend
    FRONTEND_HOST=http://localhost:5173
    BACKEND_CORS_ORIGINS=http://localhost:5173

    # Google OAuth (for Gmail integration)
    GOOGLE_CLIENT_ID=your_client_id
    GOOGLE_CLIENT_SECRET=your_client_secret
    ```

### Running the Application

1. **Start the backend server**

    ```bash
    # From project root
    python main.py
    # Server runs on http://localhost:8000
    ```

1. **Start the frontend development server**

    ```bash
    # From frontend directory
    npm run dev
    # Frontend runs on http://localhost:5173
    ```

1. **Access the application**
    Open your browser and navigate to `http://localhost:5173`

## 🏗️ Project Structure

```
GenAlima/
├── app/                    # Backend FastAPI application
│   ├── api/               # API routes and endpoints
│   │   ├── routes/        # Route definitions
│   │   └── deps.py        # Dependencies
│   ├── core/              # Core configuration
│   │   ├── config.py      # Settings management
│   │   └── security.py    # Authentication
│   ├── models.py          # Database models
│   ├── schemas.py         # Pydantic schemas
│   └── alembic/           # Database migrations
├── frontend/              # React TypeScript frontend
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── routes/        # Page components
│   │   ├── hooks/         # Custom React hooks
│   │   └── client/        # API client
│   └── package.json       # Frontend dependencies
├── graphs/                # LangGraph AI agent
│   ├── tools/            # AI tool implementations
│   ├── prompts/          # System prompts
│   └── main.py           # Agent orchestration
├── connectors/           # External service integrations
├── gen_model/            # LLM utilities
└── requirements.txt      # Python dependencies
```

## 🔧 Configuration

### Database Setup

GenAlima uses PostgreSQL with the pgvector extension for vector similarity search:

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- The application will create necessary tables via Alembic migrations
```

### LLM Configuration

Configure your preferred LLM provider in `.env`:

```env
# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4-turbo-preview

# Google Gemini
GOOGLE_API_KEY=...
GOOGLE_MODEL=gemini-pro

# Anthropic Claude
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-3-opus
```

## 🐳 Docker Deployment

Build and run with Docker:

```bash
# Build the image
docker build -t genalima .

# Run the container
docker run -p 8080:8080 \
  -e POSTGRES_SERVER=host.docker.internal \
  -e OPENAI_API_KEY=your_key \
  genalima
```

## 📚 API Documentation

Once the backend is running, access the interactive API documentation:

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### Key Endpoints

- `POST /api/v1/login/access-token` - User authentication
- `GET /api/v1/users/me` - Get current user
- `POST /api/v1/chats/` - Create new chat
- `POST /api/v1/messages/` - Send message
- `POST /api/v1/knowledge/upload` - Upload documents
- `GET /api/v1/knowledge/search` - Search knowledge base

## 🧪 Development

### Code Quality Tools

```bash
# Format code
black .
isort .

# Lint code
pylint app/
ruff check .

# Type checking
mypy app/
```

### Testing

```bash
# Run backend tests
pytest

# Run frontend tests
cd frontend && npm test
```

### Database Migrations

```bash
# Create new migration
alembic revision --autogenerate -m "Description"

# Apply migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📈 Roadmap

### Current Development

- [x] File upload and vector search
- [x] Gmail integration
- [ ] Notion integration
- [x] GitHub integration
- [x] LangGraph agent implementation
- [ ] Template-based chats with pre-defined templates and workflows
  - [ ] Draft letter to send to court
  - [ ] Create task list from meeting notes in given format
- [ ] Database connector (Text-to-SQL)
- [ ] API data source configuration
- [ ] MCP (Model Context Protocol) integration
- [ ] n8n workflow integration
- [ ] Advanced analytics dashboard
- [ ] Team collaboration features
- [ ] Desktop application for meeting notes and real-time help from Internal Knowledge Base and Internet

### Future Plans

- Multi-tenant architecture
- Advanced permission system
- Real-time collaboration
- Mobile applications
- Self-hosted enterprise edition

## 🛡️ Security

- All credentials are encrypted at rest
- CORS protection enabled
- SQL injection prevention via SQLModel ORM
- Rate limiting on API endpoints
- Regular security audits

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [FastAPI](https://fastapi.tiangolo.com/) - Modern web framework
- [LangChain](https://langchain.com/) - LLM application framework
- [React](https://react.dev/) - UI library
- [PostgreSQL](https://www.postgresql.org/) - Database
- [pgvector](https://github.com/pgvector/pgvector) - Vector similarity search

## 📞 Support

- Documentation: [docs.genalima.com](https://docs.genalima.com)
- Issues: [GitHub Issues](https://github.com/MKRNaqeebi/GenAlima/issues)
- Discord: [Join our community](https://discord.gg/genalima)
- Email: [support@genalima.com](mailto:support@genalima.com)

---

<div align="center">
  <p>Built with ❤️ by the GenAlima Team</p>
  <p>⭐ Star us on GitHub!</p>
</div>
