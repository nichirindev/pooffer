# 04 — Frontend

## Responsibility

Build the complete user-facing application.

Recommended stack:

- React
- TypeScript
- Tailwind CSS
- Canvas
- Web Workers
- Vite

## Main Screens

### Home

Purpose:

- Explain the product
- Upload image
- Show examples
- Start a project

### Editor

Main workspace.

```text
┌─────────────────────────────────────────────┐
│ Image → Desmos                   Export      │
├─────────────┬─────────────────┬─────────────┤
│ Original    │ Graph Preview   │ Settings    │
│             │                 │             │
│   IMAGE     │     GRAPH       │ Accuracy    │
│             │                 │ Threshold   │
│             │                 │ Smoothing   │
├─────────────┴─────────────────┴─────────────┤
│ Processing Pipeline                          │
│ Original → Edges → Contours → Curves        │
├─────────────────────────────────────────────┤
│ Equations                                   │
│ x = ...                                     │
│ y = ...                                     │
└─────────────────────────────────────────────┘
```

## Components

```text
components/
├── ImageUploader
├── ImageViewer
├── ProcessingPreview
├── ContourViewer
├── GraphViewer
├── EquationList
├── EquationEditor
├── SettingsPanel
├── AccuracySlider
├── LayerPanel
├── StatisticsPanel
├── ExportPanel
└── Toolbar
```

## Image Viewer

Should support:

- Zoom
- Pan
- Fit to screen
- Original image
- Processed image
- Contours
- Mathematical curves

## Processing Visualization

Users should be able to switch between:

```text
Original
Grayscale
Threshold
Edges
Contours
Simplified
Fitted Curves
Final
```

This is important because it makes the algorithm understandable.

## Graph Viewer

The graph preview should display the generated mathematical representation over a coordinate plane.

Support:

- Zoom
- Pan
- Grid
- Axes
- Equation visibility
- Layer visibility

## Settings

Expose simple controls first.

### Detail

```text
Low ────────●──── High
```

### Threshold

```text
0 ──────────●──── 255
```

### Curve tolerance

```text
More accurate ←──────→ More compact
```

Advanced users can open an advanced panel.

## Equation Viewer

Each expression should have:

- Equation
- Type
- Layer
- Visibility toggle
- Copy button

Example:

```text
○ Circle

(x-2)^2+(y+1)^2=9

[Copy]
```

## State Management

Maintain project state separately from UI state.

```ts
type ProjectState = {
  image: ImageData;
  settings: ProcessingSettings;
  contours: Contour[];
  equations: Equation[];
  statistics: Statistics;
};
```

## Processing Architecture

Do not run expensive processing directly inside React rendering.

Use:

```text
React
 ↓
Processing Controller
 ↓
Web Worker
 ↓
Image / Math Engine
 ↓
Worker Result
 ↓
React State
```

## UX Principles

- Fast feedback
- Clear progress
- Never freeze the UI
- Show what the algorithm is doing
- Make complex math approachable
- Allow advanced controls without overwhelming beginners

## Responsive Design

Support:

- Desktop
- Tablet

The editor should prioritize desktop because mathematical editing benefits from screen space.

## Accessibility

Support:

- Keyboard navigation
- Focus states
- Screen-reader labels
- Reduced motion
- Sufficient contrast
- Accessible sliders

## Future Features

- Dark mode
- Project history
- Undo/redo
- Keyboard shortcuts
- Share links
- Public gallery
- Collaboration
