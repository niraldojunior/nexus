# Research/Chat Module - Testing Guide

## Setup

### 1. Set Environment Variable
```powershell
$env:OPENAI_API_KEY = "your-openai-api-key"
```

### 2. Start Development Server
```powershell
npm run dev
```

The app will start on http://localhost:3001 (backend) and http://localhost:5173 (web frontend).

## API Endpoints (HTTP)

### Create New Session
```bash
curl -X POST http://localhost:3001/v1/research/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My First Chat",
    "context": "You are a helpful assistant for Nexus platform.",
    "model": "gpt-4",
    "temperature": 0.7,
    "maxTokens": 2000
  }'
```

Response:
```json
{
  "@type": "ResearchSession",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "href": "/v1/research/sessions/550e8400-e29b-41d4-a716-446655440000",
  "title": "My First Chat",
  "status": "active",
  "model": "gpt-4",
  "temperature": 0.7,
  "maxTokens": 2000,
  "context": "You are a helpful assistant for Nexus platform.",
  "createdAt": "2024-12-09T10:30:00.000Z",
  "updatedAt": "2024-12-09T10:30:00.000Z"
}
```

### Get All Sessions
```bash
curl http://localhost:3001/v1/research/sessions
```

### Get Specific Session with Messages
```bash
curl http://localhost:3001/v1/research/sessions/{sessionId}
```

### Send Message (User → ChatGPT → Assistant)
```bash
curl -X POST http://localhost:3001/v1/research/sessions/{sessionId}/messages \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is geographic site in Nexus?"
  }'
```

Response:
```json
{
  "userMessage": {
    "@type": "ResearchMessage",
    "id": "msg-001",
    "researchSessionId": "session-id",
    "role": "user",
    "content": "What is geographic site in Nexus?",
    "createdAt": "2024-12-09T10:31:00.000Z"
  },
  "assistantMessage": {
    "@type": "ResearchMessage",
    "id": "msg-002",
    "researchSessionId": "session-id",
    "role": "assistant",
    "content": "A geographic site in Nexus is...",
    "tokensUsed": 156,
    "createdAt": "2024-12-09T10:31:05.000Z"
  }
}
```

### Update Session Title
```bash
curl -X PUT http://localhost:3001/v1/research/sessions/{sessionId} \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Understanding Geographic Concepts"
  }'
```

### Archive Session
```bash
curl -X DELETE http://localhost:3001/v1/research/sessions/{sessionId}
```

## Web Frontend

### Access Research Module
1. Open http://localhost:5173 in browser
2. Click "Nova Pesquisa" (New Chat) in left sidebar
3. Creates new conversation automatically and shows chat interface

### Chat Workflow
1. Type message in input field
2. Press Enter or click Send
3. Message appears in chat (yellow bubble)
4. ChatGPT response appears below (white bubble)
5. First message auto-titles the conversation

### View Previous Conversations
1. Click "Pesquisas" (Conversations) in sidebar
2. List shows all active conversations with dates
3. Click conversation to load it
4. Click X to archive/delete

## Architecture

### Data Flow
User Input → React Component → HTTP POST → SearchService → ChatGPTProvider → OpenAI API → LLMResponse → SQLite Store → React State Update → UI Render

### Component Hierarchy
```
App
├── Sidebar (navigation with "Nova Pesquisa" / "Pesquisas")
└── ResearchHistoryPage
    ├── Left sidebar (sessions list)
    └── Main area
        └── ResearchChat
            ├── Chat messages
            └── Input field
```

### Database Tables
- `research_session`: Contains session metadata, context, model config
- `research_message`: Contains individual messages with timestamps

## Future Enhancements

### Phase 2: Replace ChatGPT with Internal Nexus Queries
Instead of calling OpenAI, query internal database:
- Geographic sites and addresses
- Resource specifications and inventory
- Service definitions and instances
- Return results in message format

### Phase 3: Streaming Responses
- Replace blocking fetch with EventSource/Server-Sent Events
- Show LLM response word-by-word as it arrives
- Add stop/cancel button for long-running queries

### Phase 4: Advanced Features
- File uploads (e.g., import site definitions)
- Export conversations (JSON/PDF)
- Conversation sharing
- Saved prompts/templates
- Advanced search in messages

## Troubleshooting

### "ChatGPT not configured" Error
- Ensure `OPENAI_API_KEY` is set in environment
- Restart dev server after setting env var

### Messages not appearing
- Check browser console for fetch errors
- Verify API is running on port 3001
- Check OPENAI_API_KEY validity

### Slow responses
- OpenAI API calls can take 5-30 seconds
- Check network tab in browser DevTools
- Verify API key has sufficient quota

