# 01 — Product Specification

## Vision

Create a polished tool that lets users upload an image and transform it into mathematical artwork that can be recreated in Desmos.

## Target Users

- Students learning mathematics
- Desmos creators
- Programmers
- Digital artists
- Mathematics enthusiasts
- People interested in generative art

## Core User Flow

```text
Upload Image
    ↓
Choose Mode
    ↓
Adjust Detail
    ↓
Process
    ↓
Inspect Result
    ↓
Edit / Optimize
    ↓
Export to Desmos
```

## Core Features

### Upload

- PNG
- JPG/JPEG
- WebP
- Drag and drop
- Clipboard paste where supported

### Processing Modes

#### Outline

Extract the visible boundaries of an image.

#### Silhouette

Convert the image into a binary shape.

#### Color

Separate the image into color regions.

#### Advanced

Approximate more complicated images using multiple mathematical layers.

## User Controls

- Detail
- Threshold
- Contrast
- Brightness
- Smoothing
- Curve tolerance
- Maximum equations
- Mathematical model preference
- Color mode

## Result Statistics

Display:

- Number of contours
- Number of points
- Number of equations
- Processing time
- Approximation error
- Similarity score

## Editor

The main editor should show:

```text
┌───────────────────────────────────────────┐
│ Original │ Mathematical Preview │ Settings│
├───────────────────────────────────────────┤
│                                           │
│             Graph / Image                │
│                                           │
├───────────────────────────────────────────┤
│ Equations                                │
│ y = ...                                  │
│ x = ...                                  │
└───────────────────────────────────────────┘
```

## Project Files

Projects should be saveable as:

```text
.desmosimg
```

Example:

```json
{
  "version": 1,
  "settings": {},
  "layers": [],
  "equations": []
}
```

## Privacy

Local processing should be preferred.

Images should not need to leave the user's machine for normal operation.

## Product Roadmap

### Phase 1

- Upload
- Grayscale
- Threshold
- Contours
- Point-based output

### Phase 2

- Contour simplification
- Line fitting
- Circle fitting
- Bézier fitting
- Parametric curves

### Phase 3

- Full editor
- Live preview
- Equation viewer
- Export
- Project files

### Phase 4

- Color
- Multiple layers
- Equation optimization

### Phase 5

- Web Workers
- WASM
- Large-image processing
- Sharing
- Gallery
