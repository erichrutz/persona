// Server.js - Express server for Character Impersonation with Memory Compression
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const util = require('util');
const https = require('https');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const basicAuth = require('express-basic-auth');
const cookieSession = require('cookie-session');
require('dotenv').config(); // Load environment variables from .env file
const { AnthropicChatClient, MemorySystem } = require('./anthropic-chat-client');
const { MemoryPersistence } = require('./memory-persistence');
// JSON character profiles have been replaced by symbolic text profiles
const characterProfiles = require('./character-profile-example');

// Enhanced logging setup
const DEBUG = process.env.DEBUG_MODE || 'true';
global.logger = {
  info: (message, ...args) => {
    console.log(`[INFO] ${message}`, ...args);
  },
  debug: (message, ...args) => {
    if (DEBUG === 'true') {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  },
  error: (message, err) => {
    console.error(`[ERROR] ${message}`);
    if (err) {
      console.error(`\tMessage: ${err.message}`);
      console.error(`\tStack: ${err.stack}`);
      
      // Log detailed error properties if available
      if (err.response) {
        console.error(`\tAPI Response: ${util.inspect(err.response.data || {}, { depth: 3 })}`);
      }
      
      // Log circular object-safe details
      try {
        const details = util.inspect(err, { depth: 2, colors: true });
        console.error(`\tDetails: ${details}`);
      } catch (inspectErr) {
        console.error(`\tCould not inspect error details: ${inspectErr.message}`);
      }
    }
  }
};
const logger = global.logger;

// Create Express app
const app = express();
const PORT = process.env.PORT || 3001;
const USE_HTTPS = process.env.USE_HTTPS === 'true';
const CERT_PATH = process.env.CERT_PATH || '/etc/letsencrypt/live/yourdomain.com/fullchain.pem';
const KEY_PATH = process.env.KEY_PATH || '/etc/letsencrypt/live/yourdomain.com/privkey.pem';
const USERNAME = process.env.AUTH_USERNAME || 'admin';
const PASSWORD = process.env.AUTH_PASSWORD || 'securepassword';

// Set up middleware
app.use(bodyParser.json());
app.use(cors({
  origin: true, // Allow any origin, but enable credentials
  credentials: true, // Allow credentials (cookies, authorization headers)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://cdn.jsdelivr.net"],
      connectSrc: ["'self'", "*"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  }
}));

// Set up session management
app.use(cookieSession({
  name: 'session',
  keys: [process.env.SESSION_KEY || 'persona-secret-key'],
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
}));

// Health check endpoint (no authentication required)
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Persona server is running',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Placeholder image endpoint (no authentication required)
app.get('/api/placeholder/:width/:height', (req, res) => {
  const { width, height } = req.params;
  
  // Create a simple SVG placeholder
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#e9ecef"/>
    <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="14" fill="#6c757d" text-anchor="middle" dy=".3em">${width}×${height}</text>
  </svg>`;
  
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
  res.send(svg);
});

// Authentication middleware (applied to all routes except health check)
app.use(basicAuth({
  users: { [USERNAME]: PASSWORD },
  challenge: true,
  realm: 'Persona Character Simulation'
}));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Copy the localization.js file to public directory on startup
const localizationFilePath = path.join(__dirname, 'localization.js');
const publicLocalizationPath = path.join(__dirname, 'public', 'localization.js');

try {
  fs.copyFileSync(localizationFilePath, publicLocalizationPath);
  logger.info('Localization file copied to public directory');
} catch (error) {
  logger.error('Error copying localization file:', error);
}

// Also serve localization.js file directly from root (as backup)
app.get('/localization.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'localization.js'));
});

// Store active chat clients for compression management
const activeSessions = new Map();

// Initialize memory persistence
const memoryPersistence = new MemoryPersistence();

// Character profiles are now handled directly in symbolic format

// Character profiles are now loaded directly from symbolic text files
function getCharacterProfile(type) {
  // This function is kept for backward compatibility but no longer returns JSON objects
  return null;
}

// Set default API key if available
const DEFAULT_API_KEY = process.env.ANTHROPIC_API_KEY || '';

// Routes

// Create or load a session
app.post('/api/session', async (req, res) => {
  try {
    const { sessionId, characterType, apiKey, customProfile, startScenario, compressionEnabled, model, deepMemory, language } = req.body;
    
    // Check if loading existing session
    if (sessionId) {
      // Load existing session
      const chatClient = new AnthropicChatClient({
        apiKey: apiKey || DEFAULT_API_KEY,
        persistence: memoryPersistence,
        sessionId: sessionId,
        model: model,
        language: language || 'english'
      });
      
      // Load the state
      const loadResult = await chatClient.loadState(sessionId);
      
      if (!loadResult.success) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      // Add to active sessions map
      activeSessions.set(chatClient.sessionId, chatClient);
      
      return res.json({
        sessionId: chatClient.sessionId,
        characterName: loadResult.loadedState.characterProfile?.name || 'AI Assistant',
        memoryState: chatClient.getMemoryState()
      });
    } else {
      // Create new session
      let profile;
      let characterName;
      let isJSON = true;
      
      if (characterType === 'custom' && customProfile) {
        // Use custom profile
        profile = customProfile;
        // Check if it's a symbolic profile by looking for NAME: header
        const regex = /NAME:[ \t]+(.*?)(?=[ \t]*[\r\n]*[ \t]*ID:)/i;
        const match = customProfile.match !== undefined && customProfile.match(regex);
        
        if (match) {
          // It's a symbolic profile
          characterName = match[1].trim();
          isJSON = false;
        } else if (typeof customProfile === 'object' && customProfile.name) {
          // For backward compatibility - treat as JSON object if it has a name property
          characterName = customProfile.name || 'Custom Character';
          isJSON = true;
        } else {
          // Default fallback
          characterName = 'Custom Character';
          isJSON = false;
        }
      } else {
        // Get predefined character profile
        profile = getCharacterProfile(characterType);
        characterName = profile?.name || 'AI Assistant';
      }
      
      // Create chat client
      const chatClient = new AnthropicChatClient({
        apiKey: apiKey || DEFAULT_API_KEY,
        characterProfile: profile,
        persistence: memoryPersistence,
        compressionEnabled: compressionEnabled !== undefined ? compressionEnabled : true,
        deepMemory: deepMemory || '',
        model: model || 'claude-3-7-sonnet-20250219',
        language: language || 'english',
        characterName: characterName,
        isJSON: isJSON
      });
      
      // Set initial context if provided
      if (startScenario) {
        chatClient.initialContext = startScenario;
      }
      
      // Set deep memory if provided
      if (deepMemory) {
        await chatClient.setDeepMemory(deepMemory);
      }
      
      // Save state
      await chatClient.saveState();
      
      // Add to active sessions map
      activeSessions.set(chatClient.sessionId, chatClient);
      
      return res.json({
        sessionId: chatClient.sessionId,
        characterName: characterName
      });
    }
  } catch (error) {
    logger.error('Error creating session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all available sessions
app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await memoryPersistence.listSessions();
    res.json(sessions);
  } catch (error) {
    logger.error('Error listing sessions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a session
app.delete('/api/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Remove from active sessions
    activeSessions.delete(sessionId);
    
    // Delete from persistence
    const result = await memoryPersistence.deleteSession(sessionId);
    
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: result.reason });
    }
  } catch (error) {
    logger.error('Error deleting session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send a message
app.post('/api/message', async (req, res) => {
  try {
    const { sessionId, message, model } = req.body;
    
    if (!sessionId || !message) {
      return res.status(400).json({ error: 'Session ID and message are required' });
    }
    
    // Get chat client for this session
    let chatClient = activeSessions.get(sessionId);
    
    // If not in active sessions, try to load it
    if (!chatClient) {
      chatClient = new AnthropicChatClient({
        apiKey: DEFAULT_API_KEY,
        persistence: memoryPersistence,
        sessionId: sessionId,
        model: model
      });
      
      const loadResult = await chatClient.loadState(sessionId);
      
      if (!loadResult.success) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      // Add to active sessions
      activeSessions.set(sessionId, chatClient);
    }
    
    // Update model if specified
    if (model && model !== chatClient.model) {
      chatClient.model = model;
      console.log(`Updated model to ${model} for session ${sessionId}`);
    }
    
    // Send message
    const response = await chatClient.sendMessage(message);

    // Get memory state
    const memoryState = chatClient.getMemoryState();

    await chatClient.saveState();

    // Strip JSON from response
    let parsedResponse = response.replace(/\s*\{(?:\s*"[^"]+"\s*:\s*"(?:[^"\\]|\\.)*"\s*,?)+\}\s*$/, '').trim();

    // Extract and remove date prefix if present (for UI display)
    // Date is kept in conversation history for AI context, but removed from UI display
    const dateMatch = parsedResponse.match(/^(\d{4}-\d{2}-\d{2})\s+/);
    let displayDate = null;
    if (dateMatch) {
      displayDate = dateMatch[1];
      parsedResponse = parsedResponse.substring(dateMatch[0].length).trim();
    }

    // Include model info and date in response
    res.json({
      response: parsedResponse,
      date: displayDate || memoryState.date, // Use extracted date or fallback to memoryState
      memoryState,
      model: chatClient.model,
      characterProfile: chatClient.characterProfile
    });
  } catch (error) {
    logger.error('Error sending message:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get memory state
app.get('/api/memory/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Get chat client for this session
    let chatClient = activeSessions.get(sessionId);
    
    // If not in active sessions, try to load it
    if (!chatClient) {
      chatClient = new AnthropicChatClient({
        apiKey: DEFAULT_API_KEY,
        persistence: memoryPersistence,
        sessionId: sessionId
      });
      
      const loadResult = await chatClient.loadState(sessionId);
      
      if (!loadResult.success) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      // Add to active sessions
      activeSessions.set(sessionId, chatClient);
    }
    
    // Get memory state
    const memoryState = chatClient.getMemoryState();
    
    res.json({
      success: true,
      memoryState: memoryState,
      characterProfile: chatClient.characterProfile,
      characterName: chatClient.characterName
    });
  } catch (error) {
    logger.error('Error getting memory state:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get relationship history for a session
app.get('/api/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Get chat client for this session
    let chatClient = activeSessions.get(sessionId);
    
    // If not in active sessions, try to load it
    if (!chatClient) {
      chatClient = new AnthropicChatClient({
        apiKey: DEFAULT_API_KEY,
        persistence: memoryPersistence,
        sessionId: sessionId
      });
      
      const loadResult = await chatClient.loadState(sessionId);
      
      if (!loadResult.success) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      // Add to active sessions
      activeSessions.set(sessionId, chatClient);
    }
    
    // Get relationship history from memory
    const history = chatClient.memory.history || [];
    
    res.json({
      success: true,
      history: history,
      characterName: chatClient.characterName
    });
  } catch (error) {
    logger.error('Error getting relationship history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete specific history entries
app.delete('/api/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { entries } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'Entries to delete must be provided as an array' });
    }
    
    // Get chat client for this session
    let chatClient = activeSessions.get(sessionId);
    
    // If not in active sessions, try to load it
    if (!chatClient) {
      chatClient = new AnthropicChatClient({
        apiKey: DEFAULT_API_KEY,
        persistence: memoryPersistence,
        sessionId: sessionId
      });
      
      const loadResult = await chatClient.loadState(sessionId);
      
      if (!loadResult.success) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      // Add to active sessions
      activeSessions.set(sessionId, chatClient);
    }
    
    // Initialize history array if it doesn't exist
    if (!chatClient.memory.history) {
      chatClient.memory.history = [];
    }
    
    // Count original entries
    const originalCount = chatClient.memory.history.length;
    
    // Filter out entries that match the deletion criteria
    chatClient.memory.history = chatClient.memory.history.filter(entry => {
      // Check if this entry matches any in the deletion list
      return !entries.some(toDelete => {
        if (toDelete.id && entry.id) {
          return toDelete.id === entry.id;
        }
        if (toDelete.timestamp && entry.timestamp) {
          return toDelete.timestamp === entry.timestamp;
        }
        return false;
      });
    });
    
    // Count entries after deletion
    const newCount = chatClient.memory.history.length;
    const deletedCount = originalCount - newCount;
    
    // Save the updated state
    await chatClient.saveState();
    
    res.json({
      success: true,
      deletedCount,
      remainingCount: newCount
    });
  } catch (error) {
    logger.error('Error deleting history entries:', error);
    res.status(500).json({ error: error.message });
  }
});

// Toggle memory compression
app.post('/api/compression/toggle', async (req, res) => {
  try {
    const { sessionId, enabled } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    // Get chat client for this session
    const chatClient = activeSessions.get(sessionId);
    
    if (!chatClient) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Toggle compression
    const result = chatClient.toggleCompression(enabled);
    
    // Save state
    await chatClient.saveState();
    
    res.json({ success: true, enabled: result.enabled });
  } catch (error) {
    logger.error('Error toggling compression:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update deep memory
app.post('/api/deep-memory/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { content } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    // Get chat client for this session
    let chatClient = activeSessions.get(sessionId);
    
    // If not in active sessions, try to load it
    if (!chatClient) {
      chatClient = new AnthropicChatClient({
        apiKey: DEFAULT_API_KEY,
        persistence: memoryPersistence,
        sessionId: sessionId
      });
      
      const loadResult = await chatClient.loadState(sessionId);
      
      if (!loadResult.success) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      // Add to active sessions
      activeSessions.set(sessionId, chatClient);
    }
    
    // Set deep memory
    await chatClient.setDeepMemory(content);
    
    // Save state
    await chatClient.saveState();
    
    // Get updated memory state
    const memoryState = chatClient.getMemoryState();
    
    res.json({
      success: true,
      memoryState
    });
  } catch (error) {
    logger.error('Error updating deep memory:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update clothing information
app.post('/api/clothing/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { characterClothing, userClothing } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    // Get chat client for this session
    let chatClient = activeSessions.get(sessionId);
    
    // If not in active sessions, try to load it
    if (!chatClient) {
      chatClient = new AnthropicChatClient({
        apiKey: DEFAULT_API_KEY,
        persistence: memoryPersistence,
        sessionId: sessionId
      });
      
      const loadResult = await chatClient.loadState(sessionId);
      
      if (!loadResult.success) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      // Add to active sessions
      activeSessions.set(sessionId, chatClient);
    }
    
    // Update clothing information with proper structure checking
    if (!chatClient.memory.clothing) {
      chatClient.memory.clothing = { clothing: { char: "", user: "" } };
    } else if (!chatClient.memory.clothing.clothing) {
      // Make sure there's a nested clothing property if it doesn't exist
      chatClient.memory.clothing = { clothing: { char: "", user: "" } };
    }
    
    // Update with new values
    chatClient.memory.clothing.clothing.char = characterClothing || chatClient.memory.clothing.clothing.char;
    chatClient.memory.clothing.clothing.user = userClothing || chatClient.memory.clothing.clothing.user;
    
    // Log the structure for debugging
    logger.debug('Updated clothing structure:', JSON.stringify(chatClient.memory.clothing));
    
    // Save state
    await chatClient.saveState();
    
    // Get updated memory state
    const memoryState = chatClient.getMemoryState();
    
    res.json({
      success: true,
      memoryState
    });
  } catch (error) {
    logger.error('Error updating clothing information:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update location information
app.post('/api/location/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { characterLocation } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    // Get chat client for this session
    let chatClient = activeSessions.get(sessionId);
    
    // If not in active sessions, try to load it
    if (!chatClient) {
      chatClient = new AnthropicChatClient({
        apiKey: DEFAULT_API_KEY,
        persistence: memoryPersistence,
        sessionId: sessionId
      });
      
      const loadResult = await chatClient.loadState(sessionId);
      
      if (!loadResult.success) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      // Add to active sessions
      activeSessions.set(sessionId, chatClient);
    }
    
    // Update location information (only for character)
    if (characterLocation !== undefined) {
      chatClient.memory.location = characterLocation;
    }
    
    // Log the update for debugging
    logger.debug('Updated location:', chatClient.memory.location);
    
    // Save state
    await chatClient.saveState();
    
    // Get updated memory state
    const memoryState = chatClient.getMemoryState();
    
    res.json({
      success: true,
      memoryState
    });
  } catch (error) {
    logger.error('Error updating location information:', error);
    res.status(500).json({ error: error.message });
  }
});

// Manually trigger memory compression
app.post('/api/compression/compress', async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    // Get chat client for this session
    const chatClient = activeSessions.get(sessionId);
    
    if (!chatClient) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Get memory counts before compression
    const beforeCount = chatClient.memory.longTermMemory.length;
    
    // Skip if not enough memories to compress
    if (beforeCount <= 5) {
      return res.status(400).json({ 
        success: false, 
        reason: 'Not enough memories to compress',
        beforeCount
      });
    }
    
    // Trigger compression
    const result = await chatClient.compressMemory();
    
    if (!result.success) {
      return res.status(400).json({ 
        success: false,
        reason: result.reason || 'Compression failed',
        details: result
      });
    }
    
    // Get memory counts after compression
    const afterCount = chatClient.memory.longTermMemory.length;
    
    // Get updated memory state
    const memoryState = chatClient.getMemoryState();
    
    res.json({
      success: true,
      beforeCount,
      afterCount,
      reduction: beforeCount - afterCount,
      reductionPercent: ((beforeCount - afterCount) / beforeCount * 100).toFixed(1),
      memoryState
    });
  } catch (error) {
    logger.error('Error compressing memory:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get compression stats
app.get('/api/compression/stats/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    // Get chat client for this session
    const chatClient = activeSessions.get(sessionId);
    
    if (!chatClient) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Get compression stats
    const stats = chatClient.getCompressionStats();
    
    res.json(stats);
  } catch (error) {
    logger.error('Error fetching compression stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get available characters from the characters folder
app.get('/api/characters', (req, res) => {
  try {
    const charactersDir = path.join(__dirname, 'characters');
    
    if (!fs.existsSync(charactersDir)) {
      return res.json([]);
    }
    
    const files = fs.readdirSync(charactersDir);
    const characters = files
      .filter(file => file.endsWith('.txt') || file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(charactersDir, file);
        const name = path.basename(file, path.extname(file));
        
        // Try to extract character name from file content
        let displayName = name;
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          
          // For symbolic text files, look for NAME: header
          const nameMatch = content.match(/NAME:[ \t]+(.*?)(?=[ \t]*[\r\n])/i);
          if (nameMatch) {
            displayName = nameMatch[1].trim();
          } else if (file.endsWith('.json')) {
            // For JSON files, try to parse and get name
            const jsonData = JSON.parse(content);
            if (jsonData.name) {
              displayName = jsonData.name;
            }
          }
        } catch (error) {
          // If we can't read the file or parse it, use filename
          logger.debug(`Could not parse character file ${file}:`, error.message);
        }
        
        return {
          filename: file,
          name: displayName,
          displayName: displayName
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    
    res.json(characters);
  } catch (error) {
    logger.error('Error listing characters:', error);
    res.status(500).json({ error: error.message });
  }
});

// Load character profile from file
app.get('/api/character/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, 'characters', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Character file not found' });
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    
    res.json({
      filename,
      content,
      isJSON: filename.endsWith('.json')
    });
  } catch (error) {
    logger.error('Error loading character:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
if (USE_HTTPS) {
  try {
    // Check if cert files exist
    if (!fs.existsSync(CERT_PATH) || !fs.existsSync(KEY_PATH)) {
      logger.error(`SSL certificate files not found at ${CERT_PATH} and ${KEY_PATH}`);
      logger.info('Falling back to HTTP server');
      startHttpServer();
    } else {
      // HTTPS server
      const httpsOptions = {
        cert: fs.readFileSync(CERT_PATH),
        key: fs.readFileSync(KEY_PATH)
      };
      
      https.createServer(httpsOptions, app).listen(PORT, () => {
        logger.info(`HTTPS server running on port ${PORT}`);
        logger.info(`Secure access enabled with authentication`);
        logger.info(`Memory compression system enabled`);
        logger.info(`Debug mode: ${DEBUG}`);
      });
    }
  } catch (error) {
    logger.error('Error starting HTTPS server:', error);
    logger.info('Falling back to HTTP server');
    startHttpServer();
  }
} else {
  startHttpServer();
}

function startHttpServer() {
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`HTTP server running on port ${PORT}`);
    logger.info(`Server accessible from all network interfaces (0.0.0.0)`);
    logger.info(`Authentication enabled`);
    logger.info(`Memory compression system enabled`);
    logger.info(`Debug mode: ${DEBUG}`);
  });
}

// Handle cleanup on server shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down server...');
  // Save all active sessions
  if (activeSessions.size > 0) {
    logger.info(`Saving ${activeSessions.size} active sessions...`);
    for (const [sessionId, client] of activeSessions.entries()) {
      try {
        await client.saveState();
        logger.info(`Saved session ${sessionId}`);
      } catch (error) {
        logger.error(`Error saving session ${sessionId}:`, error);
      }
    }
  }
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION:', err);
  // Keep the process running, but log the error
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('UNHANDLED REJECTION:', { reason });
  // Keep the process running, but log the error
});