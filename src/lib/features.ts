// Defaults for features that depend on the backend. See "Open decisions" in DESIGN.md.
// The backend has the final say through GET /api/capabilities (see useCapabilities).
// These values are only used until that answer arrives.
export const features = {
  // The "Create an image" tile. The mock backend makes SVG pictures with Claude.
  imageGeneration: true,
} as const;
