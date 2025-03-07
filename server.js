// Server.js - Express server for Character Impersonation with Memory Compression
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config(); // Load environment variables from .env file
const { AnthropicChatClient, MemorySystem } = require('./anthropic-chat-client');
const { MemoryPersistence } = require('./memory-persistence');
const { CharacterProfileHandler } = require('./character-profile-handler');
const characterProfiles = require('./character-profile-example');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Set up middleware
app.use(bodyParser.json());
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
    const { sessionId, characterType, apiKey, customProfile, startScenario, compressionEnabled, model } = req.body;
    
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
        model: model || 'claude-3-7-sonnet-20250219'
      });
      
      // Set initial context if provided
      if (startScenario) {
        chatClient.initialContext = startScenario;
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
    console.error('Error creating session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all available sessions
app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await memoryPersistence.listSessions();
    res.json(sessions);
  } catch (error) {
    console.error('Error listing sessions:', error);
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
    console.error('Error deleting session:', error);
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
    console.error('Error sending message:', error);
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
    console.error('Error getting memory state:', error);
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
    console.error('Error toggling compression:', error);
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
    console.error('Error compressing memory:', error);
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
    console.error('Error fetching compression stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Memory compression system enabled`);
});

// Handle cleanup on server shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  // Save all active sessions
  if (activeSessions.size > 0) {
    console.log(`Saving ${activeSessions.size} active sessions...`);
    for (const [sessionId, client] of activeSessions.entries()) {
      try {
        await client.saveState();
        console.log(`Saved session ${sessionId}`);
      } catch (error) {
        console.error(`Error saving session ${sessionId}:`, error);
      }
    }
  }
  process.exit(0);
});