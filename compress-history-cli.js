#!/usr/bin/env node

// CLI tool to compress session history to narrative prose
// Usage: node compress-history-cli.js <sessionId> [--transfer] [--clear-history]

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { MemoryCompressor } = require('./memory-compressor.js');
require('dotenv').config();

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  gray: '\x1b[90m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log();
  log('═'.repeat(80), 'gray');
  log(`  ${title}`, 'bright');
  log('═'.repeat(80), 'gray');
  console.log();
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    log('History-to-Prose Compression Tool', 'bright');
    log('─'.repeat(80), 'gray');
    console.log();
    log('Usage:', 'yellow');
    console.log('  node compress-history-cli.js <sessionId> [options]');
    console.log();
    log('Options:', 'yellow');
    console.log('  --transfer              Transfer prose to deep memory after editing');
    console.log('  --clear-history         Clear history array after transfer');
    console.log('  --no-edit              Skip interactive editing');
    console.log('  --output <file>         Save prose to file instead of screen');
    console.log('  --help, -h             Show this help message');
    console.log();
    log('Examples:', 'yellow');
    console.log('  node compress-history-cli.js session_1768199702082_znap94ul');
    console.log('  node compress-history-cli.js session_xyz --transfer --clear-history');
    console.log('  node compress-history-cli.js session_xyz --output story.txt');
    console.log();
    process.exit(0);
  }

  const sessionId = args[0];
  const options = {
    transfer: args.includes('--transfer'),
    clearHistory: args.includes('--clear-history'),
    noEdit: args.includes('--no-edit'),
    output: args.includes('--output') ? args[args.indexOf('--output') + 1] : null
  };

  return { sessionId, options };
}

// Load session from storage
function loadSession(sessionId) {
  const sessionPath = path.join(__dirname, 'memory-storage', `${sessionId}.json`);

  if (!fs.existsSync(sessionPath)) {
    log(`Error: Session file not found: ${sessionPath}`, 'red');
    process.exit(1);
  }

  try {
    const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    return sessionData;
  } catch (error) {
    log(`Error loading session: ${error.message}`, 'red');
    process.exit(1);
  }
}

// Save session to storage
function saveSession(sessionId, sessionData) {
  const sessionPath = path.join(__dirname, 'memory-storage', `${sessionId}.json`);

  try {
    fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2), 'utf8');
    log(`✓ Session saved: ${sessionPath}`, 'green');
  } catch (error) {
    log(`Error saving session: ${error.message}`, 'red');
    process.exit(1);
  }
}

// Interactive editor using readline
async function editText(initialText) {
  log('Edit the prose text below. Type :wq to save and quit, or :q to quit without saving.', 'yellow');
  log('─'.repeat(80), 'gray');
  console.log(initialText);
  log('─'.repeat(80), 'gray');
  console.log();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    log('Choose action:', 'cyan');
    console.log('  [k] Keep as-is (no changes)');
    console.log('  [e] Edit in external editor (opens $EDITOR)');
    console.log('  [c] Cancel');
    console.log();

    rl.question('Enter choice [k/e/c]: ', (answer) => {
      rl.close();

      if (answer.toLowerCase() === 'k') {
        resolve({ edited: initialText, cancelled: false });
      } else if (answer.toLowerCase() === 'e') {
        // Create temp file
        const tmpFile = path.join(__dirname, '.history-prose-tmp.txt');
        fs.writeFileSync(tmpFile, initialText, 'utf8');

        const editor = process.env.EDITOR || 'nano';
        const { spawnSync } = require('child_process');

        log(`Opening in ${editor}...`, 'blue');
        const result = spawnSync(editor, [tmpFile], { stdio: 'inherit' });

        if (result.status === 0) {
          const editedText = fs.readFileSync(tmpFile, 'utf8');
          fs.unlinkSync(tmpFile);
          resolve({ edited: editedText, cancelled: false });
        } else {
          log('Editor exited with error', 'red');
          fs.unlinkSync(tmpFile);
          resolve({ edited: null, cancelled: true });
        }
      } else {
        log('Cancelled', 'yellow');
        resolve({ edited: null, cancelled: true });
      }
    });
  });
}

// Main execution
async function main() {
  const { sessionId, options } = parseArgs();

  logSection('History-to-Prose Compression Tool');

  log(`Session ID: ${sessionId}`, 'cyan');
  log(`Transfer to deep memory: ${options.transfer ? 'Yes' : 'No'}`, 'cyan');
  log(`Clear history after: ${options.clearHistory ? 'Yes' : 'No'}`, 'cyan');
  console.log();

  // Load session
  log('Loading session...', 'blue');
  const sessionData = loadSession(sessionId);

  const history = sessionData.memoryState?.history || sessionData.history;
  const characterName = sessionData.memoryState?.characterName || 'Character';
  const language = sessionData.language || 'english';

  if (!history || history.length === 0) {
    log('No history entries found in this session.', 'red');
    process.exit(1);
  }

  log(`✓ Loaded ${history.length} history entries`, 'green');
  log(`  Character: ${characterName}`, 'gray');
  log(`  Language: ${language}`, 'gray');

  // Get existing deep memory for context
  const existingDeepMemory = sessionData.memoryState?.deepMemory || '';
  if (existingDeepMemory && existingDeepMemory.trim() !== '') {
    log(`  Deep Memory: ${existingDeepMemory.length} chars (will be used as context)`, 'gray');
  } else {
    log('  Deep Memory: empty', 'gray');
  }

  // Initialize memory compressor
  logSection('Compressing History to Recap');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    log('Error: ANTHROPIC_API_KEY not found in environment', 'red');
    process.exit(1);
  }

  const compressor = new MemoryCompressor({
    apiKey,
    model: 'claude-3-7-sonnet-20250219',
    characterName,
    characterProfile: sessionData.characterProfile || '',
    userProfile: sessionData.userProfile || ''
  });

  log('Calling Claude API to generate recap (including deep memory as context)...', 'blue');
  const result = await compressor.compressHistoryToProse(
    history,
    characterName,
    language,
    existingDeepMemory
  );

  if (!result.success) {
    log(`Error: ${result.error || result.reason}`, 'red');
    process.exit(1);
  }

  log('✓ Prose generated successfully', 'green');
  console.log();
  log('Metadata:', 'yellow');
  console.log(`  Date range: ${result.metadata.dateRange}`);
  console.log(`  Entry count: ${result.metadata.entryCount}`);
  console.log(`  Original length: ${result.metadata.originalLength} chars`);
  console.log(`  Compressed length: ${result.metadata.compressedLength} chars`);
  console.log(`  Compression ratio: ${result.metadata.compressionRatio}`);

  // Output to file or display
  if (options.output) {
    fs.writeFileSync(options.output, result.prose, 'utf8');
    log(`✓ Prose saved to: ${options.output}`, 'green');
    console.log();
  } else {
    logSection('Generated Prose');
    console.log(result.prose);
    console.log();
  }

  // Interactive editing
  let finalProse = result.prose;
  if (!options.noEdit && !options.output) {
    logSection('Edit Prose');
    const editResult = await editText(result.prose);

    if (editResult.cancelled) {
      log('Operation cancelled', 'yellow');
      process.exit(0);
    }

    finalProse = editResult.edited;
    log('✓ Text finalized', 'green');
  }

  // Transfer to deep memory
  if (options.transfer) {
    logSection('Transferring to Deep Memory');

    const currentDeepMemory = sessionData.memoryState?.deepMemory || '';

    if (currentDeepMemory && currentDeepMemory.trim() !== '') {
      log('NOTE: Deep memory already contains data (was used as context for this recap):', 'yellow');
      log('─'.repeat(80), 'gray');
      console.log(currentDeepMemory.substring(0, 500) + (currentDeepMemory.length > 500 ? '...' : ''));
      log('─'.repeat(80), 'gray');
      console.log();

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      log('Choose how to update deep memory:', 'cyan');
      console.log('  [a] Append new recap to existing deep memory (recommended)');
      console.log('  [r] Replace deep memory with new recap only');
      console.log('  [c] Cancel transfer');
      console.log();

      const answer = await new Promise((resolve) => {
        rl.question('Enter choice [a/r/c]: ', (ans) => {
          rl.close();
          resolve(ans);
        });
      });

      if (answer.toLowerCase() === 'a') {
        finalProse = currentDeepMemory + '\n\n---\n\n' + finalProse;
        log('Appending new recap to existing deep memory', 'blue');
      } else if (answer.toLowerCase() === 'r') {
        log('Replacing deep memory with new recap only', 'blue');
      } else {
        log('Transfer cancelled', 'yellow');
        process.exit(0);
      }
    }

    sessionData.memoryState.deepMemory = finalProse;
    log('✓ Deep memory updated', 'green');

    if (options.clearHistory) {
      sessionData.memoryState.history = [];
      log(`✓ History cleared (${history.length} entries removed)`, 'green');
    }

    saveSession(sessionId, sessionData);
  }

  logSection('Complete');
  log('✓ Operation completed successfully', 'green');
  console.log();
}

// Run
main().catch((error) => {
  console.error();
  log('Fatal error:', 'red');
  console.error(error);
  process.exit(1);
});
