// Anthropic Chat Client with 2-Layer Memory System and Memory Compression
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const API_URL = 'https://api.anthropic.com/v1/messages';
const { MemoryPersistence } = require('./memory-persistence');
const {MemoryCompressor} = require('./memory-compressor');

class MemorySystem {
  constructor(options = {}) {
    this.shortTermMemory = options.shortTermMemory || [];
    this.shortTermMemoryDetailled = options.shortTermMemoryDetailled || [];
    this.longTermMemory = options.longTermMemory || [];
    this.shortTermMemoryLimit = options.shortTermMemoryLimit || 7;
    this.shortTermMemoryDetailedLimit = options.shortTermMemoryDetailedLimit || 2;
    
    // Initialize persistence if provided
    this.persistence = options.persistence || null;
    this.sessionId = options.sessionId || null;
    this.autoSave = options.autoSave !== undefined ? options.autoSave : true;
        
    // Memory compression settings
    this.compressionEnabled = options.compressionEnabled !== undefined ? options.compressionEnabled : true;
    this.compressionMetadata = {
      totalApiCalls: 0,
      compressionCount: 0,
      lastCompressionTime: null,
      memoriesBeforeLastCompression: 0,
      memoriesAfterLastCompression: 0
    };
  }

  // Add a message to short-term memory
  async addToShortTermMemory(message) {
    const memory = this.extractShortTermMemory(message.content);

    if (!memory) {
      this.shortTermMemory.push({content: message.content.replace(/\s*\{(?:\s*"[^"]+"\s*:\s*"(?:[^"\\]|\\.)*"\s*,?)+\}\s*$/, '').trim()});
      
    } else {
      this.shortTermMemory.push({content: memory});
    }
    this.shortTermMemoryDetailled.push({content: message.content.replace(/\s*\{(?:\s*"[^"]+"\s*:\s*"(?:[^"\\]|\\.)*"\s*,?)+\}\s*$/, '').trim()});
    // Maintain short-term memory size limit
    if (this.shortTermMemoryDetailled.length > this.shortTermMemoryDetailedLimit) {
      this.shortTermMemoryDetailled.shift(); // Remove oldest message
    }
    if (this.shortTermMemory.length > this.shortTermMemoryLimit) {
      this.shortTermMemory.shift(); // Remove oldest message
    }
        
    // Auto-save if enabled
    if (this.autoSave && this.persistence && this.sessionId) {
      await this.saveToStorage();
    }
  }

  extractShortTermMemory(inputString) {
    // First, find the JSON object within the string
    const jsonRegex = /\{(?:\s*"[^"]+"\s*:\s*"(?:[^"\\]|\\.)*"\s*,?)+\}/;
    const jsonMatch = inputString.match(jsonRegex);
    
    if (!jsonMatch) {
      return inputString;
    }
    
    try {
      // Parse the JSON string to an object
      const jsonObj = JSON.parse(jsonMatch[0]);
      
      // Return the short-term memory if it exists
      return jsonObj["memorize-short-term"] || null;
    } catch (error) {
      console.error("Error parsing JSON:", error);
      
      // Alternative approach: direct regex extraction if JSON parsing fails
      const shortTermRegex = /"memorize-short-term"\s*:\s*"([^"]+)"/;
      const shortTermMatch = inputString.match(shortTermRegex);
      
      return shortTermMatch ? shortTermMatch[1] : null;
    }

  }

  extractLongTermMemory(inputString) {
    // First, find the JSON object within the string
    const jsonRegex = /\{(?:\s*"[^"]+"\s*:\s*"(?:[^"\\]|\\.)*"\s*,?)+\}/;
    const jsonRegex2= /\{[\s\S]*"memorize-long-term"[\s\S]*"memorize-short-term"[\s\S]*"reason-long-term"[\s\S]*\}/;
    let jsonMatch = inputString.match(jsonRegex);
    
    if (!jsonMatch) {
      jsonMatch = inputString.match(jsonRegex2);
      if (!jsonMatch) {
        return null;
      }
    }
    
    try {
      // Parse the JSON string to an object
      const jsonObj = JSON.parse(jsonMatch[0]);
      
      // Return the short-term memory if it exists
      return jsonObj["memorize-long-term"] || null;
    } catch (error) {
      console.error("Error parsing JSON:", error);
      
      // Alternative approach: direct regex extraction if JSON parsing fails
      const longTermRegex = /"memorize-long-term"\s*:\s*"([^"]+)"/;
      const longTermMatch = inputString.match(longTermRegex);
      
      return longTermMatch ? longTermMatch[1] : null;
    }
  }

  // Add information to long-term memory
 async addToLongTermMemory(information) {
    // Extract topic information from content if available
    let topicGroup = null;
    let subtopic = null;
    const topicMatch = information.match(/^\[([\w_]+)(?::([^\]]+))?\]/);
    
    if (topicMatch) {
      topicGroup = topicMatch[1];
      subtopic = topicMatch[2] || null;
    } else {
      // Auto-categorize if no explicit topic tag
      
      // Check for appearance information (highest priority)
      if (information.toLowerCase().includes("wear") || 
          information.toLowerCase().includes("look") || 
          information.toLowerCase().includes("tall") || 
          information.toLowerCase().includes("short") || 
          information.toLowerCase().includes("hair") || 
          information.toLowerCase().includes("eyes") || 
          information.toLowerCase().includes("dress") || 
          information.toLowerCase().includes("shirt") || 
          information.toLowerCase().includes("pants") || 
          information.toLowerCase().includes("clothes") || 
          information.toLowerCase().includes("style") || 
          information.toLowerCase().includes("height") || 
          information.toLowerCase().includes("face") || 
          information.toLowerCase().includes("physical")) {
        
        // Automatically categorize as user appearance
        topicGroup = "USER_IDENTITY";
        subtopic = "appearance";
        information = `[USER_IDENTITY:appearance] ${information}`;
      }
      // Check for core user identity info
      else if (information.toLowerCase().includes("name") || 
               information.toLowerCase().includes("age") || 
               information.toLowerCase().includes("old") || 
               information.toLowerCase().includes("from") || 
               information.toLowerCase().includes("occupation") || 
               information.toLowerCase().includes("work") || 
               information.toLowerCase().includes("job") || 
               information.toLowerCase().includes("live")) {
        
        topicGroup = "USER_IDENTITY";
        subtopic = "core";
        information = `[USER_IDENTITY:core] ${information}`;
      }
    }
    
    // Calculate importance score
    let importance = 0.5; // Default medium importance
    
    // USER APPEARANCE IS HIGHEST IMPORTANCE
    if (topicGroup === "USER_IDENTITY" && subtopic === "appearance") {
      importance = 0.9; // Very high importance
    }
    // USER CORE INFO IS HIGH IMPORTANCE
    else if (topicGroup === "USER_IDENTITY" && subtopic === "core") {
      importance = 0.8; // High importance
    }
    // Other importance calculations
    else {
      // Increase score for likely important content
      if (information.includes("name") || information.includes("birthday") || 
          information.includes("significant") || information.includes("important")) {
        importance += 0.2;
      }
      
      // Relationship indicators increase importance
      if (information.includes("family") || information.includes("friend") || 
          information.includes("relationship") || information.includes("feel")) {
        importance += 0.2;
      }
      
      // Personal preferences are moderately important
      if (information.includes("like") || information.includes("dislike") || 
          information.includes("prefer") || information.includes("enjoy")) {
        importance += 0.1;
      }
      
      // Appearance info is always high importance
      if (information.toLowerCase().includes("wear") || 
          information.toLowerCase().includes("look") || 
          information.toLowerCase().includes("clothes")) {
        importance += 0.3;
      }
    }
    
    // Cap at 1.0
    importance = Math.min(importance, 1.0);
    
    // Add timestamp to help with retrieval
    this.longTermMemory.push({
      content: information,
      timestamp: new Date().toISOString(),
      compressed: false,
      topicGroup,
      subtopic,
      importance,
      accessCount: 0
    });
    
    console.log("Added to long-term memory:", {
      content: information,
      topicGroup,
      subtopic,
      importance
    });
        
    // Track API call for compression metrics
    if (this.compressionEnabled) {
      this.compressionMetadata.totalApiCalls++;
    }
        
    // Auto-save if enabled
    if (this.autoSave && this.persistence && this.sessionId) {
      await this.saveToStorage();
    }
  }

  // Get relevant context for the current conversation - optimized for token usage
  getContextForPrompt() {
    const MAX_MEMORIES = 7; // Slightly increased to accommodate structured topics
    let context = "";
    
    // Add short-term memory (recent conversation) - but only the most recent 3 messages
    if (this.shortTermMemory.length > 0) {
      const recentMessages = this.shortTermMemory.slice(-3); // Only take the last 3 messages
      if (recentMessages.length > 0) {
        context += "Recent conversation:\n";
        recentMessages.forEach(msg => {
          // Limit message length to reduce tokens
          const content = msg.content.length > 100 ? 
            msg.content.substring(0, 97) + '...' : msg.content;
          context += `${msg.role || 'user'}: ${content}\n`;
        });
        context += "\n";
      }
    }
    
    // Add relevant long-term memory using enhanced selection strategy
    if (this.longTermMemory.length > 0) {
      // First try to use topic-based organization if available
      let selectedMemories = this.getTopicBasedMemories(MAX_MEMORIES);
      
      // Fall back to category-based if topic organization isn't available or empty
      if (selectedMemories.length === 0) {
        selectedMemories = this.getCategoryBasedMemories(MAX_MEMORIES);
      }
      
      // Only add the section header if we have memories to show
      if (selectedMemories.length > 0) {
        context += "Memory:\n";
        
        // Format the selected memories by topic groups for better context
        let currentGroup = null;
        
        selectedMemories.forEach(memory => {
          // Extract the topic group if available
          const topicMatch = memory.content.match(/^\[([\w_]+)(?::[^\]]+)?\]/);
          const group = topicMatch ? topicMatch[1] : null;
          
          // Add group header if this is a new group
          if (group && group !== currentGroup) {
            context += `\n## ${group.replace('_', ' ')}:\n`;
            currentGroup = group;
          }
          
          // Truncate long memories
          const content = memory.content.length > 100 ? 
            memory.content.substring(0, 97) + '...' : memory.content;
          
          // Track access for importance scoring
          this.trackMemoryAccess(memory);
          
          context += `• ${content}\n`;
        });
      }
    }
    
    return context;
  }
  
  // Track when a memory is accessed to improve importance scoring
  trackMemoryAccess(memory) {
    if (memory) {
      // Initialize missing properties if needed
      if (memory.accessCount === undefined) memory.accessCount = 0;
      
      // Update access stats
      memory.accessCount += 1;
      memory.lastAccessed = new Date().toISOString();
    }
  }
  
  // Get memories based on topic structure
  getTopicBasedMemories(maxMemories) {
    // Check if we have any topic-organized memories (more flexible check)
    const hasTopicOrganization = this.longTermMemory.some(m => 
      // Check for topic information in properties
      m.topicGroup || 
      // Or check for topic information in content
      m.content.match(/^\[([\w_]+)(?::[^\]]+)?\]/)
    );
    
    if (!hasTopicOrganization) return [];
    
    const selectedMemories = [];
    const topicGroups = ['USER_IDENTITY', 'CHARACTER_IDENTITY', 'RELATIONSHIP', 'CONVERSATION_THREADS'];
    
    // First pass: Get critical identity and relationship information
    // This ensures we always have core context available
    topicGroups.forEach(group => {
      // Get core identity information first - with content pattern fallback
      const coreMemories = this.longTermMemory
        .filter(memory => {
          // Check if we have topicGroup property
          if (memory.topicGroup === group && 
              (memory.subtopic === 'core' || memory.subtopic === 'milestones')) {
            return true;
          }
          
          // Fallback: check content pattern [GROUP:subtopic]
          const topicMatch = memory.content.match(/^\[([\w_]+)(?::([^\]]+))?\]/);
          if (topicMatch && topicMatch[1] === group) {
            // If we have a subtopic, check if it's core or milestones
            if (topicMatch[2]) {
              return topicMatch[2] === 'core' || topicMatch[2] === 'milestones';
            }
            // If no subtopic in pattern, include it (might be important)
            return true;
          }
          
          return false;
        })
        .sort((a, b) => (b.importance || 0.5) - (a.importance || 0.5))
        .slice(0, 1);
      
      if (coreMemories.length > 0) {
        selectedMemories.push(...coreMemories);
      }
    });
    
    // Second pass: Fill remaining slots with most relevant memories
    // based on a combination of importance, recency and access frequency
    if (selectedMemories.length < maxMemories) {
      const remainingSlots = maxMemories - selectedMemories.length;
      
      // Calculate a relevance score for each memory
      const scoredMemories = this.longTermMemory
        .filter(memory => !selectedMemories.includes(memory))
        .map(memory => {
          const importanceScore = memory.importance || 0.5;
          
          // Calculate recency score (1.0 = very recent, 0.0 = old)
          const timestamp = new Date(memory.timestamp).getTime();
          const now = Date.now();
          const ageInDays = (now - timestamp) / (1000 * 60 * 60 * 24);
          const recencyScore = Math.max(0, 1 - (ageInDays / 30)); // 0-30 days scale
          
          // Calculate access frequency score
          const accessCount = memory.accessCount || 0;
          const accessScore = Math.min(1, accessCount / 5); // 0-5 accesses scale
          
          // Combined relevance score (weighted)
          const relevanceScore = (importanceScore * 0.5) + (recencyScore * 0.3) + (accessScore * 0.2);
          
          return { memory, relevanceScore };
        })
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, remainingSlots);
      
      selectedMemories.push(...scoredMemories.map(item => item.memory));
    }
    
    return selectedMemories;
  }
  
  // Get memories based on traditional category organization (backward compatibility)
  getCategoryBasedMemories(maxMemories) {
    const categorizedMemories = this.getGroupedMemoriesByCategory();
    let selectedMemories = [];
    
    // Take just 1 memory from each critical category (more focused)
    const importantCategories = ['PERSONAL', 'BACKGROUND', 'RELATIONSHIPS', 'CONVERSATION', 'OTHER', 'FACTUAL', 'PREFERENCES'];
    importantCategories.forEach(category => {
      if (categorizedMemories[category] && categorizedMemories[category].length > 0) {
        // Just take the first memory from important categories
        selectedMemories.push(categorizedMemories[category][0]);
      }
    });
    
    // If we have room for more memories, add from other categories
    if (selectedMemories.length < maxMemories) {
      // Add most recent memories, prioritizing compressed ones to save tokens
      const compressedMemories = this.longTermMemory
        .filter(memory => memory.compressed && !selectedMemories.includes(memory))
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, maxMemories - selectedMemories.length);
      
      selectedMemories = [...selectedMemories, ...compressedMemories];
      
      // If we still have room, add other recent memories
      if (selectedMemories.length < maxMemories) {
        const recentMemories = this.longTermMemory
          .filter(memory => !memory.compressed && !selectedMemories.includes(memory))
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, maxMemories - selectedMemories.length);
        
        selectedMemories = [...selectedMemories, ...recentMemories];
      }
    }
    
    return selectedMemories;
  }
  
  // Special method: Get ALL memories for prompt (debugging)
  getAllMemoriesForPrompt() {
    let context = "";
    
    // Add short-term memory
    if (this.shortTermMemory.length > 0) {
      context += "Recent conversation:\n";
      this.shortTermMemory.forEach(msg => {
        context += `${msg.role || 'user'}: ${msg.content}\n`;
      });
      context += "\n";
    }
    
    // Add ALL long-term memory for debugging
    if (this.longTermMemory.length > 0) {
      context += "Long-term memory:\n";
      
      // Group by type for better organization
      const groups = {};
      
      // First prioritize USER APPEARANCE information
      let userAppearanceMemories = [];
      let userCoreMemories = [];
      
      this.longTermMemory.forEach(memory => {
        // Extract topic group
        let group = 'Uncategorized';
        let isAppearance = false;
        let isUserCore = false;
        
        if (memory.topicGroup) {
          group = memory.topicGroup;
          if (memory.topicGroup === 'USER_IDENTITY' && memory.subtopic === 'appearance') {
            isAppearance = true;
          } else if (memory.topicGroup === 'USER_IDENTITY' && memory.subtopic === 'core') {
            isUserCore = true;
          }
        } else {
          // Try to extract from content
          const topicMatch = memory.content.match(/^\[([\w_]+)(?::([^\]]+))?\]/);
          if (topicMatch) {
            group = topicMatch[1];
            if (group === 'USER_IDENTITY') {
              if (topicMatch[2] === 'appearance') {
                isAppearance = true;
              } else if (topicMatch[2] === 'core') {
                isUserCore = true;
              }
            }
          } else {
            // Check old category format
            const categoryMatch = memory.content.match(/^\[([A-Z_]+)\]/);
            if (categoryMatch) {
              group = categoryMatch[1];
            }
          }
        }
        
        // Handle special categories separately
        if (isAppearance) {
          userAppearanceMemories.push(memory);
        } else if (isUserCore) {
          userCoreMemories.push(memory);
        } else {
          // For regular memories
          if (!groups[group]) {
            groups[group] = [];
          }
          groups[group].push(memory);
        }
      });
      
      // First add USER CORE INFO - HIGHEST PRIORITY
      if (userCoreMemories.length > 0) {
        context += "\n## USER IDENTITY (MUST REMEMBER):\n";
        
        userCoreMemories.forEach(memory => {
          // Update access count for better future ranking
          if (memory.accessCount !== undefined) {
            memory.accessCount += 1;
            memory.lastAccessed = new Date().toISOString();
          }
          
          context += `• ${memory.content}\n`;
        });
      }
      
      // Then add USER APPEARANCE - HIGHEST PRIORITY
      if (userAppearanceMemories.length > 0) {
        context += "\n## USER APPEARANCE (CRITICAL):\n";
        
        userAppearanceMemories.forEach(memory => {
          // Update access count for better future ranking
          if (memory.accessCount !== undefined) {
            memory.accessCount += 1;
            memory.lastAccessed = new Date().toISOString();
          }
          
          context += `• ${memory.content}\n`;
        });
        
        // Extra reminder about appearance
        context += "\n(IMPORTANT: Always remember and reference the user's appearance details in your responses)\n";
      }
      
      // Add each regular group
      Object.entries(groups).forEach(([group, memories]) => {
        context += `\n## ${group}:\n`;
        
        memories.forEach(memory => {
          // Update access count for better future ranking
          if (memory.accessCount !== undefined) {
            memory.accessCount += 1;
            memory.lastAccessed = new Date().toISOString();
          }
          
          context += `• ${memory.content}\n`;
        });
      });
    }
    
    return context;
  }

  // Group long-term memories by category for better retrieval
  getGroupedMemoriesByCategory() {
    const categories = {
      'PERSONAL': [],
      'PREFERENCES': [],
      'BACKGROUND': [],
      'FACTUAL': [],
      'RELATIONSHIPS': [],
      'CONVERSATION': [],
      'OTHER': []
    };
    
    // Categorize memories
    this.longTermMemory.forEach(memory => {
      const content = memory.content;
      
      // Check for category tags
      const categoryMatch = content.match(/^\[([A-Z_]+)\]/);
      
      if (categoryMatch && categories[categoryMatch[1]]) {
        categories[categoryMatch[1]].push(memory);
      } else if (content.toLowerCase().includes('like') || 
                content.toLowerCase().includes('enjoy') || 
                content.toLowerCase().includes('prefer')) {
        // Infer preferences
        categories['PREFERENCES'].push(memory);
      } else if (content.toLowerCase().includes('name') || 
                content.toLowerCase().includes('age') || 
                content.toLowerCase().includes('childhood')) {
        // Infer personal info
        categories['PERSONAL'].push(memory);
      } else {
        // Default category
        categories['OTHER'].push(memory);
      }
    });
    
    // Filter out empty categories
    return Object.fromEntries(
      Object.entries(categories).filter(([_, items]) => items.length > 0)
    );
  }

  // Clear short-term memory
  clearShortTermMemory() {
    this.shortTermMemory = [];
        
    // Auto-save if enabled
    if (this.autoSave && this.persistence && this.sessionId) {
      this.saveToStorage();
    }
  }

  // Get full memory contents (for debugging)
  getMemoryContents() {
    return {
      shortTerm: [...this.shortTermMemory, ...this.shortTermMemoryDetailled],
      longTerm: this.longTermMemory,
      compressionMetadata: this.compressionMetadata
    };
  }
    
  // Save memory state to storage
  async saveToStorage() {
    if (!this.persistence || !this.sessionId) {
      return { success: false, reason: 'Persistence or session ID not configured' };
    }
    
    try {
      const memoryState = {
        shortTermMemory:  [...this.shortTermMemory, ...this.shortTermMemoryDetailled],
        longTermMemory: this.longTermMemory,
        compressionMetadata: this.compressionMetadata,
        timestamp: new Date().toISOString()
      };
      
      return await this.persistence.saveMemory(this.sessionId, memoryState);
    } catch (error) {
      console.error('Error saving memory state:', error);
      return { success: false, error };
    }
  }
  
  // Load memory state from storage
  async loadFromStorage(sessionId) {
    if (!this.persistence) {
      return { success: false, reason: 'Persistence not configured' };
    }
    
    try {
      const loadedState = await this.persistence.loadMemory(sessionId || this.sessionId);
      
      if (!loadedState) {
        return { success: false, reason: 'No memory state found for this session' };
      }
      
      // Update memory from loaded state
      this.shortTermMemory = loadedState.memoryState.shortTermMemory || [];
      this.longTermMemory = loadedState.memoryState.longTermMemory || [];
  
      // Load compression metadata if available
      if (loadedState.memoryState.compressionMetadata) {
        this.compressionMetadata = loadedState.memoryState.compressionMetadata;
      } 

      this.sessionId = sessionId || this.sessionId;
      
      return { success: true, loadedState };
    } catch (error) {
      console.error('Error loading memory state:', error);
      return { success: false, error };
    }
  }

   // Record memory compression event
   recordCompression(beforeCount, afterCount) {
    this.compressionMetadata.compressionCount++;
    this.compressionMetadata.lastCompressionTime = new Date().toISOString();
    this.compressionMetadata.memoriesBeforeLastCompression = beforeCount;
    this.compressionMetadata.memoriesAfterLastCompression = afterCount;
    this.compressionMetadata.totalApiCalls = 0; // Reset API call counter
    
    // Auto-save if enabled
    if (this.autoSave && this.persistence && this.sessionId) {
      this.saveToStorage();
    }
  }
  
  // Check if memory compression is needed
  shouldCompressMemory() {
    // Compress every 10 API calls if there are enough memories
    return this.compressionEnabled && 
           this.compressionMetadata.totalApiCalls >= 10 && 
           this.longTermMemory.length > 5;
  }
}

class AnthropicChatClient {
  constructor(options = {}) {
    // Support both legacy and options-based initialization
    if (typeof options === 'string') {
      // Legacy: first argument is API key
      this.apiKey = options;
      this.characterProfile = arguments[1] || null;
      options = {};
    } else {
      this.apiKey = options.apiKey || ANTHROPIC_API_KEY;
      this.characterProfile = options.characterProfile || null;
    }
    
    // Set up persistence if provided
    this.persistence = options.persistence || null;
    this.sessionId = options.sessionId || this.generateSessionId();
    
    // Initialize memory system with persistence support
    this.memory = new MemorySystem({
      persistence: this.persistence,
      sessionId: this.sessionId,
      autoSave: options.autoSave !== undefined ? options.autoSave : true,
      shortTermMemoryLimit: options.shortTermMemoryLimit || 10,
      shortTermMemory: options.shortTermMemory || [],
      longTermMemory: options.longTermMemory || [],
      compressionEnabled: options.compressionEnabled !== undefined ? options.compressionEnabled : true
    });
    
    this.model = options.model || "claude-3-7-sonnet-20250219";
    this.temperature = options.temperature || 1.0;
    this.messages = options.messages || [];
    this.apiUrl = API_URL;
    
    // Default system prompt if no character profile is provided
    this.systemPrompt = `You are a helpful AI assistant with access to a 2-layer memory system:
1. Short-term memory: Contains recent conversation history
2. Long-term memory: Contains important facts and information worth remembering long-term

After each user message, you will make TWO separate decisions:
1. Respond normally to the user's query
2. Return a detailled summary of the short-term memory provided to you of which you think are important to remember short term 
3. Decide if any information from this interaction should be stored in long-term memory

For anything that should go to short-term memory, output a JSON object at the end of your response. It looks like this:
{
  "memorize-short-term": "Important fact or context to remember short-term",
  "memorize-long-term": "Important fact or context to remember short-term. Make this more detaillled than the long-term memory, but not longer than 3 sentences",
  "reason-long-term": "Brief explanation of why this is important to remember long-term"
}
`;

    // If character profile is provided, set up character impersonation
    if (this.characterProfile) {
      this.setupCharacterImpersonation(this.characterProfile);
    }
    
    // If provided with messages, restore them
    if (options.messages && options.messages.length > 0) {
      this.messages = [...options.messages];
    }
       
    // Initialize compression tracking
    this.compressionFrequency = options.compressionFrequency || 10;
  }
  
  // Generate a unique session ID
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }
  
  // Save current state (messages, memory, etc.)
  async saveState() {
    if (!this.persistence) {
      return { success: false, reason: 'Persistence not configured' };
    }
    
    try {
      const state = {
        sessionId: this.sessionId,
        messages: this.messages,
        characterProfile: this.characterProfile,
        memoryState: this.memory.getMemoryContents(),
        timestamp: new Date().toISOString()
      };
      
      return await this.persistence.saveMemory(this.sessionId, state);
    } catch (error) {
      console.error('Error saving client state:', error);
      return { success: false, error };
    }
  }
  
  // Load state from storage
  async loadState(sessionId) {
    if (!this.persistence) {
      return { success: false, reason: 'Persistence not configured' };
    }
    
    try {
      const loadedState = await this.persistence.loadMemory(sessionId || this.sessionId);
      
      if (!loadedState) {
        return { success: false, reason: 'No state found for this session' };
      }
      
      // Restore state
      this.sessionId = loadedState.sessionId;
      this.messages = loadedState.messages || [];
      
      // Restore character profile if available
      if (loadedState.characterProfile) {
        this.characterProfile = loadedState.characterProfile;
        this.setupCharacterImpersonation(this.characterProfile);
      }
      
      // Load memory state
      await this.memory.loadFromStorage(this.sessionId);
      
      return { success: true, loadedState };
    } catch (error) {
      console.error('Error loading client state:', error);
      return { success: false, error };
    }
  }
  
  // Set up character impersonation
  setupCharacterImpersonation(profile) {
    // Store the full profile for reference
    this.characterProfile = profile;
    
    // Create a compressed profile with essential traits
    this.compressCharacterProfile(profile);
  }
  
  // Compress character profile to reduce token usage
  compressCharacterProfile(profile) {
    // Extract and compress key elements from the profile
    let compressedProfile = {};
    
    try {
      // Parse profile if it's a string
      const profileObj = typeof profile === 'string' 
        ? JSON.parse(profile) 
        : profile;
      
      // Extract essential traits (prioritize what makes the character unique)
      compressedProfile = {
        core: {
          name: profileObj.name || profileObj.fullName || '',
          role: profileObj.role || profileObj.occupation || '',
          background: this.summarize(profileObj.background || profileObj.history || ''),
          personality: this.extractKeyTraits(profileObj.personality || profileObj.traits || []),
          speech: this.extractSpeechPatterns(profileObj.speech || profileObj.speechPatterns || profileObj.dialogue || ''),
        },
        // Include a small hash of all attributes for reference
        allTraits: this.createTraitFingerprint(profileObj)
      };
      
      // Update system prompt for character impersonation
      this.systemPrompt = `You are roleplaying as ${compressedProfile.core.name}. ${compressedProfile.core.role ? `You are a ${compressedProfile.core.role}.` : ''}
      
Essential character traits:
- Background: ${compressedProfile.core.background}
- Personality: ${compressedProfile.core.personality}
- Speech patterns: ${compressedProfile.core.speech}

IMPORTANT INSTRUCTIONS:
1. Stay completely in character as ${compressedProfile.core.name} at all times
2. Never break character or mention that you are an AI
3. Never take over any action of the user or roleplay partner
4. Respond as if you are this person in a natural conversation
5. Cross-check your response. Make sure you NEVER return actions of the user and you NEVER anticipate the future actions of the user.
6. NEVER return JSON embedded in the response
7. Your 2-layer memory system should reflect what ${compressedProfile.core.name} would remember:
   - Short-term memory: Your recent conversationx
   - Long-term memory: Important personal facts about your life and the user

FOR OUTPUT FORMATTING:
- Use **bold** for emphasis
- Use *italics* for subtle emphasis or thoughts
- Use > for quoting something or someone 

For anything important to remember add this JSON block at the end of your response:
{
  "memorize-long-term": "Important fact or context to remember long-term. At most 2 sentences, preferrably less. Can also be just a few keywords",
  "memorize-short-term": "Important fact or context to remember short-term. Make this more detailled than the long-term memory, but at most 3 sentences"
}`;

      // Store compressed profile in long-term memory 
      this.memory.addToLongTermMemory(`I am ${compressedProfile.core.name}. ${compressedProfile.core.background}`);
      
      // Create an index of key facts for quick retrieval
      this.createCharacterFactIndex(profileObj);
      
    } catch (error) {
      console.error('Error compressing character profile:', error);
      // Fall back to simple character prompt if parsing fails
      this.systemPrompt = `You are roleplaying as the character described in the following profile. Stay in character at all times and never mention that you are an AI assistant:\n\n${profile}`;
    }
  }
  
  // Summarize long text to essential points (reduces tokens)
  summarize(text, maxLength = 300) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    
    // Simple truncation with ellipsis 
    return text.substring(0, maxLength - 3) + '...';
  }
  
  // Extract key personality traits
  extractKeyTraits(traits, maxTraits = 5) {
    if (typeof traits === 'string') {
      // Try to extract traits from a string
      return this.summarize(traits);
    }
    
    if (Array.isArray(traits)) {
      // Select the most important traits (first few)
      return traits.slice(0, maxTraits).join(', ');
    }
    
    return 'adaptable, authentic';
  }
  
  // Extract speech patterns
  extractSpeechPatterns(speech) {
    if (!speech) return 'speaks naturally';
    if (typeof speech === 'string') return this.summarize(speech);
    
    // If it's an object with specific patterns
    if (typeof speech === 'object') {
      const patterns = [];
      if (speech.phrases) patterns.push(`common phrases: ${speech.phrases.slice(0, 3).join(', ')}`);
      if (speech.tone) patterns.push(`tone: ${speech.tone}`);
      if (speech.quirks) patterns.push(`quirks: ${speech.quirks}`);
      
      return patterns.join('; ');
    }
    
    return 'speaks naturally';
  }
  
  // Create a compressed "fingerprint" of all traits for reference
  createTraitFingerprint(profile) {
    // This creates a compact representation of all attributes
    // that can be used to query the full profile when needed
    const allKeys = Object.keys(profile).sort();
    return allKeys.map(key => `${key.substring(0, 3)}:${typeof profile[key] === 'string' ? profile[key].substring(0, 2) : '??'}`).join('|');
  }
  
  // Create an index of character facts for quick retrieval
  createCharacterFactIndex(profile) {
    // Parse the profile and categorize facts by topic
    const factsIndex = {};
    
    // Extract facts from various profile sections
    // This builds semantic categories for fact retrieval
    const addFact = (category, fact) => {
      if (!factsIndex[category]) factsIndex[category] = [];
      factsIndex[category].push(fact);
    };
    
    // Process common profile sections
    if (profile.background) addFact('background', profile.background);
    if (profile.history) addFact('background', profile.history);
    if (profile.childhood) addFact('background', profile.childhood);
    if (profile.family) addFact('relationships', profile.family);
    if (profile.friends) addFact('relationships', profile.friends);
    if (profile.likes) addFact('preferences', profile.likes);
    if (profile.dislikes) addFact('preferences', profile.dislikes);
    if (profile.fears) addFact('psychology', profile.fears);
    if (profile.goals) addFact('motivation', profile.goals);
    if (profile.secrets) addFact('secrets', profile.secrets);
    
    // Add to long-term memory (with categories for retrieval)
    Object.entries(factsIndex).forEach(([category, facts]) => {
      const fact = Array.isArray(facts) ? facts.join('. ') : facts;
      this.memory.addToLongTermMemory(`[${category.toUpperCase()}] ${fact}`);
    });
  }

  // Process user message and get response
  async sendMessage(userMessage) {
    try {
       // If memory compressor doesn't exist, create it
      if (!this.memoryCompressor) {
        this.memoryCompressor = new MemoryCompressor({
          apiKey: this.apiKey,
          model: this.model
        });
      }
      // For the first message, if there's an initial context, include it in the system prompt
      const isFirstMessage = this.messages.length === 0;

      // Add user message to conversation history
      const userMsg = { role: 'user', content: userMessage };
      this.messages.push(userMsg);
      // await this.memory.addToShortTermMemory(userMsg);
      
      // Check if message contains a query that might need character information
      const needsCharacterInfo = this.characterProfile && this.shouldFetchCharacterInfo(userMessage);
      let relevantMemory = '';
      
      if (needsCharacterInfo) {
        // Retrieve relevant character information based on the query
        relevantMemory = await this.fetchRelevantCharacterInfo(userMessage);
      }
      
      // Get context from memory with debugging
      console.log("Memory state before getting context:", JSON.stringify({
        shortTermCount: this.memory.shortTermMemory.length,
        longTermCount: this.memory.longTermMemory.length,
        longTermSample: this.memory.longTermMemory.slice(0, 3).map(m => ({
          content: m.content.substring(0, 50) + "...",
          topicGroup: m.topicGroup,
          subtopic: m.subtopic,
          importance: m.importance
        }))
      }));
      
      // Force include ALL memories for debugging
      const memoryContext = this.memory.getAllMemoriesForPrompt();
      
      // Print full memory context for debugging
      console.log("MEMORY CONTEXT FOR PROMPT:", memoryContext);
      
      // Log what we're including in the prompt
      console.log("Including memory context in prompt:", memoryContext.length > 0);
      
      // Create a more optimized system prompt
      let fullSystemPrompt = this.systemPrompt;
      
      // Always include memory context even if it seems empty - with explicit instructions
      fullSystemPrompt += "\n\nIMPORTANT MEMORY CONTEXT (you must use this information):\n" + (memoryContext || "No memories available yet.") + "\n\nVITAL INSTRUCTIONS ABOUT MEMORY:\n1. You MUST use the memory information above in your responses. It contains important facts about the user and your relationship.\n2. USER APPEARANCE information is CRITICAL - always remember and reference how the user looks, what they wear, and their physical characteristics.\n3. Never contradict or forget information from memory, especially user identity details.\n4. If the user mentions something already in memory, acknowledge that you remember this information.\n5. Treat memory sections marked as CRITICAL or MUST REMEMBER with highest priority.";
      
      
      // Only add character context if relevant to user query
      if (relevantMemory && relevantMemory.length > 0) {
        fullSystemPrompt += "\n\nCharacter context:\n" + relevantMemory;
      }
            
      // Add initial context only for first message if needed
      if (isFirstMessage && this.initialContext) {
        fullSystemPrompt += `\n\nScenario: ${this.initialContext}\n\nAcknowledge this scenario in your response.`;
      }

      // Log a shorter version of the prompt for debugging
      console.log('System prompt length:', fullSystemPrompt.length);
      
      // Request options for Anthropic API with token optimization
      const requestOptions = {
        model: this.model,
        messages: this.messages.slice(-10), // Only use last 10 messages to reduce context
        system: fullSystemPrompt,
        max_tokens: 1024
      };
      
      // Add temperature only if not default to save tokens
      if (this.temperature !== 1.0) {
        requestOptions.temperature = this.temperature;
      }
      
      // Prepare request to Anthropic API
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(requestOptions)
      });

      console.log('Response:', response.status);
      
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      const data = await response.json();
      const assistantResponse = data.content[0].text;
      
      // Add assistant response to conversation history
      const assistantMsg = { role: 'assistant', content: assistantResponse };
      assistantMsg.content=assistantMsg.content.split('}')[0] + '}';

      this.messages.push(assistantMsg);
      await this.memory.addToShortTermMemory(assistantMsg);
      
      // Check if there's memory information to extract
      await this.processMemoryInformation(assistantMsg.content);
            
      // Update compression metrics
      if (this.memory.compressionEnabled) {
        this.memory.compressionMetadata.totalApiCalls++;
      }
      
      // Check if we should compress memory
      if (this.memory.shouldCompressMemory()) {
        // Compress in background to not block the response
        this.compressMemory();
      }
            
      // Save state if persistence is enabled
      if (this.persistence) {
        await this.saveState();
      }

      // Track API call and potentially trigger compression
      await this.memoryCompressor.trackApiCall(this.memory);
      
      // Return the response without the memory JSON part (if present)
      return this.cleanResponse(assistantMsg.content);
    } catch (error) {
      console.log('Error communicating with Anthropic API:', error);
      return `Error: ${error.message}`;
    }
  }
  
  // Add method to manually trigger memory compression
  async compressMemory() {
    if (!this.memoryCompressor) {
      this.memoryCompressor = new MemoryCompressor({
        apiKey: this.apiKey,
        model: this.model
      });
    }
    
    return await this.memoryCompressor.compressLongTermMemory(this.memory);
  };
  
  // Check if query might need character background information
  shouldFetchCharacterInfo(query) {
    // List of triggers that suggest we need character background
    const triggers = [
      'you', 'your', 'yourself', 'background', 'history', 'past', 'childhood',
      'family', 'grow up', 'born', 'live', 'worked', 'studied', 'education',
      'experience', 'tell me about', 'hobby', 'interest', 'like', 'dislike',
      'fear', 'dream', 'goal', 'believe', 'opinion', 'think about', 'feel about',
      // Appearance-related triggers
      'look like', 'appearance', 'how do you look', 'what do you look', 'describe yourself',
      'how tall', 'hair', 'eyes', 'wearing', 'clothes', 'outfit', 'dress', 'physical', 'face'
    ];
    
    const queryLower = query.toLowerCase();
    return triggers.some(trigger => queryLower.includes(trigger));
  }
  
  // Fetch relevant character information based on the query
  async fetchRelevantCharacterInfo(query) {
    // If we don't have a handler for profiles, create one
    if (!this.profileHandler) {
      try {
        // Try to import the handler if available
        const { CharacterProfileHandler } = require('./character-profile-handler');
        this.profileHandler = new CharacterProfileHandler();
      } catch (error) {
        // Simple fallback if import fails
        this.profileHandler = {
          parseProfile: profile => typeof profile === 'string' ? JSON.parse(profile) : profile,
          extractMemoryFacts: profile => {
            const parsed = typeof profile === 'string' ? JSON.parse(profile) : profile;
            const facts = [];
            for (const [key, value] of Object.entries(parsed)) {
              if (typeof value === 'string') {
                facts.push({ category: key, fact: value });
              }
            }
            return facts;
          }
        };
      }
    }
    
    // Make sure we have the parsed profile
    if (!this.parsedProfile && this.characterProfile) {
      try {
        this.parsedProfile = this.profileHandler.parseProfile(this.characterProfile);
      } catch (error) {
        console.error('Error parsing character profile:', error);
        return '';
      }
    }
    
    // Extract the keywords from the query
    const queryLower = query.toLowerCase();
    const queryWords = queryLower
      .replace(/[.,?!;:()]/g, '')
      .split(' ')
      .filter(word => word.length > 3); // Only consider substantive words
    
    // Categories to search for relevant information
    const categories = {
      personal: ['you', 'your', 'yourself', 'who are you', 'tell me about you'],
      background: ['background', 'history', 'past', 'childhood', 'grow up', 'born'],
      family: ['family', 'parent', 'mother', 'father', 'sibling', 'brother', 'sister'],
      education: ['study', 'studied', 'education', 'school', 'college', 'university', 'degree'],
      work: ['work', 'job', 'career', 'profession', 'occupation'],
      preferences: ['like', 'love', 'enjoy', 'prefer', 'favorite'],
      dislikes: ['dislike', 'hate', 'avoid', 'don\'t like'],
      personality: ['personality', 'character', 'trait', 'nature', 'temperament']
    };
    
    // Find which categories match the query
    const matchingCategories = Object.entries(categories)
      .filter(([_, keywords]) => keywords.some(keyword => queryLower.includes(keyword)))
      .map(([category, _]) => category);
    
    // Extract facts from the profile
    let relevantFacts = [];
    if (this.parsedProfile) {
      // If we have matching categories, get facts from those categories
      if (matchingCategories.length > 0) {
        // Extract all facts
        const allFacts = this.profileHandler.extractMemoryFacts(this.parsedProfile);
        
        // Filter facts by matching categories
        relevantFacts = allFacts.filter(fact => 
          matchingCategories.includes(fact.category) || 
          matchingCategories.some(category => fact.category.includes(category))
        );
      }
      
      // If no category matches, look for keyword matches
      if (relevantFacts.length === 0) {
        const allFacts = this.profileHandler.extractMemoryFacts(this.parsedProfile);
        relevantFacts = allFacts.filter(fact => 
          queryWords.some(word => 
            fact.fact.toLowerCase().includes(word)
          )
        );
      }
      
      // If still no matches, include core identity
      if (relevantFacts.length === 0) {
        const coreFacts = this.profileHandler.extractMemoryFacts(this.parsedProfile)
          .filter(fact => fact.category === 'identity' || fact.category === 'background');
        relevantFacts = coreFacts.slice(0, 1); // Just the core identity
      }
    }
    
    // Format the facts for the context
    return relevantFacts
      .map(fact => `[${fact.category.toUpperCase()}] ${fact.fact}`)
      .join('\n\n');
  }
  
  // Extract memory information from response
  async processMemoryInformation(response) {
    try {
      // Look for memory JSON object
      const memory = this.memory.extractLongTermMemory(response);

      if(memory) {
        // Process memory information for proper categorization before adding
        // This prevents memory explosion by properly organizing items
        
        // Extract topic information from content if available
        let topicGroup = null;
        let subtopic = null;
        const topicMatch = memory.match(/^\[([\w_]+)(?::([^\]]+))?\]/);
        
        if (topicMatch) {
          // If memory already has topic formatting, preserve it
          topicGroup = topicMatch[1];
          subtopic = topicMatch[2] || null;
          
          // Add to long-term memory with existing categorization
          await this.memory.addToLongTermMemory(memory);
          console.log(`Added to long-term memory: ${memory}`);
        } else {
          // Auto-categorize if no explicit topic tag
          
          // Check for appearance information (highest priority)
          if (memory.toLowerCase().includes("wear") || 
              memory.toLowerCase().includes("look") || 
              memory.toLowerCase().includes("tall") || 
              memory.toLowerCase().includes("short") || 
              memory.toLowerCase().includes("hair") || 
              memory.toLowerCase().includes("eyes") || 
              memory.toLowerCase().includes("dress") || 
              memory.toLowerCase().includes("shirt") || 
              memory.toLowerCase().includes("clothes") || 
              memory.toLowerCase().includes("style") || 
              memory.toLowerCase().includes("height") || 
              memory.toLowerCase().includes("face") || 
              memory.toLowerCase().includes("physical")) {
            
            // Automatically categorize as user appearance
            const categorizedMemory = `[USER_IDENTITY:appearance] ${memory}`;
            await this.memory.addToLongTermMemory(categorizedMemory);
            console.log(`Added categorized memory: ${categorizedMemory}`);
          }
          // Check for core user identity info
          else if (memory.toLowerCase().includes("name") || 
                  memory.toLowerCase().includes("age") || 
                  memory.toLowerCase().includes("old") || 
                  memory.toLowerCase().includes("from") || 
                  memory.toLowerCase().includes("occupation") || 
                  memory.toLowerCase().includes("work") || 
                  memory.toLowerCase().includes("job") || 
                  memory.toLowerCase().includes("live")) {
            
            const categorizedMemory = `[USER_IDENTITY:core] ${memory}`;
            await this.memory.addToLongTermMemory(categorizedMemory);
            console.log(`Added categorized memory: ${categorizedMemory}`);
          }
          // Check for preferences
          else if (memory.toLowerCase().includes("like") || 
                  memory.toLowerCase().includes("dislike") || 
                  memory.toLowerCase().includes("enjoy") || 
                  memory.toLowerCase().includes("hate") || 
                  memory.toLowerCase().includes("prefer") || 
                  memory.toLowerCase().includes("favorite")) {
            
            const categorizedMemory = `[USER_IDENTITY:preferences] ${memory}`;
            await this.memory.addToLongTermMemory(categorizedMemory);
            console.log(`Added categorized memory: ${categorizedMemory}`);
          }
          // Check for relationship info
          else if (memory.toLowerCase().includes("relationship") || 
                  memory.toLowerCase().includes("together") || 
                  memory.toLowerCase().includes("feel about") || 
                  memory.toLowerCase().includes("feel for") || 
                  memory.toLowerCase().includes("trust")) {
            
            const categorizedMemory = `[RELATIONSHIP:dynamics] ${memory}`;
            await this.memory.addToLongTermMemory(categorizedMemory);
            console.log(`Added categorized memory: ${categorizedMemory}`);
          }
          // Default to conversation thread
          else {
            const categorizedMemory = `[CONVERSATION_THREADS:ongoing] ${memory}`;
            await this.memory.addToLongTermMemory(categorizedMemory);
            console.log(`Added categorized memory: ${categorizedMemory}`);
          }
        }
      }
    } catch (error) {
      console.error('Error processing memory information:', error);
    }
  }
  
  // Make a second call to categorize memory item
  async categorizeMemoryItem(memoryItem) {
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { 
              role: 'user', 
              content: `Please categorize this information for long-term memory storage:
              
              "${memoryItem}"
              
              Respond with a JSON object containing:
              {
                "category": "personal_info|preferences|factual_knowledge|important_context",
                "priority": 1-5 (where 5 is highest priority),
                "expiration": "never|days|weeks|months" (how long this should be remembered)
              }`
            }
          ],
          max_tokens: 250
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Categorization API request failed with status ${response.status}; ${error}`);
      }
      
      const data = await response.json();
      console.log('Memory categorization:', data.content[0].text);
      
      // Here you could further process the categorization to optimize memory
      // For example, set expiration dates, organize memories by category, etc.
      
    } catch (error) {
      console.error('Error categorizing memory:', error);
    }
  }
  
  // Clean response by removing memory JSON
  cleanResponse(response) {
    // Remove any JSON block at the end of the response
    return response.replace(/\s*\{(?:\s*"[^"]+"\s*:\s*"(?:[^"\\]|\\.)*"\s*,?)+\}\s*$/, '').trim();
  }
  
  // Get current memory state
  getMemoryState() {
    return this.memory.getMemoryContents();
  }
  
  // Clear short-term memory but keep long-term memory
  async clearShortTermMemory() {
    await this.memory.clearShortTermMemory();
    this.messages = [];

        
    // Save state if persistence is enabled
    if (this.persistence) {
      await this.saveState();
    }
  }
  
  // Get all available saved sessions
  async getAvailableSessions() {
    if (!this.persistence) {
      return { success: false, reason: 'Persistence not configured' };
    }
    
    try {
      return await this.persistence.listSessions();
    } catch (error) {
      console.error('Error getting available sessions:', error);
      return { success: false, error };
    }
  }
  
  // Delete a saved session
  async deleteSession(sessionId) {
    if (!this.persistence) {
      return { success: false, reason: 'Persistence not configured' };
    }
    
    try {
      return await this.persistence.deleteSession(sessionId);
    } catch (error) {
      console.error('Error deleting session:', error);
      return { success: false, error };
    }
  }

  getCompressionStats() {
    return {
      enabled: this.memory.compressionEnabled,
      apiCallsSinceLastCompression: this.memory.compressionMetadata.totalApiCalls,
      compressionFrequency: this.compressionFrequency || 10,
      lastCompressionTime: this.memory.compressionMetadata.lastCompressionTime,
      memoriesBeforeLastCompression: this.memory.compressionMetadata.memoriesBeforeLastCompression,
      memoriesAfterLastCompression: this.memory.compressionMetadata.memoriesAfterLastCompression,
      compressionCount: this.memory.compressionMetadata.compressionCount,
      isCurrentlyCompressing: false // This would need proper tracking
    };
  }
}

// Example usage
async function runExample() {
  const chatClient = new AnthropicChatClient();
  
  console.log("Welcome to Anthropic Chat Client with 2-Layer Memory!");
  
  // First interaction
  const response1 = await chatClient.sendMessage("Hi, my name is Sarah and I love hiking in the mountains.");
  console.log("AI: " + response1);
  
  // Second interaction
  const response2 = await chatClient.sendMessage("What kind of outdoor activities would you recommend for me?");
  console.log("AI: " + response2);
  
  // Third interaction
  const response3 = await chatClient.sendMessage("I'm planning a trip to Colorado next month.");
  console.log("AI: " + response3);
  
  // Show memory contents
  console.log("\nCurrent Memory State:");
  console.log(JSON.stringify(chatClient.getMemoryState(), null, 2));
}

// Run the example
// runExample();

// For browser usage, create a simple UI
function setupChatUI() {
  // Create chat client
  const chatClient = new AnthropicChatClient();
  
  // Set up event listeners when DOM is loaded
  document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const chatMessages = document.getElementById('chat-messages');
    const clearButton = document.getElementById('clear-button');
    const memoryButton = document.getElementById('memory-button');
    
    // Send message when button is clicked
    sendButton.addEventListener('click', async () => {
      const userMessage = messageInput.value.trim();
      if (userMessage) {
        // Add user message to UI
        appendMessage('user', userMessage);
        messageInput.value = '';
        
        // Get AI response
        const aiResponse = await chatClient.sendMessage(userMessage);
        
        // Add AI response to UI
        appendMessage('assistant', aiResponse);
      }
    });
    
    // Also send on Enter key
    messageInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendButton.click();
      }
    });
    
    // Clear conversation
    clearButton.addEventListener('click', () => {
      chatClient.clearShortTermMemory();
      chatMessages.innerHTML = '';
      appendMessage('system', 'Conversation has been cleared. Long-term memory is preserved.');
    });
    
    // Show memory state
    memoryButton.addEventListener('click', () => {
      const memoryState = chatClient.getMemoryState();
      
      // Format the short-term memory contents for display
      let shortTermText = `
        <strong>Short-Term Memory (${memoryState.shortTerm.length} items):</strong><br>
        ${memoryState.shortTerm.map(msg => `${msg.role || 'user'}: ${msg.content.substring(0, 50)}...`).join('<br>')}
      `;
      
      // Group long-term memories by topic for better visualization
      const groupedMemories = {};
      
      // Process and group memories
      memoryState.longTerm.forEach(memory => {
        let group = 'Uncategorized';
        let displayContent = memory.content;
        
        // Extract topic group if available (new format)
        const topicMatch = memory.content.match(/^\[([\w_]+)(?::[^\]]+)?\]/);
        if (topicMatch) {
          group = topicMatch[1].replace('_', ' ');
        } else {
          // Try old category format
          const categoryMatch = memory.content.match(/^\[([A-Z_]+)\]/);
          if (categoryMatch) {
            group = categoryMatch[1];
          }
        }
        
        // Initialize group if it doesn't exist
        if (!groupedMemories[group]) {
          groupedMemories[group] = [];
        }
        
        // Add importance score and other metadata if available
        let metadataDisplay = '';
        if (memory.importance !== undefined) {
          const importancePercent = Math.round(memory.importance * 100);
          metadataDisplay = `<span class="memory-metadata">[Importance: ${importancePercent}%]</span> `;
        }
        
        // Add access count if available
        if (memory.accessCount !== undefined && memory.accessCount > 0) {
          metadataDisplay += `<span class="memory-metadata">[Accessed: ${memory.accessCount} times]</span> `;
        }
        
        groupedMemories[group].push({
          content: displayContent.substring(0, 80) + (displayContent.length > 80 ? '...' : ''),
          metadata: metadataDisplay,
          timestamp: memory.timestamp,
          importance: memory.importance || 0.5
        });
      });
      
      // Format the long-term memory by groups
      let longTermText = `<strong>Long-Term Memory (${memoryState.longTerm.length} items):</strong><br>`;
      
      // Process each group
      Object.entries(groupedMemories).forEach(([group, memories]) => {
        // Sort memories by importance within each group
        memories.sort((a, b) => b.importance - a.importance);
        
        longTermText += `<div class="memory-group">
          <div class="group-header">${group} (${memories.length} items)</div>
          ${memories.map(mem => 
            `<div class="memory-item">
              ${mem.metadata} ${mem.content}
              <span class="memory-date">${new Date(mem.timestamp).toLocaleString().split(',')[0]}</span>
            </div>`
          ).join('')}
        </div>`;
      });
      
      // Custom CSS for memory display
      const memoryStyles = `
        <style>
          .memory-group { margin-bottom: 1em; border-left: 3px solid #ccc; padding-left: 10px; }
          .group-header { font-weight: bold; margin-bottom: 5px; color: #444; }
          .memory-item { margin-bottom: 4px; font-size: 0.9em; }
          .memory-metadata { color: #777; font-size: 0.8em; }
          .memory-date { color: #999; font-size: 0.8em; margin-left: 5px; }
        </style>
      `;
      
      // Combine short-term and long-term memories with styling
      const memoryText = memoryStyles + shortTermText + '<br><br>' + longTermText;
      
      appendMessage('system', memoryText);
    });
    
    // Helper to add message to UI
    function appendMessage(role, content) {
      const messageDiv = document.createElement('div');
      messageDiv.className = `message ${role}-message`;
      
      // Format system messages as HTML
      if (role === 'system') {
        messageDiv.innerHTML = content;
      } else {
        messageDiv.textContent = content;
      }
      
      chatMessages.appendChild(messageDiv);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Add welcome message
    appendMessage('system', 'Welcome to Anthropic Chat with 2-Layer Memory! Start chatting below.');
  });
}

// Setup UI if we're in a browser environment
if (typeof window !== 'undefined') {
  setupChatUI();
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AnthropicChatClient, MemorySystem, MemoryPersistence };
}
