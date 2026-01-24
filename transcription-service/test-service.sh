#!/bin/bash

# Test script for local Whisper transcription service
# This script verifies the service is running and can process audio

set -e

echo "🧪 Testing Whisper Transcription Service"
echo "========================================"
echo ""

# Check if service is running
echo "1. Checking if service is running on port 3001..."
if ! command -v curl &> /dev/null; then
    echo "❌ curl is not installed. Please install curl first."
    exit 1
fi

# Test health endpoint with timeout
if curl -s --connect-timeout 2 http://localhost:3001/health > /dev/null 2>&1; then
    echo "✓ Service is running"
else
    echo "❌ Service is not running. Start it with: npm start"
    exit 1
fi

echo ""
echo "2. Checking health endpoint..."
HEALTH=$(curl -s http://localhost:3001/health)
echo "Response: $HEALTH"

if echo "$HEALTH" | grep -q "ok"; then
    echo "✓ Health check passed"
else
    echo "❌ Health check failed"
    exit 1
fi

echo ""
echo "3. Creating test audio (sine wave, 5 seconds)..."

# Create a simple test audio file using FFmpeg if available, or skip
if command -v ffmpeg &> /dev/null; then
    ffmpeg -f lavfi -i "sine=f=440:d=5" -q:a 9 -acodec libmp3lame test-audio.mp3 2>/dev/null || {
        echo "⚠ Could not create test audio with ffmpeg"
        echo "   You can test with your own audio file:"
        echo "   curl -X POST -F \"audio=@your-audio.mp3\" http://localhost:3001/transcribe"
        exit 0
    }
    echo "✓ Test audio created: test-audio.mp3"
    
    echo ""
    echo "4. Testing transcription endpoint..."
    
    # Test transcription (may take a while on first run)
    echo "⏳ Sending transcription request (this may take 30+ seconds on first run)..."
    
    RESULT=$(curl -s -X POST -F "audio=@test-audio.mp3" http://localhost:3001/transcribe)
    
    if echo "$RESULT" | grep -q "transcription"; then
        echo "✓ Transcription successful!"
        echo ""
        echo "Response preview:"
        echo "$RESULT" | head -100
        
        # Clean up
        rm -f test-audio.mp3
        
        echo ""
        echo "✅ All tests passed!"
        echo ""
        echo "Your transcription service is working correctly."
        echo "You can now upload audio files through the Song Analyzer app."
    else
        echo "❌ Transcription failed"
        echo "Response: $RESULT"
        exit 1
    fi
else
    echo "⚠ FFmpeg not installed, skipping audio creation test"
    echo "   You can test manually with:"
    echo "   curl -X POST -F \"audio=@your-audio.mp3\" http://localhost:3001/transcribe"
fi

echo ""
echo "For more info, see WHISPER_LOCAL_SETUP.md"
