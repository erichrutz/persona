# Persona - Professional Character Simulation System

## Project Overview

**Persona** is a sophisticated Node.js-based character simulation system that leverages Anthropic's Claude API to create immersive, memory-aware conversational experiences. The application enables role-playing interactions with AI-powered characters that maintain context, personality, and relationship dynamics across sessions.

**Repository:** `https://github.com/erichrutz/persona` (assumed based on README)
**Current Branch:** `ui-server-separation`
**Main Branch:** `main`
**License:** MIT
**Node.js Version:** ≥14.0.0

---

## Core Features

### 1. **Advanced Memory System**
- **Two-Layer Memory Architecture:**
  - **Short-Term Memory:** Recent conversation context (10 messages, detailed last 2)
  - **Long-Term Memory:** Persistent facts, preferences, and relationship history
  - **Deep Memory:** Critical information that's never compressed

- **Intelligent Memory Compression:**
  - Automatic compression after 10 API calls
  - AI-powered memory consolidation using symbolic notation
  - Maintains character/user profiles while reducing token usage
  - Topic-based organization (USER_IDENTITY, CHARACTER_IDENTITY, RELATIONSHIP, etc.)

### 2. **Character Impersonation**
- Symbolic text-based character profiles (replacing older JSON format)
- Support for custom and predefined characters (37+ characters in `/characters`)
- Dynamic character trait parsing and compression
- Multi-language support (English/German)

### 3. **Session Management**
- Persistent session storage with file-based system
- Load/save conversation states with full memory restoration
- Session caching for performance optimization
- Multiple concurrent session support

### 4. **Security & Deployment**
- Basic HTTP authentication with configurable credentials
- HTTPS/TLS support with Let's Encrypt integration
- Helmet.js security headers
- Cookie-based session management
- CORS configuration for cross-origin requests
- EC2 deployment ready with PM2 process management

### 5. **Rich Interaction Tracking**
- Clothing state tracking for both character and user
- Location awareness
- Date/timeline tracking in roleplay scenarios
- Relationship history milestones
- Clothing and appearance persistence

---

## Architecture

### Technology Stack

```
Backend:
- Node.js (≥14.0.0)
- Express.js (4.18.2)
- Anthropic API (Claude 3.7 Sonnet / Haiku)

Storage:
- File-based JSON persistence
- In-memory session caching

Security:
- express-basic-auth (1.2.1)
- helmet (7.1.0)
- cookie-session (2.0.0)
- dotenv (16.3.1)

Development:
- nodemon (2.0.22)
- jest (29.5.0)
```

### Project Structure

```
persona/
├── server.js                      # Express server, API routes, authentication
├── anthropic-chat-client.js       # Main chat client, memory system, conversation handling
├── memory-compressor.js           # Memory compression logic, profile optimization
├── memory-persistence.js          # File-based session storage with caching
├── localization.js                # Multi-language support
├── character-profile-example.js   # Character profile templates
├── public/
│   └── index.html                 # Frontend UI (read as large file)
├── characters/                    # Character definition files (.txt)
│   ├── alexandra.txt
│   ├── annika.txt
│   └── ... (37 total characters)
├── characters-save/               # Character backups
├── memory-storage/                # Persisted session data (159 sessions)
├── .env                          # Environment configuration
├── package.json                   # Dependencies and scripts
└── README.md                      # Project documentation
```

---

## Key Components

### 1. **server.js** (942 lines)

**Purpose:** Express application server handling HTTP/HTTPS, authentication, and API endpoints.

**Key Responsibilities:**
- HTTP/HTTPS server setup with optional TLS
- Basic authentication middleware
- Session management with cookies
- REST API endpoints for chat, memory, and session operations
- Static file serving
- Health check endpoint

**API Endpoints:**
```javascript
GET  /api/health                         // Health check (no auth)
GET  /api/placeholder/:width/:height     // SVG placeholder images (no auth)

POST /api/session                        // Create/load session
GET  /api/sessions                       // List all sessions
DELETE /api/session/:sessionId           // Delete session

POST /api/message                        // Send chat message
GET  /api/memory/:sessionId              // Get memory state
GET  /api/history/:sessionId             // Get relationship history
DELETE /api/history/:sessionId           // Delete history entries

POST /api/compression/toggle             // Toggle memory compression
POST /api/compression/compress           // Manually trigger compression
GET  /api/compression/stats/:sessionId   // Get compression statistics

POST /api/deep-memory/:sessionId         // Update deep memory
POST /api/clothing/:sessionId            // Update clothing information
POST /api/location/:sessionId            // Update location

GET  /api/characters                     // List available characters
GET  /api/character/:filename            // Load character profile
```

**Configuration:**
- Port: `process.env.PORT || 3001`
- Authentication: `AUTH_USERNAME`, `AUTH_PASSWORD`
- SSL: `USE_HTTPS`, `CERT_PATH`, `KEY_PATH`
- Debug mode: `DEBUG_MODE`

---

### 2. **anthropic-chat-client.js** (1824 lines)

**Purpose:** Core conversation engine with memory management and character impersonation.

**Key Classes:**

#### `MemorySystem`
- Manages short-term, long-term, and deep memory
- Implements topic-based memory organization
- Auto-categorization using language-specific keywords
- Importance scoring for memory prioritization
- Memory access tracking for relevance scoring

**Memory Organization:**
```javascript
topicGroups: {
  'USER_IDENTITY': { core, background, preferences },
  'CHARACTER_IDENTITY': { core, background, traits },
  'RELATIONSHIP': { milestones, dynamics, shared_interests },
  'CONVERSATION_THREADS': { ongoing, recurring_topics, resolved }
}
```

#### `AnthropicChatClient`
- Character profile processing (symbolic format)
- Message sending/receiving with Claude API
- Context assembly from memory layers
- Memory extraction from AI responses
- Session state persistence
- Retry logic for API overload (529 errors)

**Character Profile Format (Symbolic):**
```
NAME: Character name
ID: Age/Gender/Occupation/Location
LOOKS: Physical appearance, clothing
CORE: Personality traits
SPEECH: Communication style
TOPICS: Interests (+/++/~/--/-)
TRIGGERS: Stimulus → Response patterns
CONNECTIONS: Relationships
USERRELATION: Relationship with user
WANTS: Goals and desires
```

**Symbolic Notation:**
- `+` / `++` : Interest (passionate)
- `-` / `--` : Dislike (strong)
- `~` : Neutral
- `→` : Trigger leads to response
- `!` : Critical trait
- `*` : Hidden trait
- `#` : Contextual trait
- `@` : Location-specific behavior

---

### 3. **memory-compressor.js** (801 lines)

**Purpose:** Intelligent memory consolidation to manage token usage.

**Key Features:**
- **Automatic Compression:** Triggers after 10 API calls when >5 long-term memories exist
- **Profile Compression:** Compresses character/user profiles exceeding 3096 bytes
- **AI-Powered Consolidation:** Uses Claude to merge and summarize memories
- **Symbolic Profile Generation:** Maintains character essence in compact format

**Compression Strategy:**
```javascript
1. Preserve ALL critical data (name, age, appearance)
2. Reflect character development in CORE and LOOKS
3. Prioritize USER_RELATIONSHIP information
4. Track relationship evolution over time
5. Newer info overrides contradictory older info
6. Combine related attributes with symbolic notation
7. Deduplicate and merge similar memories
8. Maintain exact symbolic format structure
```

**Performance Metrics:**
- Tracks compression count, timestamps
- Monitors memory counts before/after
- Calculates reduction percentages
- Prevents concurrent compression operations

---

### 4. **memory-persistence.js** (192 lines)

**Purpose:** File-based session storage with intelligent caching.

**Key Features:**
- JSON file storage in `memory-storage/`
- In-memory session cache (max 20 sessions)
- Cache hit optimization for frequently accessed sessions
- Automatic cache size management (LRU-style)
- Session metadata: timestamp, character name, messages, memory state

**Storage Structure:**
```json
{
  "sessionId": "session_timestamp_randomid",
  "timestamp": "2025-10-10T12:34:56.789Z",
  "memoryState": {
    "shortTermMemory": [...],
    "longTermMemory": [...],
    "deepMemory": "...",
    "compressionMetadata": {...},
    "clothing": {...},
    "history": [...],
    "location": "...",
    "date": "..."
  },
  "messages": [...],
  "characterProfile": "...",
  "userProfile": "..."
}
```

---

## Data Flow

### Message Processing Flow

```
1. User sends message via POST /api/message
   ↓
2. Server retrieves/creates AnthropicChatClient for session
   ↓
3. Client adds message to conversation history
   ↓
4. Client assembles context from memory layers:
   - Deep Memory (critical info)
   - Short-term Memory (recent 3 messages)
   - Long-term Memory (topic-based selection, max 7)
   - Character profile + current clothing/location/date
   ↓
5. Request sent to Claude API with system prompt + context
   ↓
6. Claude response processed:
   - Extract short-term memory summary
   - Extract long-term memory facts (char/user)
   - Extract clothing/location/date/history updates
   ↓
7. Memory categorization and storage:
   - Auto-categorize by topic (IDENTITY, RELATIONSHIP, etc.)
   - Calculate importance scores
   - Add to long-term memory with metadata
   ↓
8. Compression check (every 10 API calls):
   - If triggered, compress memories and profiles
   - Update character/user profiles
   ↓
9. Save session state to disk
   ↓
10. Return cleaned response to user (JSON stripped)
```

### Memory Compression Flow

```
1. Trigger: 10 API calls + >5 long-term memories
   ↓
2. Collect all long-term memory entries
   ↓
3. Send to Claude with compression prompt:
   - Previous character profile
   - Previous user profile
   - New memory entries to integrate
   ↓
4. Claude consolidates into symbolic profiles:
   - Character profile (NAME, ID, LOOKS, CORE, etc.)
   - User profile (same structure)
   ↓
5. Replace character/user profiles in chat client
   ↓
6. Clear long-term memory (now consolidated in profiles)
   ↓
7. Check if profiles exceed 3096 bytes → compress further
   ↓
8. Update compression metadata and save state
```

---

## Character System

### Character Definition

Characters are stored as `.txt` files in `/characters/` using symbolic notation. The system supports:

- **37 predefined characters** (alexandra, annika, celina, diana, etc.)
- **Custom character creation** via UI
- **Dynamic profile loading** from filesystem

### Sample Character Structure

```
NAME: Alexandra
ID: 28/Female/Software Engineer/Berlin

LOOKS: 5'7", athletic build, long brown hair, green eyes,
casual-professional style, minimalist jewelry

CORE: analytical, introverted yet warm, values authenticity,
perfectionist tendencies, dry humor

SPEECH: precise vocabulary, occasional tech jargon,
thoughtful pauses, avoids small talk

TOPICS: ++programming, ++quantum physics, +classical music,
~politics, --reality TV

TRIGGERS: technical challenges→excitement,
pretentiousness→withdrawal, genuine curiosity→engagement

CONNECTIONS: Close with younger sister Emma,
distant from parents, few but deep friendships

USERRELATION: [Evolves based on conversation history]

WANTS: recognition for technical contributions,
work-life balance, meaningful connections
```

---

## Memory Management Deep Dive

### Memory Types

| Type | Storage | Limit | Purpose | Compression |
|------|---------|-------|---------|-------------|
| **Short-Term** | In-memory array | 10 messages | Recent context | Never |
| **Short-Term Detailed** | In-memory array | 2 messages | Full recent exchanges | Never |
| **Long-Term** | In-memory array + disk | Unlimited | Facts, preferences | Yes (every 10 calls) |
| **Deep Memory** | String + disk | Unlimited | Critical info | Never |
| **Character Profile** | String + disk | ~3096 bytes | Character essence | Yes (if >3096 bytes) |
| **User Profile** | String + disk | ~3096 bytes | User essence | Yes (if >3096 bytes) |

### Memory Extraction from Responses

The system expects Claude to append JSON at the end of responses:

```json
{
  "memorize-long-term": {
    "char": "NEW character facts (symbolic)",
    "user": "NEW user facts (symbolic)"
  },
  "memorize-short-term": "Summary (symbolic)",
  "clothing": {
    "char": "Current character clothing",
    "user": "Current user clothing"
  },
  "history": "Relationship milestone (6-10 words, symbolic)",
  "location": "Current character location",
  "date": "YYYY-MM-DD"
}
```

This JSON is:
1. Extracted using `JsonExtractor.extractAttributes()`
2. Stripped from the user-facing response
3. Processed into memory system with auto-categorization

---

## Configuration & Environment

### Required Environment Variables

```bash
# API Configuration
ANTHROPIC_API_KEY=sk-ant-xxx...            # Required for Claude API

# Authentication
AUTH_USERNAME=admin                        # Basic auth username
AUTH_PASSWORD=securepassword123            # Basic auth password
SESSION_KEY=random-secret-key-here         # Cookie session encryption

# Server Configuration
PORT=3001                                  # Server port (default: 3001)
DEBUG_MODE=true                            # Enable debug logging

# HTTPS Configuration (Optional)
USE_HTTPS=false                            # Enable HTTPS
CERT_PATH=/path/to/fullchain.pem          # SSL certificate
KEY_PATH=/path/to/privkey.pem             # SSL private key
```

### NPM Scripts

```json
{
  "start": "node server.js",              // Production start
  "dev": "nodemon server.js",             // Development with auto-reload
  "test": "jest",                         // Run tests
  "setup-ssl": "bash setup-ssl.sh"       // Setup Let's Encrypt SSL
}
```

---

## Security Considerations

### Authentication & Access Control
- **Basic HTTP Authentication:** All routes except `/api/health` and `/api/placeholder/*`
- **Session Management:** Cookie-based with configurable secret key
- **Credential Storage:** Environment variables (never committed)

### Security Headers (Helmet)
```javascript
{
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "'unsafe-inline'"],
    styleSrc: ["'self'", "https://cdn.jsdelivr.net", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https://cdn.jsdelivr.net"],
    connectSrc: ["'self'", "*"],
    fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
    objectSrc: ["'none'"]
  }
}
```

### API Security
- **Retry Logic:** Exponential backoff for 529 (Overloaded) errors
- **Error Handling:** Detailed server-side logging, generic client errors
- **Input Validation:** Session IDs sanitized for filesystem safety

### Deployment Security (EC2)
- SSH (22), HTTP (80), HTTPS (443) ports only
- Let's Encrypt SSL/TLS certificates
- PM2 process management for reliability
- Environment variable isolation

---

## Recent Development Activity

### Recent Commits
```
89e0dbc - Füge Unterstützung für das Datum in das Gedächtnissystem
92d35e1 - Füge Unterstützung für die Standortverfolgung hinzu
936fbf0 - Verbessere die Handhabung von Charakterprofilen
623e286 - Füge Unterstützung für die Serverkonfiguration hinzu
57f3a69 - Merge pull request #4 from erichrutz/prompting
```

### Current Status (ui-server-separation branch)
```
Modified files:
- .gitignore
- anthropic-chat-client.js
- memory-compressor.js
- public/index.html
- server.js

Untracked:
- .DS_Store (macOS system file)
```

---

## Usage Patterns

### Creating a New Session

```javascript
POST /api/session
{
  "characterType": "custom",           // or character filename
  "customProfile": "NAME: ...",        // symbolic profile
  "apiKey": "sk-ant-...",             // optional override
  "startScenario": "Initial context",  // optional
  "compressionEnabled": true,
  "model": "claude-3-7-sonnet-20250219",
  "deepMemory": "Critical facts",      // optional
  "language": "english"                // or "deutsch"
}

Response:
{
  "sessionId": "session_1728567890123_abc123",
  "characterName": "Alexandra"
}
```

### Sending a Message

```javascript
POST /api/message
{
  "sessionId": "session_...",
  "message": "Hello, how are you?",
  "model": "claude-3-7-sonnet-20250219"  // optional
}

Response:
{
  "response": "Character's response here...",
  "memoryState": {
    "shortTerm": [...],
    "longTerm": [...],
    "deepMemory": "...",
    "clothing": {...},
    "history": [...],
    "location": "...",
    "date": "2025-10-10"
  },
  "model": "claude-3-7-sonnet-20250219",
  "characterProfile": "NAME: ..."
}
```

### Manual Memory Compression

```javascript
POST /api/compression/compress
{
  "sessionId": "session_..."
}

Response:
{
  "success": true,
  "beforeCount": 15,
  "afterCount": 2,
  "reduction": 13,
  "reductionPercent": "86.7",
  "memoryState": {...}
}
```

---

## Performance Characteristics

### Token Usage Optimization
- **Context Window Management:** Only last 10 messages sent to API
- **Memory Compression:** ~60% reduction target
- **Profile Compression:** Triggered at 3096 bytes
- **Cached Sessions:** Up to 20 sessions in memory
- **Response Truncation:** Memories limited to 100 chars in context

### Scalability
- **Concurrent Sessions:** Supported via session map
- **File-Based Storage:** 159 sessions currently stored
- **Memory Footprint:** In-memory caching with LRU eviction
- **API Call Batching:** Compression after 10 calls

### Reliability
- **Error Handling:** Try-catch with detailed logging
- **Graceful Degradation:** Failed compressions preserve original data
- **State Persistence:** Auto-save after every message
- **Cleanup on Shutdown:** SIGINT handler saves all active sessions

---

## Development Notes

### Code Quality
- **Total Lines:** 4,138 lines of JavaScript (excluding node_modules)
- **Modularity:** Separated concerns (server, client, memory, persistence)
- **Error Logging:** Comprehensive with stack traces and API response details
- **Comments:** German and English mixed throughout
- **Testing:** Jest configured but tests not visible in current scan

### Known Patterns
- **Async/Await:** Consistent use throughout
- **ES6 Modules:** CommonJS (require/module.exports)
- **Logging Levels:** info, debug, error with conditional debug output
- **Circular Object Handling:** util.inspect with depth limiting

### Potential Improvements
1. **TypeScript Migration:** Add type safety
2. **Database Backend:** Replace file storage with MongoDB/PostgreSQL
3. **WebSocket Support:** Real-time updates
4. **Rate Limiting:** Protect against API abuse
5. **Unit Tests:** Expand Jest coverage
6. **API Documentation:** OpenAPI/Swagger spec
7. **Docker Support:** Containerization for deployment

---

## Troubleshooting

### Common Issues

**Issue: API 529 (Overloaded) Errors**
- **Cause:** Claude API temporarily overloaded
- **Solution:** Automatic retry with exponential backoff (2s, 4s, 8s)
- **Code:** `anthropic-chat-client.js:1278-1317`

**Issue: Memory Compression Fails**
- **Cause:** Insufficient memories (<5) or API error
- **Solution:** Original memories preserved, compression skipped
- **Code:** `memory-compressor.js:143-148`

**Issue: Session Not Found**
- **Cause:** Session ID doesn't exist or was deleted
- **Solution:** Create new session with POST /api/session
- **HTTP Code:** 404

**Issue: Character Profile Null**
- **Cause:** Profile not loaded or improperly formatted
- **Solution:** Fallback to default "Unknown" profile
- **Code:** `anthropic-chat-client.js:1056-1068`

### Debug Mode

Enable detailed logging:
```bash
DEBUG_MODE=true npm start
```

Logs include:
- Memory state before/after operations
- API request/response details
- Compression statistics
- Session cache hits/misses

---

## File Inventory

### Core Files (by lines of code)
1. `anthropic-chat-client.js` - 1,824 lines
2. `server.js` - 942 lines
3. `memory-compressor.js` - 801 lines
4. `localization.js` - 219 lines
5. `memory-persistence.js` - 192 lines
6. `character-profile-example.js` - 160 lines

### Data Directories
- `/characters/` - 37 character definition files
- `/characters-save/` - 13 backup files
- `/memory-storage/` - 159 saved sessions
- `/node_modules/` - 292 dependencies
- `/public/` - Frontend assets (index.html, localization.js)

---

## Dependencies

### Production
```json
{
  "express": "^4.18.2",
  "body-parser": "^1.20.2",
  "node-fetch": "^2.6.9",
  "js-yaml": "^4.1.0",
  "dotenv": "^16.3.1",
  "cors": "^2.8.5",
  "helmet": "^7.1.0",
  "express-basic-auth": "^1.2.1",
  "cookie-session": "^2.0.0"
}
```

### Development
```json
{
  "jest": "^29.5.0",
  "nodemon": "^2.0.22"
}
```

---

## Conclusion

Persona is a production-ready character simulation system with sophisticated memory management, security features, and deployment options. The symbolic character profile format, combined with AI-powered memory compression, enables long-running, context-aware conversations while managing token costs effectively.

**Key Strengths:**
- Advanced two-layer + deep memory architecture
- Intelligent memory compression with symbolic profiles
- Persistent session management with caching
- Production-ready security and deployment
- Multi-language support
- Rich relationship and context tracking

**Ideal Use Cases:**
- Role-playing scenarios with persistent characters
- Long-term conversational AI experiments
- Character development and storytelling
- Professional simulations requiring memory continuity

---

**Last Updated:** October 10, 2025
**Claude.md Version:** 1.0
**Generated by:** Claude Code (Sonnet 4.5)
