import { db } from "@/lib/db";
import { characters } from "@/lib/db/schema";
import { resolveImageProvider } from "@/lib/ai/provider-factory";
import type { ModelConfigPayload } from "@/lib/ai/provider-factory";
import { buildCharacterTurnaroundPrompt } from "@/lib/ai/prompts/character-image";
import { ratioToImageOpts } from "@/lib/ai/image-size";
import { eq } from "drizzle-orm";
import type { Task } from "@/lib/task-queue";

export async function handleCharacterImage(task: Task) {
  const payload = task.payload as { characterId: string; modelConfig?: ModelConfigPayload };

  const [character] = await db
    .select()
    .from(characters)
    .where(eq(characters.id, payload.characterId));

  if (!character) {
    throw new Error("Character not found");
  }

  const ai = resolveImageProvider(payload.modelConfig);
  const prompt = buildCharacterTurnaroundPrompt(character.description || character.name, character.name);
  const imgOpts = ratioToImageOpts(
    "16:9",
    payload.modelConfig?.image?.modelId,
    payload.modelConfig?.image?.baseUrl
  );

  const imagePath = await ai.generateImage(prompt, {
    ...imgOpts,
    quality: "hd",
  });

  await db
    .update(characters)
    .set({ referenceImage: imagePath })
    .where(eq(characters.id, payload.characterId));

  return { imagePath };
}
