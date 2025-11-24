#!/bin/zsh
# convert-session-to-readable.sh
# Converts persona session JSON files to readable Markdown format

# Usage: ./convert-session-to-readable.sh <input-files...>
# Examples:
#   ./convert-session-to-readable.sh session_123.json
#   ./convert-session-to-readable.sh memory-storage/session_*.json
#   ./convert-session-to-readable.sh session_1.json session_2.json

set -e

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 is required but not installed."
    exit 1
fi

# Check if any files provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <input-files...>"
    echo "Examples:"
    echo "  $0 session_123.json"
    echo "  $0 memory-storage/session_*.json"
    echo "  $0 *.json"
    exit 1
fi

# Process each file
for INPUT_FILE in "$@"; do
    # Skip if file doesn't exist
    if [ ! -f "$INPUT_FILE" ]; then
        echo "⚠ Skipping non-existent file: $INPUT_FILE"
        continue
    fi
    
    echo "Processing: $INPUT_FILE"
    
    # Create temporary Python script
    TEMP_SCRIPT=$(mktemp /tmp/convert_session.XXXXXX.py)
    cat > "$TEMP_SCRIPT" << 'PYTHON_SCRIPT_END'
# -*- coding: utf-8 -*-
import json
import sys
import re
from datetime import datetime

input_file = sys.argv[1]

try:
    # Try UTF-8 first, fall back to latin-1 if needed
    data = None
    for encoding in ['utf-8', 'latin-1', 'utf-8-sig', 'cp1252']:
        try:
            with open(input_file, 'r', encoding=encoding) as f:
                data = json.load(f)
            break
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue
    
    if data is None:
        raise Exception("Could not decode file with any supported encoding")
    
    # Extract metadata
    char_profile = data.get('characterProfile', '')
    char_name = ''
    for line in char_profile.split('\n'):
        if line.startswith('NAME:'):
            char_name = line.split(':', 1)[1].strip()
            break
    
    user_profile = data.get('userProfile', '')
    user_name = ''
    for line in user_profile.split('\n'):
        if line.startswith('NAME:'):
            user_name = line.split(':', 1)[1].strip()
            break
    
    timestamp = data.get('timestamp', '')
    date = data.get('date', '')
    session_id = data.get('sessionId', '')
    
    # Format timestamp for filename
    if timestamp:
        dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        formatted_time = dt.strftime('%Y-%m-%d_%H-%M-%S')
    else:
        formatted_time = 'unknown'
    
    # Generate output filename
    import os
    output_dir = os.path.dirname(input_file)
    output_file = os.path.join(output_dir, f"{char_name}_{formatted_time}.md")
    
    # Start writing output
    with open(output_file, 'w', encoding='utf-8') as out:
        out.write(f"# {char_name} – Session {date}\n\n")
        out.write(f"**Session ID:** `{session_id}`  \n")
        out.write(f"**Gestartet:** {timestamp}\n\n")
        out.write("=" * 80 + "\n\n")
        
        # Process messages
        messages = data.get('messages', [])
        message_count = 0
        
        for i, msg in enumerate(messages):
            role = msg.get('role', '')
            content = msg.get('content', '')
            
            # Extract location and clothing from JSON block in assistant messages
            location = ''
            char_clothing = ''
            if role == 'assistant':
                # Try to extract JSON block (multi-line with nested braces)
                json_match = re.search(r'\n\s*\{.*?\}\s*$', content, flags=re.DOTALL)
                if json_match:
                    try:
                        json_str = json_match.group(0).strip()
                        memory_data = json.loads(json_str)
                        location = memory_data.get('location', '')
                        clothing_data = memory_data.get('clothing', {})
                        if isinstance(clothing_data, dict):
                            char_clothing = clothing_data.get('char', '')
                        else:
                            char_clothing = str(clothing_data)
                    except:
                        pass
                
                # Remove JSON memory block (everything from last opening brace to end)
                content = re.sub(r'\n\s*\{.*?\}\s*$', '', content, flags=re.DOTALL)
                
                # Remove date lines in format YYYY-MM-DD or YYYY-MM-DD YYYY-MM-DD
                content = re.sub(r'^\d{4}-\d{2}-\d{2}(?:\s+\d{4}-\d{2}-\d{2})?\s*', '', content, flags=re.MULTILINE)
            
            # Determine speaker with context
            if role == 'user':
                speaker = user_name
                context = ''
                prefix = "→"
            else:
                speaker = char_name
                prefix = "←"
                if location and char_clothing:
                    context = f"\n   📍 {location}\n   👗 {char_clothing}"
                elif location:
                    context = f"\n   📍 {location}"
                elif char_clothing:
                    context = f"\n   👗 {char_clothing}"
                else:
                    context = ''
            
            # Clean up content - remove excessive newlines and trim
            content = content.strip()
            content = re.sub(r'\n{3,}', '\n\n', content)
            
            # For user messages, clean up asterisks
            if role == 'user':
                # Split into lines
                lines = content.split('\n')
                # Remove first line if it's only asterisks/special chars
                if lines and re.match(r'^[\*\s]+$', lines[0]):
                    lines = lines[1:]
                # Remove any lines that are only asterisks
                lines = [line for line in lines if not re.match(r'^[\*\s]*$', line.strip())]
                content = '\n'.join(lines).strip()
                # Skip if empty after cleanup
                if not content:
                    continue
            
            # Write message with better formatting
            if message_count > 0:  # Add separator between messages
                out.write("\n")
            
            # Write speaker line - only if speaker has a name
            if speaker and speaker.strip():
                out.write(f"{prefix} **{speaker}**{context}\n\n")
            else:
                out.write(f"{prefix} **User**{context}\n\n")
            
            out.write(f"{content}\n")
            out.write("-" * 80 + "\n")
            
            message_count += 1
        
        # Add metadata section
        out.write("\n" + "=" * 80 + "\n")
        out.write("=" * 80 + "\n\n")
        out.write("## 📋 Session Details\n\n")
        out.write(f"**Character:** {char_name}  \n")
        out.write(f"**User:** {user_name}  \n")
        out.write(f"**Date:** {date}  \n")
        out.write(f"**Session ID:** {session_id}\n\n")
        
        # Short-term memory
        short_term = data.get('memoryState', {}).get('shortTerm', [])
        if short_term:
            out.write("### 🧠 Kurzzeitgedächtnis\n\n")
            for item in short_term:
                if isinstance(item, dict):
                    content = item.get('content', '')
                else:
                    content = str(item)
                if content:
                    out.write(f"• {content}\n")
            out.write("\n")
        
        # History
        history = data.get('history', [])
        if history:
            out.write("### 📜 Verlauf\n\n")
            for item in history:
                change = item.get('change', '')
                ts = item.get('timestamp', '')
                if change:
                    out.write(f"• {change}")
                    if ts:
                        out.write(f" _{ts}_")
                    out.write("\n")
            out.write("\n")
    
    print(f"✓ Converted: {output_file}")

except Exception as e:
    print(f"✗ Error processing {input_file}: {e}", file=sys.stderr)
    sys.exit(1)

PYTHON_SCRIPT_END

    # Execute the temporary script
    python3 "$TEMP_SCRIPT" "$INPUT_FILE"
    RESULT=$?
    
    # Cleanup
    rm "$TEMP_SCRIPT"
    
    if [ $RESULT -ne 0 ]; then
        continue
    fi

done

echo ""
echo "✅ All files processed!"
