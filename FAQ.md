# Frequently Asked Questions

## Table of Contents

- [Getting Started](#getting-started)
- [Anthropic & API Key](#anthropic--api-key)
- [Costs](#costs)
- [Memory System](#memory-system)
- [Characters](#characters)
- [Sessions](#sessions)
- [Configuration & Models](#configuration--models)
- [Privacy & Security](#privacy--security)
- [Troubleshooting](#troubleshooting)

---

## Getting Started

**What do I need to run Persona?**
Node.js ≥14.0.0 and an Anthropic API key. Everything else is included. See [Quick Start](README.md#quick-start) for the full setup.

**Where do I get an Anthropic API key?**
At [console.anthropic.com](https://console.anthropic.com/). Note that API usage is billed separately from Claude.ai subscriptions.

**Does Persona require an internet connection?**
Yes — it calls the Anthropic API for every message and memory compression. All conversation data is stored locally, but the AI inference happens in the cloud.

**Is there a hosted version I can try without self-hosting?**
Not currently. Persona is designed to be self-hosted so your conversations remain private.

---

## Anthropic & API Key

**What is Anthropic and what is Claude?**
[Anthropic](https://www.anthropic.com/) is an AI company and the maker of Claude — the large language model that powers all of Persona's conversations, memory compression, and character creation. Persona does not include its own AI; it uses Claude via Anthropic's API.

**How do I get an API key?**
1. Create a free account at [console.anthropic.com](https://console.anthropic.com/)
2. Go to **API Keys** in the left sidebar and click **Create Key**
3. Copy the key (it starts with `sk-ant-`) — you won't be able to see it again
4. Paste it as `ANTHROPIC_API_KEY=sk-ant-...` in your `.env` file

**Does an API key cost money?**
Creating an account is free, but API usage is billed by token. There is no free tier for the API — you need to add a payment method and purchase credits. See [Anthropic's pricing page](https://www.anthropic.com/pricing) for current rates per model.

**Is an Anthropic API key the same as a Claude.ai subscription?**
No. Claude.ai (the chat website) and the API are separate products with separate billing. A Claude.ai Pro or Team subscription does not grant API access. You need a dedicated API account at [console.anthropic.com](https://console.anthropic.com/).

**Which Claude models can I use with Persona?**
Any model available on your Anthropic account. Persona defaults to Claude Sonnet 4.5, which offers the best balance of capability and cost. Claude Haiku 4.5 is a faster, cheaper alternative suited for compression tasks or lighter conversations. See [Anthropic's models overview](https://docs.anthropic.com/en/docs/about-claude/models/overview) for the full list of current model IDs.

**How much will running Persona cost?**
It depends on conversation length, compression frequency, and the model used. A typical message exchange with Sonnet costs a fraction of a cent. Long sessions with frequent compression can add up — use `MODEL_COMPRESSION=claude-haiku-4-5-20251001` in `.env` to reduce background costs. Monitor usage on the [Anthropic Console usage dashboard](https://console.anthropic.com/settings/usage).

**Where can I find Anthropic's usage policies?**
At [anthropic.com/legal/usage-policy](https://www.anthropic.com/legal/usage-policy). Review these before deploying Persona for others to use.

---

## Costs

**How much does Persona cost to run?**
Persona itself is free and open source. The only ongoing cost is Anthropic API usage. For casual daily use — a few conversations per day with typical session lengths — expect to spend roughly **20$ per month or less**. If you just play around expect much less than that (**1-5$**). Heavier use (long sessions, many messages, frequent compression) will cost more.


**How does that compare to commercial alternatives?**
AI companion and character roleplay platforms of comparable quality typically charge **10–25$/month** for a subscription — and often impose message limits, content restrictions, or data-sharing terms on top of that. Running Persona yourself gives you the better quality, full control over your data, and no artificial limits, for roughly the same price range.

**Is the API billed like a subscription?**
No. The Anthropic API is **pre-paid and pay-as-you-go**. You purchase credits upfront and they are drawn down as you use the API. There is no monthly subscription, no commitment, and no surprise bill at the end of the month. When your credits run out, API calls simply stop working until you add more.

**Can I control how much I spend?**
Yes. In the [Anthropic Console](https://console.anthropic.com/settings/billing), you can set a **monthly spend limit** that hard-caps your usage. Once the limit is reached, no further API calls are made until the next month or until you raise the cap. This is the most reliable way to stay within a budget.

**Should I enable automatic credit top-ups?**
It is recommended to **not** enable automatic top-ups, at least initially. Auto top-up means your payment method is charged without you actively deciding to spend more — which can lead to unexpected charges if a session grows unusually large or something runs in a loop. The safer approach is to **manually purchase credits** when your balance runs low and set a monthly spend limit as a backstop. Only enable auto top-up once you have a good feel for your typical monthly spend and are comfortable with the potential for higher charges.

**How can I monitor my usage?**
The [Anthropic Console usage dashboard](https://console.anthropic.com/settings/usage) shows a breakdown of token consumption by model and by day. Check it periodically when starting out to understand how your usage patterns translate into cost.

---

## Memory System

**How is Persona different from just giving Claude a long system prompt?**
Persona's three-tier memory architecture actively compresses and organizes information as the conversation grows. Raw facts are consolidated into symbolic profiles, reducing token usage by 60–86% while preserving relationship history, personality evolution, and critical context — indefinitely.

**What are the three memory tiers?**
- **Short-Term**: The last 10 messages (with full detail on the most recent 2). Never compressed.
- **Long-Term**: Facts and preferences extracted automatically from each exchange. Compressed 
when a certain threshold (configurable) is reached.
- **Deep Memory**: A freeform text field you control — information that is never compressed or forgotten (e.g. "User is a doctor" or "This is set in 1887").

**What happens to memories after compression?**
Long-term entries are merged into the character and user symbolic profiles. The raw entries are cleared. No information is deleted — it's consolidated.

**Can the character forget things?**
Deep memory is never forgotten. Long-term memories are preserved through compression. Short-term context naturally rolls off after 10 messages, but anything meaningful should be extracted into long-term memory automatically. Of course not all details can be remembered. But the main events should

**What should I put in Deep Memory?**
Facts that must never be lost or overridden: the user's name, a fixed scenario premise, physical constraints, a relationship starting point, or any world-rule that should always apply.

---

## Characters

**Can I create my own characters?**
Yes — use the built-in Character Creator in the UI, or write a symbolic profile manually and paste it when starting a session.

**What is the symbolic character format?**
A compact text notation using `++` (strong interest), `--` (strong dislike), `!` (core trait), `*` (hidden trait), `→` (trigger → response), and `@` (location-specific behavior). See [Character System](README.md#character-system) for the full reference.

**Can characters evolve over a conversation?**
Yes. The `USERRELATION` section and character profile are updated with each memory compression cycle, reflecting how the relationship and character have developed.

**Can I share or reuse character profiles across sessions?**
Yes. Character profiles are plain text files in `/characters/`. Copy, edit, or share them freely.

---

## Sessions

**Are conversations saved automatically?**
Yes. The session state — including all memory tiers, the conversation history, clothing, location, and date — is saved to disk after every message.

**How do I resume a previous conversation?**
Select the session from the dropdown in the UI, or use `node cli-chat.js --session <sessionId>` from the terminal.

**How many sessions can I have?**
Unlimited. Up to 20 sessions are kept in memory for fast access (LRU cache); the rest are read from disk on demand.

**Can I delete old sessions?**
Yes — via the Session Manager in the UI, or in bulk using `node tools/delete-sessions.js`. See [Session Analysis Tools](README.md#session-analysis-tools).

**What does a session file contain?**
The session ID, timestamp, full memory state (all three tiers), complete conversation history, the current character profile, and the user profile — everything needed to restore the conversation exactly.

---

## Configuration & Models

**Which Claude models does Persona support?**
Claude 4.5/6 Sonnet (default) or Claude 4.5/6 Haiku. The default can be set in `.env` via `MODEL_DEFAULT`, with per-operation overrides for chat, compression, character creation, and scene generation.

**Can I use a cheaper/faster model for background tasks?**
Yes. Set `MODEL_COMPRESSION=claude-haiku-4-5-20251001` in `.env` to use Haiku for memory compression while keeping Sonnet for chat. However that does not happen very often and the savings are minimal

**What does `DEBUG_MODE` do?**
Enables verbose server-side logging: memory states before/after operations, full API request/response details, compression statistics, and session cache activity.

---

## Privacy & Security

**Where is my conversation data stored?**
Locally, in the `memory-storage/` directory as JSON files. Nothing is sent anywhere except the Anthropic API for AI inference.

**Does Anthropic store my conversations?**
Subject to [Anthropic's API usage policy](https://www.anthropic.com/legal/privacy). If privacy is critical, review their data retention terms.

**Is the web UI accessible to anyone?**
Only if you expose the server to the network without setting `AUTH_USERNAME`/`AUTH_PASSWORD`. For local-only use, no authentication is needed.

---

## Troubleshooting

**I'm getting 529 errors from the API.**
The Anthropic API is temporarily overloaded. Persona automatically retries with exponential backoff (2s, 4s, 8s). If errors persist, wait a moment and try again.

**Memory compression failed — what happened?**
Compression requires at least 5 long-term memories. If the API call fails, Persona preserves the original memories and skips compression silently. Check server logs with `DEBUG_MODE=true` for details.

**The character's response includes raw JSON at the end.**
This means memory extraction partially failed. The JSON should be stripped automatically. If it persists, check `anthropic-chat-client.js` for `JsonExtractor` errors in the logs.

**A session isn't loading / returns 404.**
The session file may have been deleted or the ID is incorrect. Use `GET /api/sessions` to list all valid session IDs.

**The server starts but the UI is blank.**
Make sure `public/index.html` exists and the server is running on the expected port. Check the browser console for CORS or CSP errors.

**How do I report a bug or request a feature?**
Open an issue on [GitHub](https://github.com/erichrutz/persona/issues).
