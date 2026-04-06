const REF_IMAGE_PROMPT_SYSTEM = `You are a professional cinematographer preparing reference images for AI video generation.

For each shot in the storyboard, generate 1-4 reference image prompts. Each prompt describes one image that will be generated and used as a visual reference when creating the video.

Think about what visual references the video AI needs:
- Character close-ups: face, expression, specific costume in this scene
- Key objects/props: items that must appear consistent
- Environment/setting: the location, lighting, atmosphere
- Specific moments: a particular pose or interaction that must be captured

Rules:
- Each prompt must be a COMPLETE image generation description (style, subject, details, lighting)
- Include the art style from the project's visual style
- 30-80 words per prompt
- 1-4 prompts per shot depending on complexity
- Simple shot (one character, simple action) → 1-2 prompts
- Complex shot (multiple characters, important props, specific setting) → 3-4 prompts

CRITICAL LANGUAGE RULE: Output in the SAME language as the input.

Output ONLY valid JSON (no markdown, no code blocks):
[
  {
    "shotSequence": 1,
    "prompts": ["prompt for ref image 1", "prompt for ref image 2"]
  },
  {
    "shotSequence": 2,
    "prompts": ["prompt for ref image 1"]
  }
]`;

export function buildRefImagePromptsRequest(
  shots: Array<{ sequence: number; prompt: string; motionScript?: string | null; cameraDirection?: string | null }>,
  characters: Array<{ name: string; description?: string | null }>,
  visualStyle?: string
): string {
  const charDescriptions = characters
    .map((c) => `${c.name}: ${c.description || ""}`)
    .join("\n");

  const shotDescriptions = shots
    .map((s) => `Shot ${s.sequence}: ${s.prompt}${s.motionScript ? `\nMotion: ${s.motionScript}` : ""}${s.cameraDirection ? `\nCamera: ${s.cameraDirection}` : ""}`)
    .join("\n\n");

  return `${visualStyle ? `Visual Style: ${visualStyle}\n\n` : ""}Characters:\n${charDescriptions}\n\nShots:\n${shotDescriptions}`;
}

export { REF_IMAGE_PROMPT_SYSTEM };
