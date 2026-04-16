import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  projects,
  episodes,
  characters,
  shots,
  dialogues,
  storyboardVersions,
  shotAssets,
  promptTemplates,
  importLogs,
  moodBoardImages,
  characterRelations,
  characterCostumes,
  scenes,
  shotActions,
} from "@/lib/db/schema";
import { eq, asc, and, desc, inArray } from "drizzle-orm";
import { getUserIdFromRequest } from "@/lib/get-user-id";
import { markDownstreamStale } from "@/lib/staleness";
import * as fs from "fs";
import * as path from "path";
import { createLogger } from "@/lib/logger";

const logger = createLogger("projects:id");

async function resolveProject(id: string, userId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)));
  return project ?? null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = getUserIdFromRequest(request);
  const project = await resolveProject(id, userId);

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const versionId = url.searchParams.get("versionId") ?? undefined;

  // Fetch all versions for this project (newest first)
  const allVersions = await db
    .select()
    .from(storyboardVersions)
    .where(eq(storyboardVersions.projectId, id))
    .orderBy(desc(storyboardVersions.versionNum));

  // Resolve which version to show shots for
  const resolvedVersionId = versionId ?? allVersions[0]?.id;

  // Fetch related data
  const projectCharacters = await db
    .select()
    .from(characters)
    .where(eq(characters.projectId, id));

  const projectShots = resolvedVersionId
    ? await db
        .select()
        .from(shots)
        .where(and(eq(shots.projectId, id), eq(shots.versionId, resolvedVersionId)))
        .orderBy(asc(shots.sequence))
    : [];

  // Bulk-load ALL shot assets (all versions, not just active) so the UI
  // can render version history arrows and switch between historical fileUrls.
  const { shotAssets } = await import("@/lib/db/schema");
  const { inArray, desc: descOrder } = await import("drizzle-orm");
  const assetRows = projectShots.length
    ? await db
        .select()
        .from(shotAssets)
        .where(inArray(shotAssets.shotId, projectShots.map((s) => s.id)))
        .orderBy(shotAssets.type, shotAssets.sequenceInType, descOrder(shotAssets.assetVersion))
    : [];
  const assetsByShot = new Map<string, typeof assetRows>();
  for (const row of assetRows) {
    if (!assetsByShot.has(row.shotId)) assetsByShot.set(row.shotId, []);
    assetsByShot.get(row.shotId)!.push(row);
  }

  // Enrich each shot with its dialogues + active asset rows
  const enrichedShots = await Promise.all(
    projectShots.map(async (shot) => {
      const shotDialogues = await db
        .select({
          id: dialogues.id,
          text: dialogues.text,
          characterId: dialogues.characterId,
          characterName: characters.name,
          sequence: dialogues.sequence,
        })
        .from(dialogues)
        .innerJoin(characters, eq(dialogues.characterId, characters.id))
        .where(eq(dialogues.shotId, shot.id))
        .orderBy(asc(dialogues.sequence));
      const assets = (assetsByShot.get(shot.id) ?? []).map((a) => ({
        id: a.id,
        shotId: a.shotId,
        type: a.type,
        sequenceInType: a.sequenceInType,
        assetVersion: a.assetVersion,
        isActive: a.isActive,
        prompt: a.prompt,
        fileUrl: a.fileUrl,
        status: a.status,
        characters: a.characters ? JSON.parse(a.characters) : null,
        modelProvider: a.modelProvider,
        modelId: a.modelId,
        meta: a.meta ? JSON.parse(a.meta) : null,
      }));
      return { ...shot, dialogues: shotDialogues, assets };
    })
  );

  // Fetch episodes for this project
  const projectEpisodes = await db
    .select()
    .from(episodes)
    .where(eq(episodes.projectId, id))
    .orderBy(asc(episodes.sequence));

  return NextResponse.json({
    ...project,
    episodes: projectEpisodes,
    characters: projectCharacters,
    shots: enrichedShots,
    versions: allVersions.map((v) => ({
      id: v.id,
      label: v.label,
      versionNum: v.versionNum,
      createdAt: v.createdAt instanceof Date ? Math.floor(v.createdAt.getTime() / 1000) : v.createdAt,
    })),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = getUserIdFromRequest(request);
  const project = await resolveProject(id, userId);

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as Partial<{
    title: string;
    idea: string;
    script: string;
    outline: string;
    status: "draft" | "processing" | "completed";
    generationMode: "keyframe" | "reference";
    useProjectPrompts: number;
    colorPalette: string;
    worldSetting: string;
    targetDuration: number;
    bgmUrl: string;
  }>;

  const { title, idea, script, outline, status, generationMode, useProjectPrompts, colorPalette, worldSetting, targetDuration, bgmUrl } = body;

  const [updated] = await db
    .update(projects)
    .set({
      ...(title !== undefined && { title }),
      ...(idea !== undefined && { idea }),
      ...(script !== undefined && { script }),
      ...(outline !== undefined && { outline }),
      ...(status !== undefined && { status }),
      ...(generationMode !== undefined && { generationMode }),
      ...(useProjectPrompts !== undefined && { useProjectPrompts }),
      ...(colorPalette !== undefined && { colorPalette }),
      ...(worldSetting !== undefined && { worldSetting }),
      ...(targetDuration !== undefined && { targetDuration }),
      ...(bgmUrl !== undefined && { bgmUrl }),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id))
    .returning();

  if (script !== undefined) {
    await markDownstreamStale("project", id);
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = getUserIdFromRequest(request);
  const project = await resolveProject(id, userId);

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 1. Collect all shot IDs first (need for shot_assets cleanup)
  const projectShots = await db
    .select({ id: shots.id })
    .from(shots)
    .where(eq(shots.projectId, id));

  // 2. Collect all episode IDs
  const projectEpisodes = await db
    .select({ id: episodes.id })
    .from(episodes)
    .where(eq(episodes.projectId, id));

  // 3. Collect all character IDs
  const projectCharacters = await db
    .select({ id: characters.id, referenceImage: characters.referenceImage })
    .from(characters)
    .where(eq(characters.projectId, id));

  // 4. Delete in dependency order (most tables have cascade, but we delete explicitly for safety)

  // 4.1 Delete prompt_templates with project scope
  await db.delete(promptTemplates).where(
    eq(promptTemplates.projectId, id)
  );

  // 4.2 Delete import_logs
  await db.delete(importLogs).where(eq(importLogs.projectId, id));

  // 4.3 Delete mood_board_images
  await db.delete(moodBoardImages).where(eq(moodBoardImages.projectId, id));

  // 4.4 Delete shot_actions (depends on shots)
  if (projectShots.length > 0) {
    await db.delete(shotActions).where(
      inArray(shotActions.shotId, projectShots.map((s) => s.id))
    );
  }

  // 4.5 Delete shot_assets (depends on shots)
  if (projectShots.length > 0) {
    await db.delete(shotAssets).where(
      inArray(shotAssets.shotId, projectShots.map((s) => s.id))
    );
  }

  // 4.6 Delete dialogues (depends on shots)
  if (projectShots.length > 0) {
    await db.delete(dialogues).where(
      inArray(dialogues.shotId, projectShots.map((s) => s.id))
    );
  }

  // 4.7 Delete shots
  await db.delete(shots).where(eq(shots.projectId, id));

  // 4.8 Delete scenes (depends on episodes)
  if (projectEpisodes.length > 0) {
    await db.delete(scenes).where(
      inArray(scenes.episodeId, projectEpisodes.map((e) => e.id))
    );
  }

  // 4.9 Delete character_costumes (depends on characters)
  if (projectCharacters.length > 0) {
    await db.delete(characterCostumes).where(
      inArray(characterCostumes.characterId, projectCharacters.map((c) => c.id))
    );
  }

  // 4.10 Delete character_relations
  await db.delete(characterRelations).where(eq(characterRelations.projectId, id));

  // 4.11 Delete characters
  await db.delete(characters).where(eq(characters.projectId, id));

  // 4.12 Delete episodes
  await db.delete(episodes).where(eq(episodes.projectId, id));

  // 4.13 Delete storyboard_versions
  await db.delete(storyboardVersions).where(eq(storyboardVersions.projectId, id));

  // 5. Delete project files (images, videos)
  try {
    const uploadDir = process.env.UPLOAD_DIR || "./uploads";
    const projectUploadDir = path.join(uploadDir, "projects", id);

    if (fs.existsSync(projectUploadDir)) {
      fs.rmSync(projectUploadDir, { recursive: true, force: true });
      logger.info(`[ProjectDelete] Deleted project files: ${projectUploadDir}`);
    }

    // Also check for mood board images in the main uploads directory
    const moodBoardEntries = await db
      .select({ imageUrl: moodBoardImages.imageUrl })
      .from(moodBoardImages)
      .where(eq(moodBoardImages.projectId, id));

    for (const entry of moodBoardEntries) {
      if (entry.imageUrl) {
        const fullPath = path.join(uploadDir, entry.imageUrl.replace(/^\//, ""));
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      }
    }

    // Also delete character reference images
    for (const char of projectCharacters) {
      if (char.referenceImage) {
        const fullPath = path.join(uploadDir, char.referenceImage.replace(/^\//, ""));
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      }
    }
  } catch (err) {
    logger.error(`[ProjectDelete] Error deleting project files:`, err);
    // Don't fail the request if file deletion fails
  }

  // 6. Delete the project itself
  await db.delete(projects).where(eq(projects.id, id));

  return new NextResponse(null, { status: 204 });
}
