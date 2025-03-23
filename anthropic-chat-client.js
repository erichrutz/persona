// Anthropic Chat Client with 2-Layer Memory System and Memory Compression
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const API_URL = 'https://api.anthropic.com/v1/messages';
const util = require('util');
const { MemoryPersistence } = require('./memory-persistence');
const { MemoryCompressor } = require('./memory-compressor');
const { flushCompileCache } = require('module');

// Use the same logger from server if available, otherwise create one
let logger;
if (typeof global.logger === 'undefined') {
  const DEBUG = process.env.DEBUG_MODE || 'true';
  logger = {
    info: (message, ...args) => {
      console.log(`[CLIENT-INFO] ${message}`, ...args);
    },
    debug: (message, ...args) => {
      if (DEBUG === 'true') {
        console.log(`[CLIENT-DEBUG] ${message}`, ...args);
      }
    },
    error: (message, err) => {
      console.error(`[CLIENT-ERROR] ${message}`);
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
}
else {
  logger = global.logger;
}

class MemorySystem {
  constructor(options = {}) {
    this.shortTermMemory = options.shortTermMemory || [];
    this.shortTermMemoryDetailled = options.shortTermMemoryDetailled || [];
    this.longTermMemory = options.longTermMemory || [];
    this.deepMemory = options.deepMemory || ''; // New deep memory that's never compressed
    this.shortTermMemoryLimit = options.shortTermMemoryLimit || 7;
    this.shortTermMemoryDetailedLimit = options.shortTermMemoryDetailedLimit || 2;
    this.clothing = options.clothing || {clothing: {user: "unknown", char: "unknown"}};

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
    this.characterName = options.characterName || 'AI Assistant';
  }

  // Add a message to short-term memory
  async addToShortTermMemory(message) {
    const memory = this.extractShortTermMemory(message.content);

    const reducedMemory = message.content.replace(/\{[\s\S]*?\}\s*$/, '').trim();

    if (!memory) {
      this.shortTermMemory.push({ content: reducedMemory.split('{')[0] });
    } else {
      this.shortTermMemory.push({ content: memory });
    }
    this.shortTermMemoryDetailled.push({ content: reducedMemory.split('{')[0] });
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
    const jsonRegex = /"memorize-short-term":\s*"(.*?)"/;
    const jsonMatch = inputString.match(jsonRegex);

    if (!jsonMatch) {
      return inputString;
    }

    try {
      // Parse the JSON string to an object
      const jsonObj = JSON.parse("{" + jsonMatch[0] + "}"); // Add missing curly braces

      // Return the short-term memory if it exists
      return jsonObj["memorize-short-term"] || null;
    } catch (error) {
      logger.error("Error parsing JSON for short-term memory:", error);
      logger.debug("JSON parse failed for input string:", inputString);

      // Alternative approach: direct regex extraction if JSON parsing fails
      const shortTermRegex = /"memorize-short-term"\s*:\s*"([^"]+)"/;
      const shortTermMatch = inputString.match(shortTermRegex);

      return shortTermMatch ? shortTermMatch[1] : null;
    }

  }

  extractLongTermMemory(inputString) {
    // First, find the JSON object within the string
    const jsonRegex = /\{(?:\s*"[^"]+"\s*:\s*"(?:[^"\\]|\\.)*"\s*,?)+\}/;
    const jsonRegex2 = /\{[\s\S]*"memorize-long-term"[\s\S]*"memorize-short-term"[\s\S]*"reason-long-term"[\s\S]*\}/;
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
      return jsonObj || {user: "", char: ""};
    } catch (error) {
      logger.error("Error parsing JSON for long-term memory:", error);
      logger.debug("JSON parse failed for input string:", inputString);

      // Alternative approach: direct regex extraction if JSON parsing fails
      const longTermRegex = /"memorize-long-term"\s*:\s*"([^"]+)"/;
      const longTermMatch = inputString.match(longTermRegex);

      return longTermMatch ? longTermMatch[1] : null;
    }
  }

  extractClothingInformation(inputString) {
    // First, find the JSON object within the string
    const jsonRegex = /"clothing":\s*(\{[^{}]*\})/;
    let jsonMatch = inputString.match(jsonRegex);

    if (!jsonMatch) {
        return null;
    }

    try {
      // Parse the JSON string to an object
      const jsonObj = JSON.parse("{" + jsonMatch[0] + "}"); // Add missing curly braces

      if (jsonObj) {
        this.clothing = jsonObj;
      }
    } catch (error) {
      logger.error("Error parsing JSON for long-term memory:", error);
      logger.debug("JSON parse failed for input string:", inputString);
    }
  }

  // Add information to long-term memory
  async addToLongTermMemory(information, language = 'english') {
    // Extract topic information from content if available
    let topicGroup = null;
    let subtopic = null;
    const topicMatch = information.match(/^\[([\w_]+)(?::([^\]]+))?\]/);

    // Language-specific keywords for auto-categorization
    const keywords = {
      en: {
        appearance: ['wear', 'look', 'tall', 'short', 'hair', 'eyes', 'dress', 'shirt', 'pants', 'clothes', 'style', 'height', 'face', 'physical'],
        identity: ['name', 'age', 'old', 'from', 'occupation', 'work', 'job', 'live'],
        important: ['name', 'birthday', 'significant', 'important'],
        relationship: ['family', 'friend', 'relationship', 'feel'],
        preferences: ['like', 'dislike', 'prefer', 'enjoy']
      },
      de: {
        appearance: ['tragen', 'aussehen', 'groß', 'klein', 'haare', 'augen', 'kleid', 'hemd', 'hose', 'kleidung', 'stil', 'größe', 'gesicht', 'physisch', 'körperlich'],
        identity: ['name', 'alter', 'jahr', 'herkunft', 'beruf', 'arbeit', 'job', 'tätig', 'wohnen', 'leben'],
        important: ['name', 'geburtstag', 'bedeutend', 'wichtig'],
        relationship: ['familie', 'freund', 'beziehung', 'fühlen'],
        preferences: ['mag', 'gefällt', 'liebt', 'bevorzugt', 'genießt']
      }
    };

    // Make sure we have a valid language
    language = (language === 'deutsch') ? 'de' : 'en';
    const kw = keywords[language];

    if (topicMatch) {
      topicGroup = topicMatch[1];
      subtopic = topicMatch[2] || null;
    } else {
      // Auto-categorize if no explicit topic tag
      const infoLower = information.toLowerCase();

      // Check for appearance information (highest priority)
      if (kw.appearance.some(word => infoLower.includes(word))) {
        // Automatically categorize as user appearance
        topicGroup = "CHARACTER_IDENTITY";
        subtopic = "appearance";
        information = `[CHARACTER_IDENTITY:appearance] ${information}`;
      }
      // Check for core user identity info
      else if (kw.identity.some(word => infoLower.includes(word))) {
        topicGroup = "CHARACTER_IDENTITY";
        subtopic = "core";
        information = `[CHARACTER_IDENTITY:core] ${information}`;
      }
    }

    // Calculate importance score
    let importance = 0.5; // Default medium importance
    const infoLower = information.toLowerCase();

    // USER APPEARANCE IS HIGHEST IMPORTANCE
    if ((topicGroup === "CHARACTER_IDENTITY" ||  topicGroup === "USER_IDENTITY") && subtopic === "appearance") {
      importance = 0.9; // Very high importance
    }
    // USER CORE INFO IS HIGH IMPORTANCE
    else if ((topicGroup === "CHARACTER_IDENTITY" ||  topicGroup === "USER_IDENTITY") && subtopic === "core") {
      importance = 0.8; // High importance
    }
    // Other importance calculations
    else {
      // Increase score for likely important content
      if (kw.important.some(word => infoLower.includes(word))) {
        importance += 0.2;
      }

      // Relationship indicators increase importance
      if (kw.relationship.some(word => infoLower.includes(word))) {
        importance += 0.2;
      }

      // Personal preferences are moderately important
      if (kw.preferences.some(word => infoLower.includes(word))) {
        importance += 0.1;
      }

      // Appearance info is always high importance
      if (kw.appearance.some(word => infoLower.includes(word))) {
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
      accessCount: 0,
      language // Track the language of the memory
    });

    logger.debug(`Added to long-term memory (${language}):`, {
      content: information,
      topicGroup,
      subtopic,
      importance,
      language
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

    // Add deep memory first as it's the most important
    if (this.deepMemory && this.deepMemory.trim() !== '') {
      context += "DEEP MEMORY (CRITICAL INFORMATION):\n";
      context += this.deepMemory;
      context += "\n\n";
    }

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

    // Add deep memory with special emphasis
    if (this.deepMemory && this.deepMemory.trim() !== '') {
      context += "DEEP MEMORY (CRITICAL INFORMATION - NEVER FORGET):\n";
      context += this.deepMemory;
      context += "\n\n(IMPORTANT: The information above is critical and must always be respected in your responses)\n\n";
    }

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
          if ((memory.topicGroup === 'USER_IDENTITY' || memory.topicGroup === 'CHARACTER_IDENTITY') && memory.subtopic === 'appearance') {
            isAppearance = true;
          } else if ((memory.topicGroup === 'USER_IDENTITY' || memory.topicGroup === 'CHARACTER_IDENTITY') && memory.subtopic === 'core') {
            isUserCore = true;
          }
        } else {
          // Try to extract from content
          const topicMatch = memory.content.match(/^\[([\w_]+)(?::([^\]]+))?\]/);
          if (topicMatch) {
            group = topicMatch[1];
            if (group === 'USER_IDENTITY' || group === 'CHARACTER_IDENTIY') {
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

  // Add or update deep memory
  setDeepMemory(content) {
    this.deepMemory = content;

    // Auto-save if enabled
    if (this.autoSave && this.persistence && this.sessionId) {
      this.saveToStorage();
    }

    return { success: true };
  }

  // Get deep memory content
  getDeepMemory() {
    return this.deepMemory;
  }

  // Get full memory contents (for debugging)
  getMemoryContents() {
    return {
      shortTerm: [...this.shortTermMemory, ...this.shortTermMemoryDetailled],
      longTerm: this.longTermMemory,
      deepMemory: this.deepMemory,
      compressionMetadata: this.compressionMetadata,
      clothing: this.clothing?.clothing 
    };
  }

  // Save memory state to storage
  async saveToStorage() {
    if (!this.persistence || !this.sessionId) {
      return { success: false, reason: 'Persistence or session ID not configured' };
    }

    try {
      const memoryState = {
        shortTermMemory: [...this.shortTermMemory, ...this.shortTermMemoryDetailled],
        longTermMemory: this.longTermMemory,
        deepMemory: this.deepMemory,
        compressionMetadata: this.compressionMetadata,
        timestamp: new Date().toISOString(),
        clothing: this.clothing
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
      this.deepMemory = loadedState.memoryState.deepMemory || '';

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

    // Set language (default to English if not specified)
    this.language = options.language || 'english';

    this.characterName = options.characterName || 'AI Assistant';

    // Initialize memory system with persistence support
    this.memory = new MemorySystem({
      persistence: this.persistence,
      sessionId: this.sessionId,
      autoSave: options.autoSave !== undefined ? options.autoSave : true,
      shortTermMemoryLimit: options.shortTermMemoryLimit || 10,
      shortTermMemory: options.shortTermMemory || [],
      longTermMemory: options.longTermMemory || [],
      deepMemory: options.deepMemory || '',
      compressionEnabled: options.compressionEnabled !== undefined ? options.compressionEnabled : true,
      characterName: this.characterName
    });

    this.model = options.model || "claude-3-7-sonnet-20250219";
    this.temperature = options.temperature || 1.0;
    this.messages = options.messages || [];
    this.apiUrl = API_URL;


    // Default system prompt if no character profile is provided
    this.systemPrompt = `You are a helpful AI assistant with access to a 2-layer memory system:
1. Short-term memory: Contains recent conversation history
2. Long-term memory: Contains important facts and information worth remembering long-term. At most 2 short sentences

IMPORTANT: Always respond in ${this.language} language.

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
        timestamp: new Date().toISOString(),
        clothing: this.memory.clothing
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
      this.clothing = loadedState.clothing || {user: "", char: ""};

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

      this.name = compressedProfile.core.name;

      // Update system prompt for character impersonation
      this.systemPrompt = `You are roleplaying as ${compressedProfile.core.name}. ${compressedProfile.core.role ? `You are a ${compressedProfile.core.role}.` : ''}

IMPORTANT: Always respond in ${this.language} language.

## Personas
'Character' is the person impersonated by the AI in this case ${this.characterName}
'User' is the impersonation played by the human chat user
      
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
   - Short-term memory: Summary derived from the CURRENT response about user and character. At most 2 short sentences
   - Long-term memory: NEW important key facts derived from the CURRENT response about user and character. At most 2 short sentences

FOR OUTPUT FORMATTING:
- Use **bold** for emphasis
- Use *italics* for subtle emphasis or thoughts
- Use > for quoting something or someone 

For anything important to remember add this JSON block at the end of your response:
{
  "memorize-long-term": {
    "char": "NEW important key facts derived from the CURRENT response about ${compressedProfile.core.name}. At most 2 short sentences and 30 words",
    "user": "NEW important key facts derived from the CURRENT response about the user. At most 2 short sentences and 30 words"
  },
  "memorize-short-term": "Summary derived from the CURRENT response about user and character. At most 2 short sentences",
  "clothing": {
    "char": "${compressedProfile.core.name} 's current clothing. If not specified, generate a best estimate",
    "user": "User's clothing if known. If not specified, generate a best estimate"
  }
}
`;

/*
{
  "memorize-long-term":{"char": "Important facts about ${compressedProfile.core.name} in a minimized format", "user": "Important facts about the user, from user point of view in a minimized format" },
  "memorize-short-term": "Important fact or context to remember short-term. Make this more detailled than the long-term memory, but at most 3 sentences",
  "clothing:" {"char:" "What clothes is ${compressedProfile.core.name} wearing? If unknown, generate best estimate. Not subjunctive", "user": "What clothes is user wearing"}
}
  */

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
          model: this.model,
          characterName: this.characterName,
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
      logger.debug("MEMORY CONTEXT FOR PROMPT:", memoryContext);

      // Log what we're including in the prompt
      logger.debug("Including memory context in prompt:", memoryContext.length > 0);

      // Create a more optimized system prompt
      let fullSystemPrompt = this.systemPrompt;

      if (this.memory.clothing) {
        fullSystemPrompt += `LAST KNOWN CLOTHING - may change due to scenario; use this a reference:
        - ${this.characterName}: "${this.memory.clothing.clothing.char}"
        - user: "${this.memory.clothing.clothing.user}"`;      
      }

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
      logger.debug('System prompt length:', fullSystemPrompt.length);

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

      logger.debug('API Response status:', response.status);

      if (!response.ok) {
        // Get the response body if possible for better error logging
        let responseBody;
        try {
          responseBody = await response.text();
          logger.error('API Response error body:', responseBody);
        } catch (bodyError) {
          logger.error('Could not read API error response body:', bodyError);
        }

        throw new Error(`API request failed with status ${response.status}: ${responseBody || 'No response body'}`);
      }

      let data;
      try {
        data = await response.json();
        if (!data || !data.content || !data.content[0] || !data.content[0].text) {
          throw new Error('Invalid API response format');
        }
      } catch (parseError) {
        logger.error('Failed to parse API response JSON:', parseError);
        // Get the raw response text for debugging
        let responseText = '';
        try {
          // Need to clone the response since we already attempted to read it as JSON
          const responseClone = response.clone();
          responseText = await responseClone.text();
          logger.debug('Raw API response text:', responseText.substring(0, 1000) + '...');
        } catch (textError) {
          logger.error('Failed to read raw response text:', textError);
        }
        throw new Error(`Failed to parse API response: ${parseError.message}`);
      }

      const assistantResponse = data.content[0].text;

      // Add assistant response to conversation history
      const assistantMsg = { role: 'assistant', content: assistantResponse };
      /*
      // Safely extract JSON if present
      try {
        // Only split if a '}' exists in the string
        if (assistantMsg.content.includes('}')) {
          assistantMsg.content = assistantMsg.content.split('}')[0] + '}';
        }
      } catch (splitError) {
        logger.error('Error processing response content:', splitError);
        logger.debug('Content that caused the error:', assistantResponse);
      }
        */

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
      logger.error('Error communicating with Anthropic API:', error);

      // Return more detailed error information
      if (error.response) {
        return `API Error (${error.response.status}): ${error.message}`;
      } else if (error.request) {
        return `Network Error: Request failed to reach the API - ${error.message}`;
      } else {
        return `Error: ${error.message}`;
      }
    }
  }

  // Add method to manually trigger memory compression
  async compressMemory() {
    if (!this.memoryCompressor) {
      this.memoryCompressor = new MemoryCompressor({
        apiKey: this.apiKey,
        model: this.model,
        characterName: this.characterName
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

      if (memory) {
        logger.debug('Processing memory information from response:', { memory });

        // Process memory information for proper categorization before adding
        // This prevents memory explosion by properly organizing items

        // Extract topic information from content if available
        await this.categorizeLongTermMemory(memory["char"], "CHARACTER");
        await this.categorizeLongTermMemory(memory["user"], "USER");

        this.memory.extractClothingInformation(response);

      } else {
        logger.debug('No memory information found in response');
      }
    } catch (error) {
      logger.error('Error processing memory information:', error);
      logger.debug('Response that caused the error:', response);
    }
  }

  async categorizeLongTermMemory(memory, type) {
    let topicGroup = null;
    let subtopic = null;
    const topicMatch = memory.match(/^\[([\w_]+)(?::([^\]]+))?\]/);

    // Language-specific keywords for auto-categorization
    const keywords = {
      en: {
        appearance: [
          'wear', 'wearing', 'looks', 'look', 'appearance', 'tall', 'short', 'hair', 'hairstyle',
          'eyes', 'dress', 'shirt', 'pants', 'clothes', 'clothing', 'style', 'fashion', 'height',
          'face', 'facial', 'physical', 'body', 'build', 'complexion', 'skin', 'makeup', 'glasses',
          'attire', 'outfit', 'beard', 'mustache', 'features', 'attractive', 'handsome', 'pretty',
          'beautiful', 'tattoo', 'piercing', 'scar', 'weight', 'thin', 'fat', 'slender', 'athletic'
        ],
        identity: [
          'name', 'called', 'age', 'old', 'young', 'from', 'origin', 'nationality', 'birthplace',
          'occupation', 'work', 'job', 'profession', 'career', 'live', 'lives', 'living', 'address',
          'residence', 'hometown', 'background', 'education', 'degree', 'graduated', 'studied',
          'identity', 'gender', 'pronouns', 'ethnicity', 'race', 'cultural', 'religion', 'beliefs',
          'politics', 'values', 'personality', 'character', 'introvert', 'extrovert', 'citizen',
          'born', 'heritage', 'expertise', 'skills', 'talents', 'languages', 'speaks'
        ],
        preferences: [
          'like', 'likes', 'liked', 'dislike', 'dislikes', 'disliked', 'enjoy', 'enjoys', 'enjoyed',
          'hate', 'hates', 'hated', 'prefer', 'prefers', 'preferred', 'favorite', 'favorites',
          'love', 'loves', 'loved', 'adore', 'adores', 'adored', 'passion', 'passionate', 'hobby',
          'hobbies', 'interest', 'interests', 'fond', 'appreciate', 'appreciates', 'pleasure',
          'desire', 'wants', 'wanted', 'need', 'needs', 'wish', 'wishes', 'dream', 'dreams',
          'taste', 'tastes', 'opinion', 'opinions', 'view', 'views', 'stance', 'attitude', 'choice',
          'genre', 'music', 'movie', 'book', 'food', 'dish', 'cuisine', 'sport', 'activity'
        ],
        relationship: [
          'relationship', 'relationships', 'together', 'feel about', 'feel for', 'feelings for',
          'trust', 'trusts', 'trusted', 'love', 'loves', 'loved', 'dating', 'date', 'dates',
          'married', 'marriage', 'spouse', 'partner', 'girlfriend', 'boyfriend', 'wife', 'husband',
          'fiancé', 'fiancée', 'engaged', 'engagement', 'ex', 'divorced', 'separated', 'widow',
          'widower', 'family', 'families', 'relative', 'relatives', 'parent', 'parents', 'mother',
          'father', 'sister', 'brother', 'sibling', 'siblings', 'child', 'children', 'son', 'daughter',
          'cousin', 'aunt', 'uncle', 'niece', 'nephew', 'grandparent', 'grandmother', 'grandfather',
          'friend', 'friends', 'friendship', 'colleague', 'coworker', 'acquaintance', 'companion',
          'roommate', 'connection', 'bond', 'affection', 'intimate', 'intimacy', 'close', 'closeness',
          'distance', 'distant', 'conflict', 'argument', 'tension', 'supportive', 'support'
        ]
      },
      de: {
        appearance: [
          'tragen', 'trägt', 'aussehen', 'aussieht', 'erscheinung', 'groß', 'klein', 'haare', 'frisur',
          'augen', 'kleid', 'hemd', 'hose', 'kleidung', 'stil', 'mode', 'größe', 'gesicht', 'gesichts',
          'physisch', 'körperlich', 'körper', 'statur', 'teint', 'haut', 'schminke', 'make-up', 'brille',
          'outfit', 'bart', 'schnurrbart', 'merkmale', 'eigenschaften', 'attraktiv', 'hübsch', 'schön',
          'gutaussehend', 'tätowierung', 'piercing', 'narbe', 'gewicht', 'dünn', 'dick', 'schlank', 'athletisch'
        ],
        identity: [
          'name', 'heißt', 'genannt', 'alter', 'jung', 'alt', 'jahr', 'jahre', 'herkunft', 'nationalität',
          'geburtsort', 'beruf', 'arbeit', 'job', 'profession', 'karriere', 'wohnen', 'wohnt', 'lebt', 'leben',
          'adresse', 'wohnort', 'heimatstadt', 'hintergrund', 'ausbildung', 'studium', 'abschluss', 'studiert',
          'identität', 'geschlecht', 'pronomen', 'ethnizität', 'rasse', 'kulturell', 'religion', 'glaube',
          'politik', 'werte', 'persönlichkeit', 'charakter', 'introvertiert', 'extrovertiert', 'bürger',
          'geboren', 'erbe', 'fachwissen', 'fähigkeiten', 'talente', 'sprachen', 'spricht'
        ],
        preferences: [
          'mag', 'mögen', 'gefällt', 'gefallen', 'genießt', 'genießen', 'hasst', 'hassen', 'bevorzugt',
          'bevorzugen', 'lieblings', 'liebt', 'lieben', 'anbetet', 'anbeten', 'leidenschaft', 'leidenschaftlich',
          'hobby', 'hobbys', 'interesse', 'interessen', 'schätzt', 'schätzen', 'vergnügen', 'wunsch', 'will',
          'wollen', 'wollte', 'braucht', 'brauchen', 'wünscht', 'wünschen', 'traum', 'träume', 'geschmack',
          'meinung', 'meinungen', 'ansicht', 'ansichten', 'haltung', 'einstellung', 'wahl', 'auswahl',
          'genre', 'musik', 'film', 'buch', 'essen', 'gericht', 'küche', 'sport', 'aktivität'
        ],
        relationship: [
          'beziehung', 'beziehungen', 'zusammen', 'fühlt für', 'fühlt über', 'gefühle für', 'vertrauen',
          'vertraut', 'liebe', 'liebt', 'dating', 'date', 'dates', 'verheiratet', 'ehe', 'ehepartner',
          'partner', 'partnerin', 'freundin', 'freund', 'ehefrau', 'ehemann', 'verlobt', 'verlobung',
          'verlobte', 'verlobter', 'ex', 'geschieden', 'getrennt', 'witwe', 'witwer', 'familie', 'familien',
          'verwandte', 'verwandter', 'eltern', 'elternteil', 'mutter', 'vater', 'schwester', 'bruder',
          'geschwister', 'kind', 'kinder', 'sohn', 'tochter', 'cousin', 'cousine', 'tante', 'onkel', 'nichte',
          'neffe', 'großeltern', 'großmutter', 'oma', 'großvater', 'opa', 'freund', 'freundin', 'freundschaft',
          'kollege', 'kollegin', 'mitarbeiter', 'bekannte', 'begleiter', 'mitbewohner', 'verbindung',
          'bindung', 'zuneigung', 'intim', 'intimität', 'nah', 'nähe', 'distanz', 'distanziert',
          'konflikt', 'streit', 'spannung', 'unterstützend', 'unterstützung'
        ]
      }
    };

    // Make sure we have a valid language
    const language = (this.language === 'deutsch') ? 'de' : 'en';
    const kw = keywords[language];

    if (topicMatch) {
      // If memory already has topic formatting, preserve it
      topicGroup = topicMatch[1];
      subtopic = topicMatch[2] || null;

      // Add to long-term memory with existing categorization
      await this.memory.addToLongTermMemory(memory, language);
      logger.debug(`Added to long-term memory with existing topic formatting: ${memory}`);
    } else {
      // Auto-categorize if no explicit topic tag
      const memoryLower = memory.toLowerCase();

      // Check for appearance information (highest priority)
      if (kw.appearance.some(word => memoryLower.includes(word))) {
        // Automatically categorize as user appearance
        const categorizedMemory = `[${type}_IDENTITY:appearance] ${memory}`;
        await this.memory.addToLongTermMemory(categorizedMemory, language);
        logger.debug(`Added categorized memory (appearance): ${categorizedMemory}`);
      }

      // Check for core user identity info
      else if (kw.identity.some(word => memoryLower.includes(word))) {
        const categorizedMemory = `[${type}_IDENTITY:core] ${memory}`;
        await this.memory.addToLongTermMemory(categorizedMemory, language);
        logger.debug(`Added categorized memory (core identity): ${categorizedMemory}`);
      }

      // Check for preferences
      else if (kw.preferences.some(word => memoryLower.includes(word))) {
        const categorizedMemory = `[${type}_IDENTITY:preferences] ${memory}`;
        await this.memory.addToLongTermMemory(categorizedMemory, language);
        logger.debug(`Added categorized memory (preferences): ${categorizedMemory}`);
      }

      // Check for relationship info
      else if (kw.relationship.some(word => memoryLower.includes(word))) {
        const categorizedMemory = `[RELATIONSHIP:dynamics] ${memory}`;
        await this.memory.addToLongTermMemory(categorizedMemory, language);
        logger.debug(`Added categorized memory (relationship): ${categorizedMemory}`);
      }

      // Default to conversation thread
      else {
        const categorizedMemory = `[CONVERSATION_THREADS:ongoing] ${memory}`;
        await this.memory.addToLongTermMemory(categorizedMemory, language);
        logger.debug(`Added categorized memory (conversation): ${categorizedMemory}`);
      }
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
      logger.debug('Memory categorization:', data.content[0].text);

      // Here you could further process the categorization to optimize memory
      // For example, set expiration dates, organize memories by category, etc.

    } catch (error) {
      logger.error('Error categorizing memory:', error);
    }
  }

  // Clean response by removing memory JSON
  cleanResponse(response) {
    // Remove any JSON block at the end of the response
    return response.replace(/\{[\s\S]*?\}\s*$/, '').trim();
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

  // Set deep memory
  async setDeepMemory(content) {
    const result = this.memory.setDeepMemory(content);

    // Save state if persistence is enabled
    if (this.persistence) {
      await this.saveState();
    }

    return result;
  }

  // Get deep memory
  getDeepMemory() {
    return this.memory.getDeepMemory();
  }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AnthropicChatClient, MemorySystem, MemoryPersistence };
}
