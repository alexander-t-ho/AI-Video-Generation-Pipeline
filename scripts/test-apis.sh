#!/bin/bash

# API Testing Script - Person 1: Storyboard & Image Generation
# This script tests all API endpoints with curl commands

BASE_URL="${BASE_URL:-http://localhost:3000}"
PROJECT_ID="test-proj-$(date +%s)"

echo "=========================================="
echo "API Testing Script"
echo "=========================================="
echo "Base URL: $BASE_URL"
echo "Project ID: $PROJECT_ID"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print test header
print_test() {
    echo ""
    echo -e "${YELLOW}=========================================="
    echo -e "Test: $1"
    echo -e "==========================================${NC}"
}

# Function to print success
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Function to print error
print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# ============================================================================
# Test 1: Storyboard Generation - Luxury Watch
# ============================================================================
print_test "1. Storyboard Generation - Luxury Watch"

RESPONSE=$(curl -s -X POST "$BASE_URL/api/storyboard" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Luxury watch advertisement with golden hour lighting and elegant models",
    "targetDuration": 15
  }')

echo "Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

SUCCESS=$(echo "$RESPONSE" | jq -r '.success' 2>/dev/null)
if [ "$SUCCESS" = "true" ]; then
    print_success "Storyboard generated successfully"
    SCENE_COUNT=$(echo "$RESPONSE" | jq '.scenes | length' 2>/dev/null)
    echo "  Scenes: $SCENE_COUNT"
else
    print_error "Storyboard generation failed"
    ERROR=$(echo "$RESPONSE" | jq -r '.error' 2>/dev/null)
    echo "  Error: $ERROR"
fi

# ============================================================================
# Test 2: Storyboard Generation - Energy Drink
# ============================================================================
print_test "2. Storyboard Generation - Energy Drink"

RESPONSE=$(curl -s -X POST "$BASE_URL/api/storyboard" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Energy drink ad with extreme sports, skateboarding, vibrant colors",
    "targetDuration": 15
  }')

echo "Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

SUCCESS=$(echo "$RESPONSE" | jq -r '.success' 2>/dev/null)
if [ "$SUCCESS" = "true" ]; then
    print_success "Storyboard generated successfully"
else
    print_error "Storyboard generation failed"
fi

# ============================================================================
# Test 3: Storyboard Generation - Skincare
# ============================================================================
print_test "3. Storyboard Generation - Skincare"

RESPONSE=$(curl -s -X POST "$BASE_URL/api/storyboard" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Minimalist skincare product on clean white background with soft lighting",
    "targetDuration": 15
  }')

echo "Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

SUCCESS=$(echo "$RESPONSE" | jq -r '.success' 2>/dev/null)
if [ "$SUCCESS" = "true" ]; then
    print_success "Storyboard generated successfully"
    # Extract first scene's image prompt for image generation test
    IMAGE_PROMPT=$(echo "$RESPONSE" | jq -r '.scenes[0].imagePrompt' 2>/dev/null)
    echo "  First scene image prompt: ${IMAGE_PROMPT:0:80}..."
else
    print_error "Storyboard generation failed"
fi

# ============================================================================
# Test 4: Storyboard Error - Missing Prompt
# ============================================================================
print_test "4. Storyboard Error Handling - Missing Prompt"

RESPONSE=$(curl -s -X POST "$BASE_URL/api/storyboard" \
  -H "Content-Type: application/json" \
  -d '{
    "targetDuration": 15
  }')

echo "Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

SUCCESS=$(echo "$RESPONSE" | jq -r '.success' 2>/dev/null)
if [ "$SUCCESS" = "false" ]; then
    print_success "Error handling works correctly"
    CODE=$(echo "$RESPONSE" | jq -r '.code' 2>/dev/null)
    echo "  Error code: $CODE"
else
    print_error "Should have returned an error"
fi

# ============================================================================
# Test 5: Storyboard Error - Invalid Duration
# ============================================================================
print_test "5. Storyboard Error Handling - Invalid Duration"

RESPONSE=$(curl -s -X POST "$BASE_URL/api/storyboard" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Test prompt",
    "targetDuration": 5
  }')

echo "Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

SUCCESS=$(echo "$RESPONSE" | jq -r '.success' 2>/dev/null)
if [ "$SUCCESS" = "false" ]; then
    print_success "Error handling works correctly"
else
    print_error "Should have returned an error"
fi

# ============================================================================
# Test 6: Image Generation - Scene 0 (No Seed)
# ============================================================================
print_test "6. Image Generation - Scene 0 (No Seed)"

RESPONSE=$(curl -s -X POST "$BASE_URL/api/generate-image" \
  -H "Content-Type: application/json" \
  -d "{
    \"prompt\": \"Professional product photography of luxury watch, golden hour lighting, elegant composition, minimalist aesthetic, 16:9 aspect ratio\",
    \"projectId\": \"$PROJECT_ID\",
    \"sceneIndex\": 0
  }")

echo "Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

SUCCESS=$(echo "$RESPONSE" | jq -r '.success' 2>/dev/null)
if [ "$SUCCESS" = "true" ]; then
    print_success "Image prediction created"
    PREDICTION_ID=$(echo "$RESPONSE" | jq -r '.predictionId' 2>/dev/null)
    echo "  Prediction ID: $PREDICTION_ID"
    
    # Poll for completion
    echo ""
    echo "Polling for image completion..."
    MAX_ATTEMPTS=15
    ATTEMPT=0
    
    while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
        sleep 2
        ATTEMPT=$((ATTEMPT + 1))
        
        STATUS_RESPONSE=$(curl -s "$BASE_URL/api/generate-image/$PREDICTION_ID?projectId=$PROJECT_ID&sceneIndex=0&prompt=Professional%20product%20photography")
        STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.status' 2>/dev/null)
        
        echo "  Attempt $ATTEMPT/$MAX_ATTEMPTS: Status = $STATUS"
        
        if [ "$STATUS" = "succeeded" ]; then
            print_success "Image generation completed!"
            IMAGE_PATH=$(echo "$STATUS_RESPONSE" | jq -r '.image.localPath' 2>/dev/null)
            if [ "$IMAGE_PATH" != "null" ] && [ -n "$IMAGE_PATH" ]; then
                echo "  Image saved to: $IMAGE_PATH"
                if [ -f "$IMAGE_PATH" ]; then
                    print_success "Image file exists"
                else
                    print_error "Image file not found at path"
                fi
            fi
            break
        elif [ "$STATUS" = "failed" ]; then
            ERROR=$(echo "$STATUS_RESPONSE" | jq -r '.error' 2>/dev/null)
            print_error "Image generation failed: $ERROR"
            break
        fi
    done
    
    if [ "$STATUS" != "succeeded" ] && [ "$STATUS" != "failed" ]; then
        print_error "Image generation timeout"
    fi
else
    print_error "Image prediction creation failed"
    ERROR=$(echo "$RESPONSE" | jq -r '.error' 2>/dev/null)
    echo "  Error: $ERROR"
fi

# ============================================================================
# Test 7: Image Generation Error - Missing Fields
# ============================================================================
print_test "7. Image Generation Error Handling - Missing projectId"

RESPONSE=$(curl -s -X POST "$BASE_URL/api/generate-image" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Test prompt",
    "sceneIndex": 0
  }')

echo "Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

SUCCESS=$(echo "$RESPONSE" | jq -r '.success' 2>/dev/null)
if [ "$SUCCESS" = "false" ]; then
    print_success "Error handling works correctly"
    CODE=$(echo "$RESPONSE" | jq -r '.code' 2>/dev/null)
    echo "  Error code: $CODE"
else
    print_error "Should have returned an error"
fi

# ============================================================================
# Test 8: Image Generation Error - Invalid Scene Index
# ============================================================================
print_test "8. Image Generation Error Handling - Invalid Scene Index"

RESPONSE=$(curl -s -X POST "$BASE_URL/api/generate-image" \
  -H "Content-Type: application/json" \
  -d "{
    \"prompt\": \"Test prompt\",
    \"projectId\": \"$PROJECT_ID\",
    \"sceneIndex\": 10
  }")

echo "Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

SUCCESS=$(echo "$RESPONSE" | jq -r '.success' 2>/dev/null)
if [ "$SUCCESS" = "false" ]; then
    print_success "Error handling works correctly"
else
    print_error "Should have returned an error"
fi

# ============================================================================
# Test 9: Image Status - Invalid Prediction ID
# ============================================================================
print_test "9. Image Status Error Handling - Invalid Prediction ID"

RESPONSE=$(curl -s "$BASE_URL/api/generate-image/invalid-prediction-id-12345")

echo "Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

SUCCESS=$(echo "$RESPONSE" | jq -r '.success' 2>/dev/null)
if [ "$SUCCESS" = "false" ]; then
    print_success "Error handling works correctly"
    CODE=$(echo "$RESPONSE" | jq -r '.code' 2>/dev/null)
    echo "  Error code: $CODE"
else
    print_error "Should have returned an error"
fi

# ============================================================================
# Test 10: Health Checks
# ============================================================================
print_test "10. Health Check - Storyboard API"

RESPONSE=$(curl -s "$BASE_URL/api/storyboard")
echo "Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

print_test "11. Health Check - Image Generation API"

RESPONSE=$(curl -s "$BASE_URL/api/generate-image")
echo "Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

# ============================================================================
# Summary
# ============================================================================
echo ""
echo "=========================================="
echo "Testing Complete"
echo "=========================================="
echo "Project ID used: $PROJECT_ID"
echo ""
echo "To test manually, use these curl commands:"
echo ""
echo "# Storyboard Generation:"
echo "curl -X POST $BASE_URL/api/storyboard \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"prompt\": \"Your prompt here\", \"targetDuration\": 15}'"
echo ""
echo "# Image Generation:"
echo "curl -X POST $BASE_URL/api/generate-image \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"prompt\": \"Your prompt\", \"projectId\": \"$PROJECT_ID\", \"sceneIndex\": 0}'"
echo ""
echo "# Poll Image Status:"
echo "curl '$BASE_URL/api/generate-image/PREDICTION_ID?projectId=$PROJECT_ID&sceneIndex=0'"
echo ""


