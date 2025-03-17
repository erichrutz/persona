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
        clothing: memoryState.clothing
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
        if (file.endsWith(this.fileExtension)) {
          try {
            const filePath = path.join(this.storageDir, file);
            const content = await fs.readFile(filePath, 'utf8');
            const data = JSON.parse(content);
            
            sessions.push({
              sessionId: data.sessionId,
              timestamp: data.timestamp,
              characterName: data.memoryState.characterProfile?.name || 'Unknown'
            });
          } catch (parseError) {
            console.warn(`Could not parse memory file ${file}:`, parseError);
          }
        }
      }
      
      return sessions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
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