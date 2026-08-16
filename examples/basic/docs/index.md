# Example Manual

This small manual demonstrates the portable renderer configuration. Its version is
`${EXAMPLE_VERSION}`.

> [!note] One source tree
> The same normalized Markdown model produces the offline HTML and A4 PDF outputs.

```mermaid
flowchart LR
  Markdown[Markdown folder] --> Renderer[Manual renderer]
  Renderer --> HTML[Offline HTML]
  Renderer --> PDF[A4 PDF]
```

Continue with [[Getting Started]].
