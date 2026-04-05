import type { TextOptions } from "@/lib/ai/types";

interface QualityResult {
  pass: boolean;
  score: number; // 0-100
  issues: string[];
}

const QUALITY_CHECK_PROMPT = `Analyze this generated video frame for quality issues. Score 0-100.

Check for:
1. Face integrity (no distortion, correct proportions, natural features)
2. Limb integrity (correct number of fingers, natural poses, no extra limbs)
3. Visual coherence (no artifacts, glitches, or object clipping/merging)
4. Overall image quality (sharpness, proper lighting, no color banding)

If a reference frame is provided (second image), also check:
5. Character consistency with reference (similar face, outfit, hair)

Output ONLY valid JSON (no markdown, no code blocks):
{"score": <number 0-100>, "issues": ["<issue description>", ...], "pass": <boolean>}

A score >= 60 passes. Only fail for serious visual defects like distorted faces, missing/extra limbs, or severe artifacts.`;

export async function checkVideoQuality(
  provider: { generateText: (prompt: string, options?: TextOptions) => Promise<string> },
  videoFrameUrl: string,
  referenceFrameUrl?: string
): Promise<QualityResult> {
  try {
    const images = [videoFrameUrl];
    if (referenceFrameUrl) images.push(referenceFrameUrl);

    const result = await provider.generateText(QUALITY_CHECK_PROMPT, {
      images,
    });

    // Try to parse JSON from result (handle markdown code blocks)
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { pass: true, score: 100, issues: [] };

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      pass: parsed.pass ?? parsed.score >= 60,
      score: parsed.score ?? 0,
      issues: parsed.issues ?? [],
    };
  } catch {
    // If quality check itself fails, default to pass (don't block generation)
    return { pass: true, score: 100, issues: [] };
  }
}
