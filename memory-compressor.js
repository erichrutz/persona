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
    this.characterProfile = options.characterProfile || '';
    this.userProfile = options.userProfile || '';

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

        const promptSymbolic = `MEMORY CONSOLIDATION INSTRUCTION

## Instructions
You are responsible for compressing and consolidating character memory data. You will receive three inputs:
1. The existing character information (may be empty for first-time processing) of the character
2. The existing character information (may be empty for first-time processing) of the user
3. New long-term memory entries to be integrated

Your task is to create a single, coherent character profile for each user and character following this exact format separated by '---':

NAME: [Character's full name]
ID: [Age/Gender/Occupation/Location]
LOOKS: [Physical appearance details]
CORE: [Fundamental personality traits]
SPEECH: [Communication style and patterns]
TOPICS: [Interests and knowledge areas]
TRIGGERS: [Stimuli and resulting reactions]
CONNECTIONS: [Relationships with other characters]
USERRELATION: [${this.characterName}'s relationship with the user]
WANTS: [Desires and goals]

CRITICAL DATA PRESERVATION AND COMPRESSION RULES:

1. PRESERVE ALL DATA: All character information (especially name and age) must be retained in the final output UNLESS it is explicitly contradicted or updated by newer information.

2. USER RELATIONSHIP PRIORITY: In the USERRELATION section of ${this.characterName}, always maintain and prioritize information about the relationship with the user. This relationship data must reflect the most current state based on chat history.

3. CONNECTION EVOLUTION: Track how relationships evolve over time. If the relationship with the user or any other character changes, update the description to reflect the current state while preserving the history of relationship development where relevant.

4. OVERRIDE RULE: Newer information ONLY supersedes directly contradictory older information. For example, if a character was previously "unmarried" but is now "married to Alex," replace only that specific attribute.

5. TOKEN EFFICIENCY: Use concise phrasing and eliminate unnecessary words while retaining all essential information. Aim for the shortest possible representation that fully preserves meaning.

6. COMBINE RELATED INFORMATION: Where appropriate, merge related attributes using commas or symbolic notation rather than separate phrases.

7. DEDUPLICATION: Remove exact duplicates and merge similar information to eliminate redundancy while preserving all unique details.

8. MAINTAIN SYMBOLS: Use symbolic notations to compress information:
   - + or ++ = Interest/knowledge (++ = passionate)
   - - or -- = Dislike/avoidance (-- = strong dislike)
   - ~ = Neutral/ambivalent
   - → = Trigger leads to response
   - ! = Critical trait/trigger
   - * = Hidden trait
   - # = Contextual trait
   - @ = Location-specific behavior

9. FORMAT ADHERENCE: Follow the exact section structure shown above, with all sections present but kept as concise as possible.

10. RESOLUTION OF CONTRADICTIONS: When direct contradictions exist, newer information takes precedence.

Return ONLY the consolidated character profile without explanations or commentary.

## Personas
* 'Character' is the person impersonated by the AI in this case ${this.characterName}
* 'User' is the impersonation played by the human chat user

## Previous Character
### ${this.characterName}
${this.characterProfile}
### User
${this.userProfile}

## Memory Data
${JSON.stringify(memoriesText)}

`;

        // Make API request
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: "claude-3-7-sonnet-20250219", //"claude-3-haiku-20240307", 
            messages: [{ role: 'user', content: promptSymbolic }],
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

      const characterProfileSplit = compressedText.split('---');

      compressedMemories.push({
        content: characterProfileSplit[0].trim(),
        timestamp: new Date().toISOString(),
        compressed: true,
        importance: 1,
        accessCount: 0,
        lastAccessed: null,
        topic: 'CHAR',
        subtopic: 'PROFILE'
      });

      compressedMemories.push({
        content: characterProfileSplit[1] ? characterProfileSplit[1].trim() : '',
        timestamp: new Date().toISOString(),
        compressed: true,
        importance: 1,
        accessCount: 0,
        lastAccessed: null,
        topic: 'USER',
        subtopic: 'PROFILE'
      });

      return;
      /*
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
      */
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
