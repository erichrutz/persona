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
const { CharacterProfileHandler } = require('./character-profile-handler');
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
const PORT = process.env.PORT || 3000;
const USE_HTTPS = process.env.USE_HTTPS === 'true';
const CERT_PATH = process.env.CERT_PATH || '/etc/letsencrypt/live/yourdomain.com/fullchain.pem';
const KEY_PATH = process.env.KEY_PATH || '/etc/letsencrypt/live/yourdomain.com/privkey.pem';
const USERNAME = process.env.AUTH_USERNAME || 'admin';
const PASSWORD = process.env.AUTH_PASSWORD || 'securepassword';

// Set up middleware
app.use(bodyParser.json());
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://cdn.jsdelivr.net"],
      connectSrc: ["'self'"],
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

// Authentication middleware
app.use(basicAuth({
  users: { [USERNAME]: PASSWORD },
  challenge: true,
  realm: 'Persona Character Simulation'
}));

app.use(express.static(path.join(__dirname, 'public')));

// Store active chat clients for compression management
const activeSessions = new Map();

// Initialize memory persistence
const memoryPersistence = new MemoryPersistence();

// Character profile handler
const profileHandler = new CharacterProfileHandler();

// Get character profile by type
function getCharacterProfile(type) {
  switch (type) {
    case 'detective':
      return characterProfiles.victorianDetective;
    case 'hacker':
      return characterProfiles.cyberpunkHacker;
    case 'bard':
      return characterProfiles.fantasyBard;
    case 'mother':
      return characterProfiles.divorcedMother;
    case 'girl':
      return characterProfiles.teenageGirl;
    case 'matildaMartin':
      return characterProfiles.matildaMartin;
    default:
      return null;
  }
}

// Set default API key if available
const DEFAULT_API_KEY = process.env.ANTHROPIC_API_KEY || '';

// Routes

// Create or load a session
app.post('/api/session', async (req, res) => {
  try {
    const { sessionId, characterType, apiKey, customProfile, startScenario, compressionEnabled, model, deepMemory } = req.body;
    
    // Check if loading existing session
    if (sessionId) {
      // Load existing session
      const chatClient = new AnthropicChatClient({
        apiKey: apiKey || DEFAULT_API_KEY,
        persistence: memoryPersistence,
        sessionId: sessionId,
        model: model
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
      
      if (characterType === 'custom' && customProfile) {
        // Use custom profile
        profile = customProfile;
        characterName = customProfile.name || 'Custom Character';
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
        model: model || 'claude-3-7-sonnet-20250219'
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
        sessionId: sessionId
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

    const parsedResponse = response.replace(/\s*\{(?:\s*"[^"]+"\s*:\s*"(?:[^"\\]|\\.)*"\s*,?)+\}\s*$/, '').trim();
    
    // Include model info in response
    res.json({ 
      response: parsedResponse, 
      memoryState,
      model: chatClient.model 
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
    
    res.json(memoryState);
  } catch (error) {
    logger.error('Error getting memory state:', error);
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