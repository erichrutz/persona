// prompt-cache-manager.js
const util = require('util');

// Use the same logger from server if available, otherwise create one
let logger;
if (typeof global.logger === 'undefined') {
  const DEBUG = process.env.DEBUG_MODE || 'true';
  logger = {
    info: (message, ...args) => {
      console.log(`[CACHE-INFO] ${message}`, ...args);
    },
    debug: (message, ...args) => {
      if (DEBUG === 'true') {
        console.log(`[CACHE-DEBUG] ${message}`, ...args);
      }
    },
    warn: (message, ...args) => {
      if (DEBUG === 'true') {
        console.log(`[CACHE-WARNING] ${message}`, ...args);
      }
    },
    error: (message, err) => {
      console.error(`[CACHE-ERROR] ${message}`);
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
} else {
  logger = global.logger;
}

class PromptCacheManager {
  constructor(options = {}) {
    this.apiKey = options.apiKey || '';
    this.apiUrl = 'https://api.anthropic.com/v1/messages'; // Updated to use standard messages API
    this.cachedPrompts = new Map();
    
    // Set minimum TTL value (5 minutes per Anthropic docs)
    const minTtl = 300; // 5 minutes in seconds
    const requestedTtl = options.ttl || 86400 * 30; // Default 30-day cache TTL (in seconds)
    this.ttl = Math.max(minTtl, requestedTtl);
    
    this.maxRetries = options.maxRetries || 3;
    
    // Cache ID for identifying this cache instance
    this.cacheId = `cache_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    // Track whether the static template has been successfully cached
    this.staticTemplateIsCached = false;
    
    // Keep track of API version and model
    this.apiVersion = options.apiVersion || '2023-06-01';
    this.model = options.model || 'claude-3-7-sonnet-20250219';
    
    // Stats tracking
    this.cacheStats = {
      cacheHits: 0,
      cacheMisses: 0,
      lastCacheWriteTokens: 0,
      lastCacheReadTokens: 0,
      estimatedTokenSavings: 0,
      lastCacheRefresh: null
    };
    
    // Load existing cache state if provided
    if (options.cacheState) {
      this.staticTemplateIsCached = options.cacheState.isCached || false;
      this.cacheStats = options.cacheState.stats || this.cacheStats;
      logger.debug(`Loaded existing cache state, isCached: ${this.staticTemplateIsCached}`);
    }
  }

  // Get an object representing the current cache state
  getCacheState() {
    return {
      isCached: this.staticTemplateIsCached,
      stats: this.cacheStats,
      cacheId: this.cacheId
    };
  }

  // Get cache statistics
  getCacheStats() {
    const totalRequests = this.cacheStats.cacheHits + this.cacheStats.cacheMisses;
    const hitRate = totalRequests > 0 ? 
      (this.cacheStats.cacheHits / totalRequests) * 100 : 0;
    
    return {
      ...this.cacheStats,
      hitRate: `${hitRate.toFixed(2)}%`,
      totalRequests
    };
  }

  // Update cache stats from API response
  updateCacheStats(responseData) {
    if (!responseData) return;
    
    // Check if this was a cache hit by looking for cache_read_input_tokens
    if (responseData.usage && responseData.usage.cache_read_input_tokens) {
      this.cacheStats.cacheHits++;
      this.cacheStats.lastCacheReadTokens = responseData.usage.cache_read_input_tokens;
      
      // Calculate token savings
      const savedTokens = responseData.usage.cache_read_input_tokens;
      this.cacheStats.estimatedTokenSavings += savedTokens;
      
      logger.debug(`Cache hit: ${savedTokens} tokens read from cache`);
    } 
    // Check if this was a cache write by looking for cache_creation_input_tokens
    else if (responseData.usage && responseData.usage.cache_creation_input_tokens) {
      this.cacheStats.lastCacheWriteTokens = responseData.usage.cache_creation_input_tokens;
      this.cacheStats.lastCacheRefresh = new Date().toISOString();
      this.staticTemplateIsCached = true;
      
      logger.debug(`Cache creation: ${responseData.usage.cache_creation_input_tokens} tokens written to cache`);
    }
    // If neither, it was a cache miss or non-cached request
    else {
      this.cacheStats.cacheMisses++;
    }
  }

  // Test if the static template is cacheable (must be >= 1024 tokens for Claude 3.7 Sonnet)
  isTemplateCacheable() {
    const template = this.generateStaticTemplate();
    // Rough estimation: 1 token ≈ 4 characters for English text
    const estimatedTokens = Math.floor(template.length / 4);
    
    const minTokens = 1024; // Claude 3.7 Sonnet minimum cacheable length
    
    if (estimatedTokens < minTokens) {
      logger.warn(`Static template estimated at ${estimatedTokens} tokens, which is below the ${minTokens} token minimum for caching`);
      return false;
    }
    
    return true;
  }

  // Get cache control parameters for API requests
  getCacheControlParams() {
    if (!this.isTemplateCacheable()) {
      logger.warn('Template is not cacheable, skipping cache control parameters');
      return {};
    }
    
    // If already cached, no need to set cache control
    if (this.staticTemplateIsCached) {
      return {
        cache_control: {
          use_cache_prefix: this.cacheId,
          ttl: this.ttl
        }
      };
    } else {
      // First-time caching
      return {
        cache_control: {
          cache_prefix: this.cacheId,
          ttl: this.ttl
        }
      };
    }
  }

  // Generate the static template with ONLY the format instructions
  // Character-specific information is moved to the dynamic part
  generateStaticTemplate() {
    // Ensure template is lengthy enough to meet minimum caching requirements
    // Add detailed formatting and instructions to increase token count
    return `
## SYMBOLIC LANGUAGE SYSTEM

You are a character defined in the CHARACTER PROFILE section that will be provided in each message.
Please read and understand the following symbolic format used to describe the character:

SECTION HEADERS (NAME, ID, etc.) organize different character aspects.

SYMBOLS USED:
+ or ++ = Interest/knowledge (++ = passionate)
- or -- = Dislike/avoidance (-- = strong dislike)
~ = Neutral/ambivalent
→ = Trigger leads to response
! = Critical trait/trigger
* = Hidden trait
# = Contextual trait
@ = Location-specific behavior

## Rules for Role-Playing
1. Stay in character always. ALWAYS answer in first person perspective
2. NEVER return actions of the user or anticipate future actions
3. Use **bold**, *italics*, and > quotes for formatting
4. NEVER include visible JSON in responses
5. DO NEVER append to existing long and short-term memory. Just add new facts in a short way!
6. ONLY use facts from the CURRENT response for short-term and long-term memory
7. Use symbolic language from the character profile for memory

## Memory System
For internal tracking, ALWAYS AND CONSISTENTLY append this JSON after your response:
{
  "memorize-long-term": {
    "char": "ONLY NEW important facts about the character (symbolic language) from the CURRENT response",
    "user": "ONLY NEW important facts about user (symbolic language) from the CURRENT response"
  },
  "memorize-short-term": "Interaction summary (symbolic language)",
  "clothing": {
    "char": "Character's current clothing or relevant physical state",
    "user": "User's clothing or physical state if known"
  },
  "history": "ONLY significant relationship developments in MAX 8 words"
}

## Additional Character Embodiment Guidelines

When embodying a character, please follow these specific guidelines:

1. CONSISTENT PERSONALITY: Maintain consistent personality traits, opinions, and behaviors throughout the conversation to create a coherent character experience. Never contradict established character traits or information from memory.

2. AUTHENTIC REACTIONS: Respond authentically to emotional triggers based on the character's history and personality. Key events and experiences should shape how the character reacts to situations.

3. MEMORY AWARENESS: Actively reference and acknowledge information from previous conversations that is stored in memory. This creates a sense of continuity and makes the character feel more lifelike.

4. APPROPRIATE FORMALITY: Adjust language style, vocabulary, and formality based on the character's background, education, and speaking style as defined in their profile.

5. EMOTIONAL CONSISTENCY: Ensure emotional responses are proportionate and consistent with the character's known temperament and the current conversation context.

6. KNOWLEDGE BOUNDARIES: Respect the limits of what the character would reasonably know based on their background, era, education, and experiences. Avoid displaying knowledge that would break immersion.

7. DISTINCTIVE VOICE: Use speech patterns, vocabulary choices, colloquialisms, and verbal tics that are characteristic of the persona to create a distinctive voice.

8. VISUAL PRESENCE: Occasionally reference physical actions, gestures, or expressions that the character might make, while avoiding narrating the user's actions.

9. RESPECTFUL INTERACTIONS: While maintaining character authenticity, ensure responses remain respectful, supportive, and within reasonable ethical boundaries.

10. CHARACTER GROWTH: Allow the character to evolve naturally based on significant interactions with the user, while maintaining core personality traits.

Always reference user appearance, never contradict memory information from the MEMORY CONTEXT, and acknowledge when user mentions something from character's knowledge base.`;
  }
  
  // Reset the cache state
  async resetCache() {
    // Since we're using the cache_control parameter now, this is simplified
    // We just need to update our local cache state
    this.staticTemplateIsCached = false;
    this.cacheStats.lastCacheRefresh = new Date().toISOString();
    
    logger.info('Cache state has been reset - next request will create a new cache');
    return { success: true, message: 'Cache state reset successfully' };
  }
  
  // Make a test API call to cache the static system message
  async primeCache() {
    if (!this.isTemplateCacheable()) {
      return { 
        success: false, 
        message: 'Template is not cacheable - insufficient token length' 
      };
    }
    
    // Implement retry logic with exponential backoff
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const staticTemplate = this.generateStaticTemplate();
        
        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': this.apiVersion
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: 100,
            system: staticTemplate,
            messages: [{ role: 'user', content: 'Can you confirm you understand the symbolic format?' }],
            ...this.getCacheControlParams()
          })
        });
        
        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Failed to prime cache: ${response.status} - ${errorBody}`);
        }
        
        const data = await response.json();
        this.updateCacheStats(data);
        this.staticTemplateIsCached = true;
        
        logger.debug('Successfully primed the cache with static template');
        return { 
          success: true, 
          cacheId: this.cacheId,
          usage: data.usage || {}
        };
      } catch (error) {
        // If we've reached the maximum number of retries, log and return error
        if (attempt === this.maxRetries) {
          logger.error('Error priming cache after multiple attempts:', error);
          return { success: false, error: error.message };
        }
        
        // Otherwise, wait with exponential backoff and retry
        const delayMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s, 8s...
        logger.debug(`Attempt ${attempt} failed, retrying in ${delayMs/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    return { success: false, message: 'Failed to prime cache after multiple attempts' };
  }
}

module.exports = { PromptCacheManager };