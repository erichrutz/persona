// Memory Persistence Module
const fs = require('fs').promises;
const path = require('path');

class MemoryPersistence {
  constructor(options = {}) {
    this.storageDir = options.storageDir || path.join(process.cwd(), 'memory-storage');
    this.fileExtension = options.fileExtension || '.json';
    this.initialized = false;
    
    // Add in-memory cache to reduce disk reads
    this.sessionCache = new Map();
    this.cacheEnabled = options.cacheEnabled !== undefined ? options.cacheEnabled : true;
    this.maxCacheSize = options.maxCacheSize || 20; // Max number of sessions to keep in cache
  }

  async initialize() {
    try {
      // Ensure storage directory exists
      await fs.mkdir(this.storageDir, { recursive: true });
      this.initialized = true;
    } catch (error) {
      console.error('Error initializing memory persistence:', error);
      throw error;
    }
  }

  // Generate a filename from session ID
  getFilePath(sessionId) {
    if (!sessionId) throw new Error('Session ID is required');
    // Sanitize the session ID to create a safe filename
    const safeId = sessionId.replace(/[^a-zA-Z0-9-_]/g, '_');
    return path.join(this.storageDir, `${safeId}${this.fileExtension}`);
  }

  // Save memory state
  async saveMemory(sessionId, memoryState) {
    if (!this.initialized) await this.initialize();
    
    try {
      const filePath = this.getFilePath(sessionId);
      
      // Structure with metadata
      const data = {
        sessionId,
        timestamp: new Date().toISOString(),
        memoryState,
        messages: memoryState.messages || [],
        characterProfile: memoryState.characterProfile,
        userProfile: memoryState.userProfile,
        clothing: memoryState.clothing,
        history: memoryState.history,
        location: memoryState.location || 'unknown', // Default to 'unknown' if not provided
        date: memoryState.date || 'unknown', // Default to 'unknown' if not provided
      };
      
      // Update cache first to improve performance
      if (this.cacheEnabled) {
        this.sessionCache.set(sessionId, data);
        this._maintainCacheSize();
      }
      
      // Then write to disk
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      return { success: true, filePath };
    } catch (error) {
      console.error(`Error saving memory for session ${sessionId}:`, error);
      throw error;
    }
  }
  
  // Keep cache size under control
  _maintainCacheSize() {
    if (this.sessionCache.size <= this.maxCacheSize) return;
    
    // If cache is too large, remove oldest entries
    const entries = [...this.sessionCache.entries()];
    entries.sort((a, b) => {
      const timestampA = new Date(a[1].timestamp);
      const timestampB = new Date(b[1].timestamp);
      return timestampA - timestampB; // Sort oldest first
    });
    
    // Remove oldest entries until we're back to max size
    const entriesToRemove = entries.slice(0, entries.length - this.maxCacheSize);
    for (const [key] of entriesToRemove) {
      this.sessionCache.delete(key);
    }
  }

  // Load memory state
  async loadMemory(sessionId) {
    if (!this.initialized) await this.initialize();
    
    // Check cache first for improved performance
    if (this.cacheEnabled && this.sessionCache.has(sessionId)) {
      console.log(`[Memory] Cache hit for session ${sessionId}`);
      return this.sessionCache.get(sessionId);
    }
    
    try {
      const filePath = this.getFilePath(sessionId);
      const fileContent = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(fileContent);
      
      // Add to cache for future requests
      if (this.cacheEnabled) {
        this.sessionCache.set(sessionId, data);
        this._maintainCacheSize();
      }
      
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File not found - no memory exists for this session
        return null;
      }
      console.error(`Error loading memory for session ${sessionId}:`, error);
      throw error;
    }
  }

  // List all available memory sessions
  async listSessions() {
    if (!this.initialized) await this.initialize();

    try {
      const files = await fs.readdir(this.storageDir);
      const sessions = [];

      for (const file of files) {
        // Only process .json files (skip .md and other files)
        if (!file.endsWith('.json')) {
          continue;
        }

        if (file.endsWith(this.fileExtension)) {
          try {
            const filePath = path.join(this.storageDir, file);
            const content = await fs.readFile(filePath, 'utf8');
            const data = JSON.parse(content);
            const nameRegex = /NAME:[ \t]+(.*?)(?=[ \t]*[\r\n]*[ \t]*ID:)/i;

            let characterName = "Custom Character"; // Default name
            let userName = null; // Default to null if not found

            // Extract character name from characterProfile
            if (data.memoryState &&
                data.memoryState.characterProfile &&
                typeof data.memoryState.characterProfile === 'string') {
              const match = data.memoryState.characterProfile.match(nameRegex);

              if (match) {
                characterName = match[1].trim();
              }
            }

            // Extract user name from userProfile (may not exist)
            if (data.memoryState &&
                data.memoryState.userProfile &&
                typeof data.memoryState.userProfile === 'string') {
              const match = data.memoryState.userProfile.match(nameRegex);

              if (match) {
                userName = match[1].trim();
              }
            }

            // Extract message metadata
            const messages = data.messages || [];
            const messageCount = messages.length;

            // First message date: use session timestamp as fallback
            const firstMessageDate = data.timestamp;

            // Last message date: use file modification time as fallback
            const stats = await fs.stat(filePath);
            const lastMessageDate = stats.mtime.toISOString();

            sessions.push({
              sessionId: data.sessionId,
              timestamp: data.timestamp,
              characterName: characterName,
              userName: userName,
              messageCount: messageCount,
              firstMessageDate: firstMessageDate,
              lastMessageDate: lastMessageDate
            });
          } catch (parseError) {
            console.warn(`Could not parse memory file ${file}:`, parseError);
          }
        }
      }

      return sessions.sort((a, b) => new Date(b.lastMessageDate) - new Date(a.lastMessageDate));
    } catch (error) {
      console.error('Error listing memory sessions:', error);
      throw error;
    }
  }

  // Delete a memory session
  async deleteSession(sessionId) {
    if (!this.initialized) await this.initialize();
    
    try {
      // Remove from cache first if it exists
      if (this.cacheEnabled && this.sessionCache.has(sessionId)) {
        this.sessionCache.delete(sessionId);
      }
      
      // Then remove from disk
      const filePath = this.getFilePath(sessionId);
      await fs.unlink(filePath);
      return { success: true };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { success: false, reason: 'Session not found' };
      }
      console.error(`Error deleting session ${sessionId}:`, error);
      throw error;
    }
  }
}

module.exports = { MemoryPersistence };