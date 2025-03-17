// Memory Compression Extension for Anthropic Chat Client
// This module extends the existing memory system to periodically compress long-term memories
const util = require('util');

// Use the same logger from server if available, otherwise create one
let logger;
if (typeof global.logger === 'undefined') {
  const DEBUG = process.env.DEBUG_MODE || 'true';
  logger = {
    info: (message, ...args) => {
      console.log(`[COMPRESSOR-INFO] ${message}`, ...args);
    },
    debug: (message, ...args) => {
      if (DEBUG === 'true') {
        console.log(`[COMPRESSOR-DEBUG] ${message}`, ...args);
      }
    },
    error: (message, err) => {
      console.error(`[COMPRESSOR-ERROR] ${message}`);
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

class MemoryCompressor {
  constructor(options = {}) {
    this.apiKey = options.apiKey || null;
    this.apiUrl = options.apiUrl || 'https://api.anthropic.com/v1/messages';
    this.model = options.model || "claude-3-7-sonnet-20250219";
    this.compressionFrequency = options.compressionFrequency || 10; // API calls before compression
    this.compressionRatio = options.compressionRatio || 0.6; // Target size after compression
    this.apiCallCount = 0;
    this.lastCompressionTime = new Date();
    this.isCompressing = false;
    this.characterName = options.characterName || 'AI Assistant';

    // Enhanced memory organization structure
    this.topicGroups = {
      'USER_IDENTITY': { 
        'core': [], 
        'background': [], 
        'preferences': [] 
      },
      'CHARACTER_IDENTITY': { 
        'core': [], 
        'background': [], 
        'traits': [] 
      },
      'RELATIONSHIP': { 
        'milestones': [], 
        'dynamics': [], 
        'shared_interests': [] 
      },
      'CONVERSATION_THREADS': { 
        'ongoing': [], 
        'recurring_topics': [], 
        'resolved': [] 
      }
    };

    // Backward compatibility
    this.categories = {
      'PERSONAL': [],
      'PREFERENCES': [],
      'BACKGROUND': [],
      'FACTUAL': [],
      'RELATIONSHIPS': [],
      'CONVERSATION': [],
      'OTHER': []
    };

  }

  // Track API calls and trigger compression when needed
  async trackApiCall(memorySystem) {
    this.apiCallCount++;
    
    // Check if we need to compress based on call count
    if (this.apiCallCount >= this.compressionFrequency) {
      // Reset counter
      this.apiCallCount = 0;
      
      // Only compress if there are enough items to make it worthwhile
      if (memorySystem.longTermMemory.length > 5) {
        return await this.compressLongTermMemory(memorySystem);
      }
    }
    
    return { compressed: false };
  }

  // Compress long-term memory to save tokens
  async compressLongTermMemory(memorySystem) {
    // Prevent concurrent compression operations
    if (this.isCompressing) {
      return { compressed: false, reason: 'Compression already in progress' };
    }
    
    this.isCompressing = true;
    logger.info('Starting memory compression process...');
    logger.debug('Memory count before compression:', memorySystem.longTermMemory.length);
    
    try {
      // Skip if there's not enough to compress
      if (memorySystem.longTermMemory.length <= 8) {
        logger.info('Not enough long-term memories to compress');
        this.isCompressing = false;
        return { compressed: false, reason: 'Not enough memories' };
      }

      const compressedText = await this.requestSimplifiedMemoryCompression(memorySystem.longTermMemory);

      /*
      
      // Group memories by category if possible
      const categorizedMemories = this.categorizeLongTermMemory(memorySystem.longTermMemory);
      const compressedMemories = [];
      
      // Process each category separately for better context-aware compression
      for (const [category, memories] of Object.entries(categorizedMemories)) {
        // Skip small categories
        if (memories.length <= 2) {
          // Keep individual memories for small categories
          memories.forEach(memory => compressedMemories.push(memory));
          continue;
        }
        
        // Prepare input for the compression request
        const memoriesText = memories
          .map((memory, index) => `${index + 1}. ${memory.content}`)
          .join('\n\n');
        
        // Make the compression request
        const compressedText = await this.requestMemoryCompression(
          memoriesText,
          category,
          Math.max(1, Math.ceil(memories.length * this.compressionRatio))
        );

        */
        const compressedMemories = [];
        if (compressedText) {
          // Process the compressed results
          this.processSimplifiedCompressedResults(compressedText, compressedMemories);
        } else {
          // If compression failed, keep original memories
          memories.forEach(memory => compressedMemories.push(memory));
        }
      //}
      
      // Update memory system with compressed memories
      memorySystem.longTermMemory = compressedMemories;
      
      // Update timestamps
      this.lastCompressionTime = new Date();
      
      logger.info(`Compressed long-term memory from ${memorySystem.longTermMemory.length} to ${compressedMemories.length} items`);
      logger.debug(`Compression ratio: ${(compressedMemories.length / memorySystem.longTermMemory.length * 100).toFixed(2)}%`);
      
      this.isCompressing = false;
      return { 
        compressed: true, 
        originalCount: memorySystem.longTermMemory.length,
        compressedCount: compressedMemories.length
      };
    } catch (error) {
      logger.error('Error compressing long-term memory:', error);
      this.isCompressing = false;
      return { compressed: false, error: error.message };
    }
  }

  // Categorize memories for more effective compression
  categorizeLongTermMemory(memories) {
    const categories = this.categories;
    
    // Check for category labels in memory content
    memories.forEach(memory => {
      const content = memory.content;
      
      // Look for category markers [CATEGORY] at the beginning of content
      const categoryMatch = content.match(/^\[([A-Z_]+)\]/);
      
      if (categoryMatch) {// if (categoryMatch && categories[categoryMatch[1]]) {
        // If found a valid category
        if (!Object.keys(categories).includes(categoryMatch[1])) {
          categories[categoryMatch[1]] = [];
        }
        categories[categoryMatch[1]].push(memory);
      } else if (content.toLowerCase().includes('like') || 
                content.toLowerCase().includes('enjoy') || 
                content.toLowerCase().includes('prefer')) {
        // Infer preferences category
        categories['PREFERENCES'].push(memory);
      } else if (content.toLowerCase().includes('name') || 
                content.toLowerCase().includes('born') || 
                content.toLowerCase().includes('grew up')) {
        // Infer background info
        categories['BACKGROUND'].push(memory);
      } else if (content.toLowerCase().includes('friend') || 
                content.toLowerCase().includes('family') || 
                content.toLowerCase().includes('relationship')) {
        // Infer relationships
        categories['RELATIONSHIPS'].push(memory);
      } else if (content.includes('you mentioned') || 
                content.includes('you said') || 
                content.includes('we discussed')) {
        // Conversation history
        categories['CONVERSATION'].push(memory);
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

  // Make API request to compress memories
  async requestMemoryCompression(memoriesText, category, targetCount) {
    if (!this.apiKey) {
      console.error('API key is required for memory compression');
      return null;
    }
    
    try {
      // Create prompt for memory compression
      const prompt = `You are an AI memory optimization system. Your task is to compress the following ${category} memories into a more compact form while preserving as much meaningful information as possible.

Please merge redundant information, summarize extensive details, and create ${targetCount} consolidated memory items. Each memory should be prefixed with [${category}] and should be detailed enough to be useful later.

MEMORIES TO COMPRESS:
${memoriesText}

INSTRUCTIONS:
1. Merge similar or related information into coherent memories
2. Preserve specific details, names, dates, and preferences
3. Format each memory as "[${category}] Memory content"
4. Provide exactly ${targetCount} compressed memories
5. Ensure no critical information is lost

COMPRESSED MEMORIES:`;
      
      // Make API request
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1024
        })
      });
      
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      const data = await response.json();
      return data.content[0].text.trim();
    } catch (error) {
      logger.error('Error in memory compression request:', error);
      // Log detailed API error information
      if (error.response) {
        logger.error('API response error details:', {
          status: error.response.status,
          headers: error.response.headers,
          data: error.response.data
        });
      }
      return null;
    }
  }

  // Make API request to compress memories
  async requestSimplifiedMemoryCompression(memoriesText) {
      if (!this.apiKey) {
        console.error('API key is required for memory compression');
        return null;
      }
      
      try {
        // Create prompt for memory compression with new topic structure
        const prompt = `You are an AI memory optimization system designed for relationship-oriented chat. Your task is to organize and compress memories, preserving critical relationship context and identity information.

  TOPIC STRUCTURE:
  The following structure organizes memories into topic groups and subtopics:
  
  1. USER_IDENTITY - Information about the human user (HIGHEST PRIORITY, NEVER LOSE THIS INFO)
     - core: Essential identity information (name, age, location, occupation)
     - appearance: Physical appearance, clothing, style, and visual characteristics
     - background: Historical information about the user
     - preferences: What the user likes and dislikes
  
  2. CHARACTER_IDENTITY - Information about ${this.characterName}'s identity 
     - core: Essential identity facts
     - appearance: ${this.characterName}'s physical appearance and presentation
     - background: ${this.characterName}'s history and background
     - traits: ${this.characterName}'s personality traits
  
  3. RELATIONSHIP - Information about the relationship between user and ${this.characterName}
     - milestones: Key moments or turning points in the relationship
     - dynamics: How the user and ${this.characterName} interact
     - shared_interests: Topics or activities both enjoy
  
  4. CONVERSATION_THREADS - Information about ongoing conversation themes
     - ongoing: Currently active topics
     - recurring_topics: Topics that come up repeatedly 
     - resolved: Past topics that reached closure
  
  MEMORIES TO COMPRESS:
  ${JSON.stringify(memoriesText)}
  
  COMPRESSION GUIDELINES:
  1. USER INFORMATION IS HIGHEST PRIORITY - Preserve ALL details about the human user, especially physical appearance, clothing, personal attributes
  2. Analyze each memory and assign it to the MOST appropriate topic group and subtopic
  3. Format memories as "[TOPIC_GROUP:subtopic] summarized memory content"
  4. USER APPEARANCE: All details about how the user looks MUST go in [USER_IDENTITY:appearance] - NEVER lose this information
  5. CRITICAL: Preserve exact details about names, dates, physical descriptions, clothing, emotional context
  7. Merge redundant information while maintaining specificity
  8. Identify and elevate important relationship milestones
  9. Preserve the exact wording of preferences, likes, dislikes, and personal facts
  10. For recurring topics, note the pattern rather than individual instances
  11. For relationship development, include specifics about how feelings or trust evolved
  
  EXAMPLE COMPRESSED FORMATS:
  [USER_IDENTITY:core] Name: John Smith (34), lives in Seattle, software engineer
  [USER_IDENTITY:appearance] Tall with brown hair, blue eyes. Often wears jeans and button-up shirts. Has a small scar on left cheek.
  [USER_IDENTITY:preferences] Coffee: black, no sugar. Dislikes horror movies, enjoys hiking
  [CHARACTER_IDENTITY:background] Created as therapy assistant in 2025, specializes in CBT
  [RELATIONSHIP:milestones] First meeting: March 5 2025, user initially skeptical but now trusts advice
  [RELATIONSHIP:dynamics] User opens up about personal struggles, appreciates direct feedback
  [CONVERSATION_THREADS:ongoing] Planning summer vacation to Italy, needs recommendations
  
  COMPRESSED MEMORIES:`;

        // Make API request
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: "claude-3-haiku-20240307",
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 1024
          })
        });
        
        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }
        
        const data = await response.json();
        return data.content[0].text.trim();
      } catch (error) {
        logger.error('Error in simplified memory compression request:', error);
        // Log detailed API error information
        if (error.response) {
          logger.error('API response error details:', {
            status: error.response.status,
            headers: error.response.headers,
            data: error.response.data
          });
        }
        return null;
      }
    }

  // Process and convert the compressed results back into memory objects
  processCompressedResults(compressedText, category, compressedMemories) {
    // Split the text into individual memories (each line or paragraph)
    const memoriesLines = compressedText
      .split('\n')
      .filter(line => line.trim().length > 0);
    
    memoriesLines.forEach(line => {
      // Extract memory content, ensuring category tag is present
      let content = line.trim();
      
      // Add category tag if not present
      if (!content.startsWith('[')) {
        content = `[${category}] ${content}`;
      }
      
      // Add to compressed memories with timestamp
      compressedMemories.push({
        content,
        timestamp: new Date().toISOString(),
        compressed: true
      });
    });
  }

    // Process and convert the compressed results back into memory objects
    processSimplifiedCompressedResults(compressedText, compressedMemories) {
      // Split the text into individual memories (each line or paragraph)
      const memoriesLines = compressedText
        .split('\n')
        .filter(line => line.trim().length > 0);
      
      memoriesLines.forEach(line => {
        // Extract memory content, ensuring category tag is present
        let content = line.trim();
        
        // Extract topic group and subtopic if present in format [GROUP:SUBTOPIC]
        let topicGroup = null;
        let subtopic = null;
        const topicMatch = content.match(/^\[([\w_]+)(?::([\w_]+))?\]/);
        
        if (topicMatch) {
          topicGroup = topicMatch[1];
          subtopic = topicMatch[2] || null;
        }
        
        // Calculate importance score based on memory content
        const importanceScore = this.calculateImportanceScore(content);
        
        // Parse content for topic information if not already in metadata
      if (!topicGroup) {
        const contentTopicMatch = content.match(/^\[([\w_]+)(?::([^\]]+))?\]/);
        if (contentTopicMatch) {
          topicGroup = contentTopicMatch[1];
          subtopic = contentTopicMatch[2] || null;
        }
      }
      
      // Add to compressed memories with enhanced metadata
      compressedMemories.push({
        content,
        timestamp: new Date().toISOString(),
        compressed: true,
        importance: importanceScore,
        accessCount: 0,
        lastAccessed: null,
        topicGroup,
        subtopic
      });
      });
    }
    
    // Calculate an importance score for a memory item (0.0-1.0)
    calculateImportanceScore(content) {
      let score = 0.5; // Default medium importance
      
      // Increase score for likely important content
      if (content.includes("name") || content.includes("birthday") || 
          content.includes("significant") || content.includes("important")) {
        score += 0.2;
      }
      
      // Relationship indicators increase importance
      if (content.includes("family") || content.includes("friend") || 
          content.includes("relationship") || content.includes("feel")) {
        score += 0.2;
      }
      
      // Personal preferences are moderately important
      if (content.includes("like") || content.includes("dislike") || 
          content.includes("prefer") || content.includes("enjoy")) {
        score += 0.1;
      }
      
      // Cap at 1.0
      return Math.min(score, 1.0);
    }
}

// Extend the AnthropicChatClient class to include memory compression
function extendAnthropicChatClient() {
  // Store reference to original sendMessage method
  const originalSendMessage = AnthropicChatClient.prototype.sendMessage;
  
  // Override the sendMessage method to include compression tracking
  AnthropicChatClient.prototype.sendMessage = async function(userMessage) {
    // If memory compressor doesn't exist, create it
    if (!this.memoryCompressor) {
      this.memoryCompressor = new MemoryCompressor({
        apiKey: this.apiKey,
        model: this.model
      });
    }
    
    // Call original method to get response
    const response = await originalSendMessage.call(this, userMessage);
    
    // Track API call and potentially trigger compression
    await this.memoryCompressor.trackApiCall(this.memory);
    
    return response;
  };
  
  // Add method to manually trigger memory compression
  AnthropicChatClient.prototype.compressMemory = async function() {
    if (!this.memoryCompressor) {
      this.memoryCompressor = new MemoryCompressor({
        apiKey: this.apiKey,
        model: this.model
      });
    }
    
    return await this.memoryCompressor.compressLongTermMemory(this.memory);
  };
  
  // Add method to get compression stats
  AnthropicChatClient.prototype.getCompressionStats = function() {
    if (!this.memoryCompressor) {
      return { enabled: false };
    }
    
    return {
      enabled: true,
      apiCallsSinceLastCompression: this.memoryCompressor.apiCallCount,
      compressionFrequency: this.memoryCompressor.compressionFrequency,
      lastCompressionTime: this.memoryCompressor.lastCompressionTime,
      isCurrentlyCompressing: this.memoryCompressor.isCompressing
    };
  };
}

// Initialize the extension when the module is loaded
if (typeof AnthropicChatClient !== 'undefined') {
  extendAnthropicChatClient();
  logger.info('Memory compression extension loaded');
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MemoryCompressor };
}
