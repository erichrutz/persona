# Memory Compression Token Cost Analysis

## Summary
**The current compression implementation is NOT token-efficient.** It consumes significantly more tokens than maintaining an uncompressed array of memories.

## Current Implementation

### Compression Triggers
- **Frequency**: Every 10 API calls (memory-compressor.js:119)
- **Threshold**: Only compresses when `longTermMemory.length > 12` (memory-compressor.js:145)
- Note: Comment at anthropic-chat-client.js:124 mentions "10 entries" but code uses 12

### Compression Process
1. Collects all long-term memories (13+ entries of ~10 words each)
2. Sends to Claude API with a large prompt requesting consolidation
3. Returns 2 compressed profiles: Character + User
4. Clears longTermMemory array and stores only the 2 profiles

### Memory Entry Size
Per your specification:
- Each long-term memory: ~10 words + symbols
- Estimated token count: **~13-15 tokens per memory**

## Token Cost Breakdown

### Per Compression Event

**Input tokens:**
- Compression instruction prompt (lines 409-486): ~770 tokens
- Existing character profile: ~200-500 tokens
- Existing user profile: ~200-500 tokens
- Memory data (13+ memories × 15 tokens): ~195+ tokens
- **Total input: ~1,500-2,000 tokens**

**Output tokens:**
- max_tokens setting: 1,600 (memory-compressor.js:499)
- Typical output: ~1,000-1,600 tokens
- **Total output: ~1,000-1,600 tokens**

**Total per compression: ~3,000-4,000 tokens**

### Over 100 User Messages

**With Compression:**
- Compression events: 10 (every 10 messages)
- Compression cost: 10 × 3,500 = **35,000 tokens**
- Compressed profiles sent with each API call: ~1,000 tokens each
- Profile transmission: 1,000 × 100 = **100,000 tokens**
- **TOTAL: ~135,000 tokens**

**Without Compression (array approach):**
- No compression API calls: 0 tokens
- Memories grow to ~100 entries × 15 tokens = 1,500 tokens
- Sending all memories each time: ~750 tokens average per call
- Transmission: 750 × 100 = **75,000 tokens**
- **TOTAL: ~75,000 tokens**

**Without Compression (selective approach - only 7 most relevant):**
- Following line 446 (MAX_MEMORIES = 7)
- Memories sent per call: 7 × 15 = 105 tokens
- Transmission: 105 × 100 = **10,500 tokens**
- **TOTAL: ~10,500 tokens**

## Cost Comparison

| Approach | Total Tokens (100 messages) | Efficiency |
|----------|----------------------------|------------|
| **Current (with compression)** | 135,000 | Baseline |
| **Array (all memories)** | 75,000 | **1.8x better** |
| **Array (7 most relevant)** | 10,500 | **12.9x better** |

## Recommendations

### Option 1: Disable Compression (Immediate)
- Remove compression entirely
- Maintain memories as an array
- Implement smart selection (already exists: getTopicBasedMemories)
- **Savings: 56% fewer tokens**

### Option 2: Optimize Selection (Best)
- Keep the existing selective memory system (MAX_MEMORIES = 7)
- Remove compression API calls
- Use importance scoring and recency for selection
- **Savings: 92% fewer tokens**

### Option 3: Increase Compression Threshold (Partial Fix)
- Only compress when memories exceed 50-100 entries
- Reduce compression frequency (every 50 calls instead of 10)
- This delays the problem but doesn't solve it

## Why Compression Fails

1. **API call overhead**: Each compression costs 3,500 tokens
2. **High frequency**: Compressing every 10 calls is too often
3. **Profile transmission**: Compressed profiles are still sent with EVERY message
4. **Better alternative exists**: The code already has selective memory retrieval (line 446, 474)

## Mathematical Break-Even Point

Compression only makes sense if:
```
compression_cost < (uncompressed_size - compressed_size) × number_of_transmissions
```

Current reality:
```
3,500 < (195 - 1,000) × 10
3,500 < -8,050
FALSE - Compression INCREASES cost
```

## Conclusion

**The "simple compression" actually increases token usage by 1.8x-13x depending on the alternative.**

The most token-efficient approach is to:
1. Maintain an uncompressed array of memories
2. Send only the 7-10 most relevant memories per API call
3. Use the existing importance scoring and topic-based selection

This is already partially implemented in the code (getTopicBasedMemories, line 526) but is being undermined by the compression system.
