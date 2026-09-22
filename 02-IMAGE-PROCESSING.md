# 02 — Image Processing

## Responsibility

Convert raw pixels into clean geometric information that the mathematics engine can understand.

## Pipeline

```text
Image
 ↓
Resize
 ↓
Color / Grayscale
 ↓
Noise Reduction
 ↓
Threshold
 ↓
Edge Detection
 ↓
Contour Extraction
 ↓
Contour Cleanup
 ↓
Normalized Geometry
```

## Stage 1 — Input

Supported formats:

- PNG
- JPEG
- WebP

Read the image into an internal pixel representation.

## Stage 2 — Resize

Large images should be resized before processing.

Goals:

- Reduce computation
- Keep important structure
- Provide predictable processing time

Example:

```text
4096 × 4096
      ↓
1024 × 1024
```

## Stage 3 — Grayscale

Convert RGB into luminance.

Conceptually:

```text
RGB
 ↓
Luminance
 ↓
Single intensity value
```

## Stage 4 — Thresholding

Convert grayscale into a binary image.

```text
pixel > threshold → white
pixel ≤ threshold → black
```

Eventually support:

- Global threshold
- Adaptive threshold

## Stage 5 — Noise Reduction

Possible operations:

- Gaussian blur
- Median filtering
- Morphological opening
- Morphological closing

The goal is to prevent tiny image artifacts from becoming mathematical curves.

## Stage 6 — Edge Detection

Detect important boundaries.

Candidate approach:

- Canny edge detection

Output:

```text
Image
 ↓
Edges
```

## Stage 7 — Contour Extraction

Convert edge pixels into ordered paths.

Internal representation:

```ts
type Point = {
  x: number;
  y: number;
};

type Contour = Point[];
```

## Stage 8 — Contour Cleanup

Remove:

- Tiny contours
- Duplicate contours
- Noise
- Self-intersections where possible
- Unnecessary points

## Stage 9 — Coordinate Normalization

Image coordinates:

```text
(0,0) ───────────► X
  │
  │
  ▼
  Y
```

should become graph coordinates:

```text
        Y
        ▲
        │
────────┼────────► X
        │
        │
```

Important considerations:

- Preserve aspect ratio
- Center the image
- Scale to a predictable graph range
- Flip the vertical axis when required

## Color Processing

For color images:

```text
Image
 ↓
Color Segmentation
 ↓
┌─────────┬─────────┬─────────┐
Red       Blue      Green
 ↓         ↓         ↓
Contours  Contours  Contours
```

Each layer should retain its own color.

## Quality Metrics

Track:

- Original pixels
- Processed pixels
- Contour count
- Total contour points
- Smallest contour size
- Largest contour size
- Processing time

## Future Improvements

- Automatic threshold selection
- Smart contour filtering
- Object segmentation
- Shape detection
- GPU acceleration
- WebAssembly implementation
