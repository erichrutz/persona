// Scene Description Generator for AI Image Generation
// Uses Anthropic API to generate optimized prompts based on conversation context

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const API_URL = 'https://api.anthropic.com/v1/messages';

class SceneDescriptionGenerator {
  /**
   * Parse a specific section from a symbolic profile
   * @param {string} profile - The full symbolic profile text
   * @param {string} sectionName - Section to extract (NAME, ID, LOOKS, CORE)
   * @returns {string|null} - Extracted content or null if not found/empty
   */
  static parseProfileSection(profile, sectionName) {
    if (!profile || typeof profile !== 'string') {
      return null;
    }

    // For single-line sections (NAME, ID)
    if (sectionName === 'NAME' || sectionName === 'ID') {
      const regex = new RegExp(`${sectionName}:\\s*([^\\n]+)`, 'i');
      const match = profile.match(regex);
      if (match && match[1].trim()) {
        return match[1].trim();
      }
      return null;
    }

    // For multi-line sections (LOOKS, CORE)
    // Match from section start until next section or end of string
    const regex = new RegExp(`${sectionName}:\\s*([^]*?)(?=\\n[A-Z]+:|$)`, 'i');
    const match = profile.match(regex);
    if (match && match[1].trim()) {
      // Remove extra whitespace and normalize
      return match[1].trim().replace(/\s+/g, ' ');
    }
    return null;
  }

  /**
   * Build context string for AI prompt generation
   * @param {object} data - Session data
   * @returns {string} - Formatted context
   */
  static buildContext(data) {
    const {
      characterProfile,
      userProfile,
      clothing,
      location,
      deepMemory
    } = data;

    const contextParts = [];

    // Add deep memory FIRST - it contains critical context about the scene
    if (deepMemory && deepMemory.trim() !== '') {
      contextParts.push(`=== CRITICAL SCENE CONTEXT ===`);
      contextParts.push(deepMemory.trim());
      contextParts.push('');
    }

    // Add location
    if (location && location.trim() !== '' && location.toLowerCase() !== 'unknown') {
      contextParts.push(`LOCATION: ${location.trim()}`);
    }

    // Parse character profile
    const charName = this.parseProfileSection(characterProfile, 'NAME');
    const charId = this.parseProfileSection(characterProfile, 'ID');
    const charLooks = this.parseProfileSection(characterProfile, 'LOOKS');
    const charCore = this.parseProfileSection(characterProfile, 'CORE');

    // Parse user profile
    const userName = this.parseProfileSection(userProfile, 'NAME');
    const userId = this.parseProfileSection(userProfile, 'ID');
    const userLooks = this.parseProfileSection(userProfile, 'LOOKS');
    const userCore = this.parseProfileSection(userProfile, 'CORE');

    // Extract clothing info
    const charClothing = clothing?.char || clothing?.clothing?.char;
    const userClothing = clothing?.user || clothing?.clothing?.user;

    // Add character info
    contextParts.push('');
    contextParts.push('=== CHARACTER INFORMATION ===');
    if (charName) contextParts.push(`NAME: ${charName}`);
    if (charId) contextParts.push(`ID: ${charId}`);
    if (charLooks) contextParts.push(`LOOKS: ${charLooks}`);
    if (charCore) contextParts.push(`CORE: ${charCore}`);
    if (charClothing && charClothing.trim() !== '' && charClothing.toLowerCase() !== 'unknown') {
      contextParts.push(`CURRENT CLOTHING: ${charClothing.trim()}`);
    }

    // Add user info
    contextParts.push('');
    contextParts.push('=== USER INFORMATION ===');
    if (userName) contextParts.push(`NAME: ${userName}`);
    if (userId) contextParts.push(`ID: ${userId}`);
    if (userLooks) contextParts.push(`LOOKS: ${userLooks}`);
    if (userCore) contextParts.push(`CORE: ${userCore}`);
    if (userClothing && userClothing.trim() !== '' && userClothing.toLowerCase() !== 'unknown') {
      contextParts.push(`CURRENT CLOTHING: ${userClothing.trim()}`);
    }

    return contextParts.join('\n');
  }

  /**
   * Generate scene description using Anthropic API
   * @param {object} sessionData - Complete session data including messages
   * @param {string} apiKey - Anthropic API key
   * @returns {Promise<object>} - Object with prompt property
   */
  static async generate(sessionData, apiKey = ANTHROPIC_API_KEY) {
    if (!sessionData) {
      return { prompt: 'No session data available.' };
    }

    if (!apiKey) {
      return { prompt: 'API key not configured.' };
    }

    try {
      // Build context from profiles
      const context = this.buildContext({
        characterProfile: sessionData.characterProfile || '',
        userProfile: sessionData.userProfile || '',
        clothing: sessionData.clothing || {},
        location: sessionData.location || '',
        deepMemory: sessionData.deepMemory || ''
      });

      // Get last 2 conversation turns (user + assistant messages)
      const messages = sessionData.messages || [];
      const conversationContext = messages.slice(-4); // Last 2 turns = 4 messages (user, assistant, user, assistant)

      // Build conversation history for context
      let conversationText = '';
      if (conversationContext.length > 0) {
        conversationText = '\n\nRECENT CONVERSATION:\n';
        conversationContext.forEach(msg => {
          const role = msg.role === 'user' ? 'User' : 'Character';
          conversationText += `${role}: ${msg.content}\n`;
        });
      }

      // Create the prompt for Claude
      const systemPrompt = `You are an expert at creating detailed, vivid prompts for AI image generators.

Your task: Analyze ALL provided information to determine who is currently present in the scene, then create a single photorealistic image prompt.

Key instructions:
- Read ALL sections carefully, especially "CRITICAL SCENE CONTEXT" which contains vital information about the current situation AND detailed descriptions of people
- IMPORTANT: The CRITICAL SCENE CONTEXT often contains detailed physical descriptions, background, and characteristics of the people (especially the user/second person) - USE THIS INFORMATION when creating the image prompt
- Combine information from CRITICAL SCENE CONTEXT with CHARACTER INFORMATION and USER INFORMATION sections to get complete visual details
- Determine WHO is actually present: both people together, one person alone, or just the environment
- Look for clues like "alone", "not present", "left", "away", "without", location changes, or conversational context
- DEFAULT: If unclear, assume both people are present together
- Create prompt for AI image generators (Stable Diffusion, DALL-E, Midjourney)
- Include specific visual details: location, appearance, clothing, body language (merge details from all sources)
- Describe DYNAMIC ACTION and what they're actively doing right now (talking, moving, gestures, expressions)
- If two people: make clear which details belong to whom, show their interaction
- If one person: show them alone in their environment with their activity
- If no people: describe the environment only
- Single paragraph, vivid visual language
- Return ONLY the image prompt text, nothing else`;

      const userPrompt = `Analyze the information below and create an AI image generation prompt for the current scene.

IMPORTANT: Pay special attention to the "CRITICAL SCENE CONTEXT" section - it often contains detailed physical descriptions and characteristics of the people involved, especially the second person (user). Combine this with the structured profile information below to create a complete picture.

${context}${conversationText}

Based on all the information above (merging details from CRITICAL SCENE CONTEXT with the profile sections), create a single-paragraph photorealistic image prompt that accurately captures who is in the scene and what is happening right now.`;

      // Call Anthropic API with streaming
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250929', // Use Sonnet for quality image prompts
          max_tokens: 500,
          messages: [
            {
              role: 'user',
              content: userPrompt
            }
          ],
          system: systemPrompt,
          stream: true
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Anthropic API error:', errorData);
        return { prompt: `Error: ${errorData.error?.message || 'API request failed'}` };
      }

      // Process streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let generatedPrompt = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);

              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                generatedPrompt += parsed.delta.text;
              }
            } catch (e) {
              // Skip malformed JSON
            }
          }
        }
      }

      return { prompt: generatedPrompt.trim() };

    } catch (error) {
      console.error('Error generating scene description:', error);
      return { prompt: `Error: ${error.message}` };
    }
  }
}

module.exports = { SceneDescriptionGenerator };
