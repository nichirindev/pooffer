# 05 — Export & Performance

## Responsibility

Handle:

- Desmos output
- Equation optimization
- File export
- Web Workers
- WebAssembly
- Large images
- Performance monitoring

## Desmos Output

The final representation should be convertible into Desmos-compatible expressions.

Examples:

### Circle

```text
(x-2)^2+(y+1)^2=9
```

### Parametric

```text
x=f(t)
y=g(t)
0≤t≤1
```

### Piecewise

```text
y=f(x){0≤x≤2}
```

## Export Formats

### Plain Text

```text
output.txt
```

Contains one expression per line.

### JSON

```text
output.json
```

Contains:

- Project settings
- Layers
- Equations
- Metadata

### Project File

```text
project.desmosimg
```

Used to reopen the project later.

## Copy to Clipboard

Provide:

```text
[ Copy All ]
```

and:

```text
[ Copy Equation ]
```

## Desmos Integration

The product should distinguish between:

1. Generated equations
2. Preview renderer
3. Actual Desmos-compatible output

Do not tightly couple the mathematical engine to a particular UI.

## Equation Limits

Very complex images may generate thousands of expressions.

The optimizer should support:

```text
Maximum equations:
50
100
250
500
1000
Custom
```

## Optimization

Target:

```text
High visual similarity
+
Low equation count
+
Fast generation
```

Possible strategies:

- Remove redundant curves
- Merge adjacent segments
- Prefer Bézier curves over many lines
- Prefer circles for circular contours
- Simplify numeric coefficients
- Reduce unnecessary precision
- Merge compatible pieces

## Performance Pipeline

```text
UI
 ↓
Web Worker
 ↓
Image Processing
 ↓
Geometry
 ↓
Curve Fitting
 ↓
Optimization
 ↓
Serialization
 ↓
UI
```

The main thread should remain responsive.

## Web Workers

Heavy operations should run outside the main UI thread.

Candidates:

- Image decoding
- Edge detection
- Contour extraction
- RDP simplification
- Curve fitting
- Equation optimization

## OffscreenCanvas

Where supported, use OffscreenCanvas for image processing and previews.

## WebAssembly

If TypeScript/JavaScript becomes too slow:

```text
React
 ↓
Web Worker
 ↓
WASM
 ↓
Native-speed algorithms
```

Potential WASM languages:

- Rust
- C++
- AssemblyScript

Move only computationally expensive sections into WASM.

## Performance Targets

Initial targets:

### Small image

```text
512 × 512
< 1 second
```

### Medium image

```text
1024 × 1024
< 3 seconds
```

### Large image

```text
2048 × 2048
< 10 seconds
```

These are engineering targets, not guaranteed results. Measure actual performance during development.

## Memory Management

Avoid unnecessary copies of large images.

Prefer:

- Typed arrays
- Reusable buffers
- Streaming where practical
- Downsampling before expensive processing

## Progress Reporting

The worker should report progress:

```text
Processing...

██████████████░░░░ 72%

Fitting mathematical curves...
```

Stages:

```text
Loading
Preprocessing
Detecting edges
Extracting contours
Simplifying
Fitting curves
Optimizing
Generating equations
Complete
```

## Error Handling

Possible failures:

- Unsupported image
- Corrupt image
- Too-large image
- No detectable contours
- Too many contours
- Processing timeout
- Memory exhaustion

Provide useful messages instead of generic errors.

Example:

> No strong contours were detected. Try increasing contrast or changing the threshold.

## Performance Instrumentation

Track:

```ts
type PerformanceStats = {
  decodeMs: number;
  preprocessingMs: number;
  contourMs: number;
  simplificationMs: number;
  fittingMs: number;
  optimizationMs: number;
  exportMs: number;
  totalMs: number;
};
```

## Long-Term Architecture

```text
                 FRONTEND
                    │
                    ▼
              Processing API
                    │
             ┌──────┴──────┐
             ▼             ▼
        TypeScript        WASM
         Engine           Engine
             │             │
             └──────┬──────┘
                    ▼
              Equation IR
                    │
                    ▼
             Desmos Export
```

The important design rule is:

> The mathematical representation should remain independent from the rendering and export layer.

That allows future support for:

- Desmos
- SVG
- GeoGebra
- TikZ
- JSON
- Custom graph renderers
