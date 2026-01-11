#!/usr/bin/env node

const readline = require('readline');
const fetch = require('node-fetch');
const { marked } = require('marked');
const { markedTerminal } = require('marked-terminal');

// Configure marked for terminal rendering
marked.use(markedTerminal());

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';
let sessionId = null;
let characterName = 'Character';
let characterProfile = '';
let memoryState = null;
let messageCount = 0;
let showingInfo = false;

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--session' && args[i + 1]) {
            sessionId = args[i + 1];
            i++;
        } else if (args[i] === '--server' && args[i + 1]) {
            SERVER_URL = args[i + 1];
            i++;
        }
    }
}

// API call to load session
async function loadSession(sessionId) {
    try {
        const response = await fetch(`${SERVER_URL}/api/session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sessionId }),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        throw new Error(`Failed to load session: ${error.message}`);
    }
}

// API call to send message
async function sendMessage(message) {
    try {
        const response = await fetch(`${SERVER_URL}/api/message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                sessionId,
                message
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        throw new Error(`Failed to send message: ${error.message}`);
    }
}

// API call to get memory stats
async function getMemoryStats() {
    try {
        const response = await fetch(`${SERVER_URL}/api/memory/${sessionId}`);
        if (!response.ok) {
            return null;
        }
        const data = await response.json();
        return data;
    } catch (error) {
        return null;
    }
}

// Display functions
function clearScreen() {
    console.log('\x1b[2J\x1b[0f');
}

function printHeader() {
    console.log('');
    console.log(`[Session ${sessionId.slice(-8)}] ${characterName}`);
    console.log('');
}

function printInfoPanel() {
    const stats = memoryState || {};
    const longTermCount = stats.longTerm ? stats.longTerm.length : 0;
    const apiCalls = stats.compressionMetadata?.apiCallsSinceLastCompression || 0;
    const lastCompression = stats.compressionMetadata?.lastCompressionTime || 'Never';
    const model = 'claude-3-7-sonnet-20250219';

    console.log('');
    console.log('--- Session Information ---');
    console.log(`  ID:          ${sessionId}`);
    console.log(`  Character:   ${characterName}`);
    console.log(`  Messages:    ${messageCount}`);
    console.log(`  API Calls:   ${apiCalls}`);
    console.log(`  Memory:      ${longTermCount} entries`);
    console.log(`  Compressed:  ${lastCompression}`);
    console.log(`  Model:       ${model}`);
    console.log('');
}

function printDisguisePanel() {
    // Generate random fake system stats
    const cpu = Math.floor(Math.random() * 60 + 20);
    const memUsed = (Math.random() * 4 + 1).toFixed(1);
    const memTotal = 16;
    const packets = Math.floor(Math.random() * 200 + 50);
    const diskRead = Math.floor(Math.random() * 80 + 10);
    const diskWrite = Math.floor(Math.random() * 30 + 5);
    const pid = Math.floor(Math.random() * 50000 + 10000);
    const uptimeHours = Math.floor(Math.random() * 10);
    const uptimeMinutes = Math.floor(Math.random() * 60);

    console.log('');
    console.log('--- System Monitor ---');
    console.log(`  CPU Usage:    ${cpu}%`);
    console.log(`  Memory:       ${memUsed}GB / ${memTotal}GB`);
    console.log(`  Network:      ${packets} pkt/s`);
    console.log(`  Disk Read:    ${diskRead} MB/s`);
    console.log(`  Disk Write:   ${diskWrite} MB/s`);
    console.log(`  Process ID:   ${pid}`);
    console.log(`  Uptime:       ${uptimeHours}h ${uptimeMinutes}m`);
    console.log('');
}

function printProfilePanel() {
    console.log('');
    console.log(`--- Character Profile: ${characterName} ---`);
    console.log('');
    if (characterProfile) {
        const lines = characterProfile.split('\n');
        for (const line of lines) {
            console.log(`  ${line}`);
        }
    } else {
        console.log('  No profile loaded');
    }
    console.log('');
}

function redrawConversation(history) {
    clearScreen();
    printHeader();

    // Display conversation history
    for (const entry of history) {
        console.log(`> ${entry.user}`);
        console.log('');
        const lines = marked(entry.character).split('\n');
        for (const line of lines) {
            if (line.trim()) {
                console.log(`  ${line}`);
            }
        }
        console.log('');
    }
}

// Main chat loop
async function startChat() {
    // Enable raw mode for hotkey detection
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.setRawMode) {
        process.stdin.setRawMode(true);
    }

    let currentLine = '';
    let infoDisplayed = false;
    let disguiseDisplayed = false;
    let profileDisplayed = false;
    let conversationHistory = []; // Store message pairs for redisplay
    let messageHistory = []; // Store user input history for arrow navigation
    let historyIndex = -1; // Current position in history (-1 = no history navigation)
    let cursorPos = 0; // Cursor position in current line

    // Handle keypress for hotkeys
    process.stdin.on('keypress', async (str, key) => {
        if (!key) return;

        if (key.ctrl && key.name === 'c') {
            console.log('\n\nExiting...');
            process.exit(0);
        } else if (key.name === 'up') {
            // Navigate backwards in history
            if (messageHistory.length > 0) {
                if (historyIndex < messageHistory.length - 1) {
                    historyIndex++;
                    // Clear current line
                    process.stdout.write('\r\x1b[K');
                    process.stdout.write('> ');
                    currentLine = messageHistory[messageHistory.length - 1 - historyIndex];
                    cursorPos = currentLine.length;
                    process.stdout.write(currentLine);
                }
            }
        } else if (key.name === 'down') {
            // Navigate forwards in history
            if (historyIndex > 0) {
                historyIndex--;
                // Clear current line
                process.stdout.write('\r\x1b[K');
                process.stdout.write('> ');
                currentLine = messageHistory[messageHistory.length - 1 - historyIndex];
                cursorPos = currentLine.length;
                process.stdout.write(currentLine);
            } else if (historyIndex === 0) {
                // Back to empty input
                historyIndex = -1;
                process.stdout.write('\r\x1b[K');
                process.stdout.write('> ');
                currentLine = '';
                cursorPos = 0;
            }
        } else if (key.name === 'left') {
            // Move cursor left
            if (cursorPos > 0) {
                cursorPos--;
                process.stdout.write('\x1b[D');
            }
        } else if (key.name === 'right') {
            // Move cursor right
            if (cursorPos < currentLine.length) {
                cursorPos++;
                process.stdout.write('\x1b[C');
            }
        } else if (key.ctrl && key.name === 'd') {
            // Toggle info panel (Ctrl+D - "Debug/Details")
            if (!infoDisplayed) {
                infoDisplayed = true;
                disguiseDisplayed = false;
                profileDisplayed = false;

                // Fetch latest memory stats
                const stats = await getMemoryStats();
                if (stats) {
                    memoryState = stats;
                }

                console.log(''); // New line
                printInfoPanel();
                process.stdout.write(`> ${currentLine}`);
            } else {
                infoDisplayed = false;
                profileDisplayed = false;
                clearScreen();
                printHeader();
                process.stdout.write(`> ${currentLine}`);
            }
        } else if (key.ctrl && key.name === 'b') {
            // Toggle disguise mode - completely hides chat and shows only fake diagnostics
            if (!disguiseDisplayed) {
                disguiseDisplayed = true;
                infoDisplayed = false;
                profileDisplayed = false;

                clearScreen();
                printDisguisePanel();
            } else {
                disguiseDisplayed = false;

                // Restore conversation
                redrawConversation(conversationHistory);
                process.stdout.write(`> ${currentLine}`);
            }
        } else if (key.ctrl && key.name === 'p') {
            // Toggle character profile panel
            if (!profileDisplayed) {
                profileDisplayed = true;
                infoDisplayed = false;
                disguiseDisplayed = false;

                console.log(''); // New line
                printProfilePanel();
                process.stdout.write(`> ${currentLine}`);
            } else {
                profileDisplayed = false;
                clearScreen();
                printHeader();
                process.stdout.write(`> ${currentLine}`);
            }
        } else if (key.name === 'return') {
            // Handle message send
            console.log(''); // New line after input

            if (currentLine.trim()) {
                const userMessage = currentLine.trim();

                // Add to message history for arrow key navigation
                messageHistory.push(userMessage);
                historyIndex = -1; // Reset history position

                currentLine = '';
                cursorPos = 0;

                try {
                    // Send message
                    const response = await sendMessage(userMessage);

                    // Update state
                    if (response.memoryState) {
                        memoryState = response.memoryState;
                    }
                    if (response.characterProfile) {
                        characterProfile = response.characterProfile;
                    }
                    messageCount++;

                    // Display response with markdown rendering
                    console.log('');
                    const lines = marked(response.response).split('\n');
                    for (const line of lines) {
                        if (line.trim()) {
                            console.log(`  ${line}`);
                        }
                    }
                    console.log('');

                    // Store in conversation history for redraw
                    conversationHistory.push({
                        user: userMessage,
                        character: response.response
                    });

                } catch (error) {
                    console.log(`\n[ERROR] ${error.message}\n`);
                }

                // Reset info displays
                infoDisplayed = false;
                disguiseDisplayed = false;
                profileDisplayed = false;
            }

            // Show prompt
            process.stdout.write('> ');

        } else if (key.name === 'backspace' || key.name === 'delete') {
            if (cursorPos > 0) {
                // Remove character at cursor position
                currentLine = currentLine.slice(0, cursorPos - 1) + currentLine.slice(cursorPos);
                cursorPos--;

                // Redraw line from cursor position
                process.stdout.write('\b');
                process.stdout.write(currentLine.slice(cursorPos) + ' ');

                // Move cursor back to correct position
                const remaining = currentLine.length - cursorPos + 1;
                for (let i = 0; i < remaining; i++) {
                    process.stdout.write('\b');
                }
            }
        } else if (str && !key.ctrl && !key.meta) {
            // Insert character at cursor position
            currentLine = currentLine.slice(0, cursorPos) + str + currentLine.slice(cursorPos);
            cursorPos++;

            // Redraw from cursor position
            process.stdout.write(currentLine.slice(cursorPos - 1));

            // Move cursor back to correct position
            const remaining = currentLine.length - cursorPos;
            for (let i = 0; i < remaining; i++) {
                process.stdout.write('\b');
            }
        }
    });

    // Initial display
    clearScreen();
    printHeader();
    process.stdout.write('> ');
}

// Main execution
async function main() {
    parseArgs();

    if (!sessionId) {
        console.error('Error: --session parameter is required');
        console.error('Usage: node cli-chat.js --session <session_id>');
        process.exit(1);
    }

    console.log('Loading session...');

    try {
        const sessionData = await loadSession(sessionId);

        if (sessionData.characterName) {
            characterName = sessionData.characterName;
        }
        if (sessionData.characterProfile) {
            characterProfile = sessionData.characterProfile;
        }

        // Get initial memory state
        const stats = await getMemoryStats();
        if (stats) {
            memoryState = stats;
        }

        // Start chat interface
        await startChat();

    } catch (error) {
        console.error(`[ERROR] ${error.message}`);
        console.error('\nMake sure the server is running (npm start)');
        process.exit(1);
    }
}

// Run
main();
