# 03 — Mathematics Engine

## Responsibility

Convert geometric contours into compact mathematical expressions.

This is the core intellectual component of the project.

## Pipeline

```text
Contour
 ↓
Simplification
 ↓
Segmentation
 ↓
Shape Detection
 ↓
Curve Fitting
 ↓
Error Measurement
 ↓
Model Selection
 ↓
Equation Generation
 ↓
Optimization
```

## Coordinate Model

```ts
type Point = {
  x: number;
  y: number;
};

type Contour = Point[];
```

## Contour Simplification

Implement the Ramer–Douglas–Peucker algorithm.

Goal:

```text
1000 points
     ↓
120 points
```

while keeping the shape visually similar.

The tolerance should be user-controlled.

## Segmentation

Break a contour into meaningful sections.

Example:

```text
Contour
 ↓
Line
Line
Curve
Circle
Curve
```

Each section can then use the mathematical representation most appropriate for it.

## Supported Mathematical Models

### Lines

```text
y = mx + b
```

### Circles

```text
(x - h)^2 + (y - k)^2 = r^2
```

### Ellipses

```text
(x-h)^2/a^2 + (y-k)^2/b^2 = 1
```

### Bézier Curves

Cubic Bézier curves:

```text
B(t) =
(1-t)^3 P0
+ 3(1-t)^2t P1
+ 3(1-t)t^2 P2
+ t^3 P3
```

### Parametric Curves

Represent arbitrary paths as:

```text
x = f(t)
y = g(t)
```

with a domain:

```text
0 ≤ t ≤ 1
```

### Piecewise Functions

For curves that can be represented as functions of x:

```text
y = f(x) {a ≤ x ≤ b}
y = g(x) {b ≤ x ≤ c}
```

## Curve Fitting

Each candidate model should produce an error value.

Example:

```text
Line error       = 0.83
Bezier error     = 0.12
Polynomial error = 0.09
```

The engine should choose based on:

- Error
- Equation complexity
- Number of parameters
- Number of expressions

Do not automatically choose the mathematically most complicated model.

## Optimization

The goal is:

```text
Maximum visual similarity
+
Minimum mathematical complexity
```

Conceptually:

```text
Score =
visual_error
+
complexity_penalty
```

## Equation Representation

Use an intermediate representation instead of directly generating strings.

Example:

```ts
type Equation =
  | {
      type: "line";
      m: number;
      b: number;
    }
  | {
      type: "circle";
      h: number;
      k: number;
      r: number;
    }
  | {
      type: "parametric";
      x: string;
      y: string;
      tMin: number;
      tMax: number;
    };
```

Then convert the representation into Desmos syntax.

## Equation Compression

Try to combine or remove unnecessary equations.

Example:

```text
Before:

100 tiny line segments

After:

1 Bézier curve
```

## Error Measurement

Potential metrics:

- Point-to-curve distance
- Hausdorff distance
- Mean squared error
- Pixel-level similarity

## Mathematical Testing

Create known fixtures:

```text
circle
square
triangle
star
spiral
heart
```

For each fixture, test:

```text
input
 ↓
contour
 ↓
fit
 ↓
equation
 ↓
reconstruction
```

## Future Mathematics

Potential additions:

- Fourier descriptors
- B-spline fitting
- NURBS
- Polynomial regression
- Shape recognition
- Automatic model selection
- Equation simplification
- Symbolic simplification
