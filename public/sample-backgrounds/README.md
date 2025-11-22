# Sample Backgrounds

This directory contains pre-included background images that are automatically loaded and available in all projects.

## Adding a New Background

1. **Save the image file** in this directory (`public/sample-backgrounds/`)
   - Supported formats: JPG, PNG, WebP
   - Recommended naming: `descriptive-name-background.jpg`

2. **Update the manifest** in `backgrounds.json`:
   ```json
   {
     "id": "unique-id",
     "filename": "your-image.jpg",
     "name": "Display Name",
     "description": "Brief description of the background",
     "tags": ["tag1", "tag2", "tag3"]
   }
   ```

3. **Restart the app** to see the new background

## Current Backgrounds

### Studio Waves Background
- **File**: `studio-waves-background.jpg` ← **Save the provided image with this filename**
- **Description**: Dark studio background with flowing wave patterns
- **Best for**: Professional car photography, studio shots
- **Tags**: studio, dark, artistic, waves

## Image Requirements

- **Format**: JPG, PNG, or WebP
- **Resolution**: At least 1920x1080 (Full HD)
- **Aspect Ratio**: 16:9 recommended
- **File Size**: Under 5MB for best performance

## Usage

These backgrounds will automatically appear in:
- The Media Library > Backgrounds section
- The Scene Composition Panel > Background selection modal

Public backgrounds are marked with a "Public" label to distinguish them from user-uploaded backgrounds.
