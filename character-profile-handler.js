// Character Profile Handler
// This module provides utilities for processing and managing character profiles

class CharacterProfileHandler {
  constructor() {
    // Semantic categories for storing character information
    this.categories = {
      CORE: ['name', 'age', 'gender', 'occupation', 'role'],
      APPEARANCE: ['appearance', 'looks', 'physical', 'height', 'weight', 'clothes', 'style'],
      BACKGROUND: ['background', 'history', 'origin', 'childhood', 'education', 'hometown'],
      PERSONALITY: ['personality', 'traits', 'character', 'temperament', 'attitude', 'demeanor'],
      SPEECH: ['speech', 'dialogue', 'voice', 'accent', 'phrases', 'vocabulary', 'speaking'],
      RELATIONSHIPS: ['relationships', 'family', 'friends', 'allies', 'enemies', 'romance'],
      SKILLS: ['skills', 'abilities', 'talents', 'powers', 'expertise', 'knowledge'],
      PREFERENCES: ['likes', 'dislikes', 'preferences', 'favorite', 'hates', 'loves'],
      PSYCHOLOGY: ['motivation', 'fears', 'desires', 'dreams', 'trauma', 'values', 'beliefs'],
      NARRATIVE: ['story', 'arc', 'role', 'purpose', 'goals', 'quests', 'missions']
    };
    
    // LLM token optimization parameters
    this.compressionRatio = 0.2; // Target compression (20% of original text)
    this.maxTokensPerAttribute = 50; // Maximum tokens per attribute
  }
  
  // Parse a character profile from various formats (JSON, YAML, text)
  parseProfile(profile) {
    if (typeof profile === 'object') {
      return profile; // Already parsed
    }
    
    // Try to parse as JSON
    try {
      return JSON.parse(profile);
    } catch (e) {
      // Not JSON, continue
    }
    
    // Try to parse as YAML if jsyaml is available
    if (typeof jsyaml !== 'undefined') {
      try {
        return jsyaml.load(profile);
      } catch (e) {
        // Not YAML, continue
      }
    }
    
    // Try structured text parsing as fallback
    return this.parseStructuredText(profile);
  }
  
  // Parse a structured text profile (e.g., "Name: John\nAge: 30\n")
  parseStructuredText(text) {
    const profile = {};
    const lines = text.split('\n');
    let currentKey = null;
    let currentValue = '';
    
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      
      // Check for key-value pairs
      const match = line.match(/^([A-Za-z][A-Za-z0-9\s]*?):\s*(.*)$/);
      if (match) {
        // Save previous key-value if exists
        if (currentKey) {
          profile[currentKey.toLowerCase()] = currentValue.trim();
        }
        
        // Start new key-value
        currentKey = match[1].trim();
        currentValue = match[2];
      } else if (currentKey) {
        // Continue previous value
        currentValue += '\n' + line;
      }
    }
    
    // Save final key-value if exists
    if (currentKey) {
      profile[currentKey.toLowerCase()] = currentValue.trim();
    }
    
    return profile;
  }
  
  // Compress a character profile for token efficiency
  compressProfile(profile) {
    const parsed = this.parseProfile(profile);
    const compressed = {};
    
    // Process each category
    for (const [category, keywords] of Object.entries(this.categories)) {
      const categoryData = {};
      
      // Find attributes matching this category
      for (const [key, value] of Object.entries(parsed)) {
        if (keywords.some(keyword => key.toLowerCase().includes(keyword.toLowerCase()))) {
          categoryData[key] = this.compressText(value);
        }
      }
      
      // If we found data for this category, add it
      if (Object.keys(categoryData).length > 0) {
        compressed[category.toLowerCase()] = categoryData;
      }
    }
    
    // Add core identity field for quick reference
    compressed.identity = this.createIdentityString(parsed);
    
    return compressed;
  }
  
  // Compress text while preserving meaning
  compressText(text) {
    if (!text) return '';
    
    // Handle different input types
    if (typeof text !== 'string') {
      if (Array.isArray(text)) {
        // For arrays, compress each item
        return text.map(item => 
          typeof item === 'string' ? this.truncateText(item) : item
        );
      }
      // For objects, return as is
      return text;
    }
    
    // For strings, truncate
    return this.truncateText(text);
  }
  
  // Truncate text to reduce tokens
  truncateText(text, maxLength = 200) {
    if (text.length <= maxLength) return text;
    
    // Preserve the beginning and end, cut the middle
    const halfLength = Math.floor(maxLength / 2) - 2;
    return text.substring(0, halfLength) + 
           '...' + 
           text.substring(text.length - halfLength);
  }
  
  // Create a concise identity string from the profile
  createIdentityString(profile) {
    const name = profile.name || profile.fullname || 'Character';
    const role = profile.role || profile.occupation || '';
    const mainTrait = this.findMainPersonalityTrait(profile);
    const appearance = this.extractKeyAppearance(profile);
    
    return `${name}${role ? `, a ${role}` : ''}${mainTrait ? ` who is ${mainTrait}` : ''}${appearance ? `. Appearance: ${appearance}` : ''}`;
  }
  
  // Extract key appearance details
  extractKeyAppearance(profile) {
    // Check various fields where appearance might be stored
    const appearanceFields = ['appearance', 'looks', 'physical', 'description'];
    
    for (const field of appearanceFields) {
      if (profile[field]) {
        return this.truncateText(profile[field], 100);
      }
    }
    
    // Try to construct from individual appearance traits
    const traits = [];
    
    // Check for common appearance attributes
    if (profile.height) traits.push(typeof profile.height === 'string' ? profile.height : `${profile.height}cm tall`);
    if (profile.build) traits.push(profile.build);
    if (profile.hairColor || profile.hair) traits.push(`${profile.hairColor || profile.hair} hair`);
    if (profile.eyeColor || profile.eyes) traits.push(`${profile.eyeColor || profile.eyes} eyes`);
    if (profile.skinColor || profile.skin) traits.push(`${profile.skinColor || profile.skin} skin`);
    if (profile.clothing || profile.outfit || profile.attire) 
      traits.push(`wears ${profile.clothing || profile.outfit || profile.attire}`);
    
    // If we found individual traits, combine them
    if (traits.length > 0) {
      return traits.join(', ');
    }
    
    return '';
  }
  
  // Find the main personality trait
  findMainPersonalityTrait(profile) {
    // Check personality field first
    if (profile.personality) {
      if (typeof profile.personality === 'string') {
        const words = profile.personality.split(' ');
        return words.length > 0 ? words[0].replace(/[,.;:]$/, '') : '';
      }
      if (Array.isArray(profile.personality) && profile.personality.length > 0) {
        return profile.personality[0];
      }
    }
    
    // Check traits field as backup
    if (profile.traits) {
      if (typeof profile.traits === 'string') {
        const words = profile.traits.split(' ');
        return words.length > 0 ? words[0].replace(/[,.;:]$/, '') : '';
      }
      if (Array.isArray(profile.traits) && profile.traits.length > 0) {
        return profile.traits[0];
      }
    }
    
    return '';
  }
  
  // Extract speech patterns for immersive dialogue
  extractSpeechPatterns(profile) {
    const parsed = this.parseProfile(profile);
    const patterns = {
      tone: '',
      phrases: [],
      quirks: [],
      vocabulary: ''
    };
    
    // Extract from speech field
    if (parsed.speech) {
      if (typeof parsed.speech === 'string') {
        patterns.tone = parsed.speech;
      } else {
        Object.assign(patterns, parsed.speech);
      }
    }
    
    // Extract from dialogue field
    if (parsed.dialogue) {
      if (typeof parsed.dialogue === 'string') {
        patterns.examples = parsed.dialogue;
      } else {
        Object.assign(patterns, parsed.dialogue);
      }
    }
    
    // Extract from voice field
    if (parsed.voice) {
      patterns.tone = parsed.voice;
    }
    
    return patterns;
  }
  
  // Generate system prompt for character impersonation
  generateCharacterPrompt(profile) {
    const parsed = this.parseProfile(profile);
    const speech = this.extractSpeechPatterns(parsed);
    
    // Create identity string
    const identity = this.createIdentityString(parsed);
    
    // Build system prompt
    let prompt = `You are roleplaying as ${identity}. Stay in character at all times.`;
    
    // Add detailed appearance if available
    const appearanceFields = ['appearance', 'looks', 'physical', 'description'];
    let appearanceFound = false;
    
    for (const field of appearanceFields) {
      if (parsed[field]) {
        prompt += `\n\nAPPEARANCE: ${this.truncateText(parsed[field], 300)}`;
        appearanceFound = true;
        break;
      }
    }
    
    // If no dedicated appearance field, check for individual traits
    if (!appearanceFound) {
      const appearanceTraits = [];
      if (parsed.height) appearanceTraits.push(`Height: ${parsed.height}`);
      if (parsed.build) appearanceTraits.push(`Build: ${parsed.build}`);
      if (parsed.hairColor || parsed.hair) appearanceTraits.push(`Hair: ${parsed.hairColor || parsed.hair}`);
      if (parsed.eyeColor || parsed.eyes) appearanceTraits.push(`Eyes: ${parsed.eyeColor || parsed.eyes}`);
      if (parsed.skinColor || parsed.skin) appearanceTraits.push(`Skin: ${parsed.skinColor || parsed.skin}`);
      if (parsed.clothing || parsed.outfit || parsed.attire) 
        appearanceTraits.push(`Clothing: ${parsed.clothing || parsed.outfit || parsed.attire}`);
      
      // If we found individual traits, add them
      if (appearanceTraits.length > 0) {
        prompt += `\n\nAPPEARANCE: ${appearanceTraits.join('; ')}`;
      }
    }
    
    // Add background if available
    if (parsed.background) {
      prompt += `\n\nBACKGROUND: ${this.truncateText(parsed.background)}`;
    }
    
    // Add personality if available
    if (parsed.personality) {
      const personality = typeof parsed.personality === 'string' 
        ? parsed.personality 
        : Array.isArray(parsed.personality) 
          ? parsed.personality.join(', ') 
          : '';
      
      if (personality) {
        prompt += `\n\nPERSONALITY: ${this.truncateText(personality)}`;
      }
    }
    
    // Add speech patterns
    if (Object.values(speech).some(v => v)) {
      prompt += '\n\nSPEECH PATTERNS:';
      if (speech.tone) prompt += `\n- Tone: ${speech.tone}`;
      if (speech.phrases && speech.phrases.length) {
        prompt += `\n- Common phrases: ${speech.phrases.slice(0, 3).join(', ')}`;
      }
      if (speech.quirks && speech.quirks.length) {
        prompt += `\n- Speech quirks: ${speech.quirks.slice(0, 2).join(', ')}`;
      }
      if (speech.vocabulary) prompt += `\n- Vocabulary: ${speech.vocabulary}`;
    }
    
    // Add memory instructions
    prompt += `\n\nMEMORY SYSTEM:
Your 2-layer memory represents ${parsed.name || 'your character'}'s mind:
1. Short-term memory: Your recent conversation and current situation
2. Long-term memory: Important personal facts about your life and the person you're talking to

After each response, decide if any new important information should be remembered by adding this JSON at the end (it will be invisible to the user):
{
  "memorize": "Important fact to remember",
  "reason": "Why this is important to remember"
}`;

    return prompt;
  }
  
  // Extract facts from profile for long-term memory
  extractMemoryFacts(profile) {
    const parsed = this.parseProfile(profile);
    const facts = [];
    
    // Core identity
    facts.push({
      category: 'identity',
      fact: this.createIdentityString(parsed)
    });
    
    // Appearance facts (prioritized for character impersonation)
    const appearanceFields = ['appearance', 'looks', 'physical', 'description'];
    let appearanceAdded = false;
    
    // First check for dedicated appearance fields
    for (const field of appearanceFields) {
      if (parsed[field]) {
        facts.push({
          category: 'appearance',
          fact: this.truncateText(parsed[field])
        });
        appearanceAdded = true;
        break;
      }
    }
    
    // If no dedicated appearance field, check for individual traits
    if (!appearanceAdded) {
      const appearanceTraits = [];
      if (parsed.height) appearanceTraits.push(`Height: ${parsed.height}`);
      if (parsed.build) appearanceTraits.push(`Build: ${parsed.build}`);
      if (parsed.hairColor || parsed.hair) appearanceTraits.push(`Hair: ${parsed.hairColor || parsed.hair}`);
      if (parsed.eyeColor || parsed.eyes) appearanceTraits.push(`Eyes: ${parsed.eyeColor || parsed.eyes}`);
      if (parsed.skinColor || parsed.skin) appearanceTraits.push(`Skin: ${parsed.skinColor || parsed.skin}`);
      if (parsed.clothing || parsed.outfit || parsed.attire) 
        appearanceTraits.push(`Clothing: ${parsed.clothing || parsed.outfit || parsed.attire}`);
      if (parsed.accessories) appearanceTraits.push(`Accessories: ${parsed.accessories}`);
      if (parsed.distinguishingFeatures || parsed.features || parsed.marks) 
        appearanceTraits.push(`Distinguishing features: ${parsed.distinguishingFeatures || parsed.features || parsed.marks}`);
      
      // If we found individual traits, add them
      if (appearanceTraits.length > 0) {
        facts.push({
          category: 'appearance',
          fact: appearanceTraits.join('; ')
        });
      }
    }
    
    // Background facts
    if (parsed.background) {
      facts.push({
        category: 'background',
        fact: this.truncateText(parsed.background)
      });
    }
    
    // Personal facts
    ['childhood', 'family', 'hometown', 'education'].forEach(key => {
      if (parsed[key]) {
        facts.push({
          category: 'personal',
          fact: `${key}: ${this.truncateText(parsed[key])}`
        });
      }
    });
    
    // Preferences
    ['likes', 'dislikes', 'favorites', 'hates'].forEach(key => {
      if (parsed[key]) {
        const prefText = typeof parsed[key] === 'string' 
          ? parsed[key] 
          : Array.isArray(parsed[key]) 
            ? parsed[key].join(', ') 
            : JSON.stringify(parsed[key]);
            
        facts.push({
          category: 'preferences',
          fact: `${key}: ${this.truncateText(prefText)}`
        });
      }
    });
    
    // Relationships
    ['friends', 'family', 'enemies', 'relationships'].forEach(key => {
      if (parsed[key]) {
        facts.push({
          category: 'relationships',
          fact: `${key}: ${this.truncateText(
            typeof parsed[key] === 'string' 
              ? parsed[key] 
              : JSON.stringify(parsed[key])
          )}`
        });
      }
    });
    
    return facts;
  }
}

// Example usage
/*
const profileHandler = new CharacterProfileHandler();

// Example character profile
const profile = {
  name: "Dr. Eleanor Marsh",
  age: 42,
  occupation: "Quantum Physicist",
  background: "Born in Glasgow, Eleanor showed exceptional mathematical ability from a young age. After earning her PhD from Cambridge at 24, she's spent her career researching quantum entanglement. She recently made a breakthrough that challenges conventional theories.",
  personality: ["brilliant", "eccentric", "passionate", "socially awkward", "intensely curious"],
  speech: {
    tone: "precise and technical",
    phrases: ["fascinating implication", "quantum perspective", "let me clarify"],
    quirks: ["uses scientific analogies for everyday situations", "occasionally lapses into extended technical explanations"]
  },
  likes: ["Earl Grey tea", "classical music", "mathematical puzzles", "stargazing"],
  dislikes: ["small talk", "bureaucracy", "pseudoscience", "interrupted experiments"]
};

// Generate character prompt
const characterPrompt = profileHandler.generateCharacterPrompt(profile);
console.log(characterPrompt);

// Extract facts for memory
const memoryFacts = profileHandler.extractMemoryFacts(profile);
console.log(memoryFacts);
*/

// Export the module
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CharacterProfileHandler };
}