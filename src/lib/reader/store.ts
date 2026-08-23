import { getSql } from "@/lib/db";
import type {
  EvidenceBoard,
  JobRecord,
  JobStatus,
  ReadLevel,
  VideoRecord,
  VideoRepresentation,
} from "./types";
import { EMPTY_EVIDENCE } from "./types";

export async function upsertVideo(row: {
  id: string;
  userId: string;
  platform: string;
  platformId: string;
  url: string;
  canonicalUrl?: string;
  title?: string;
  creatorName?: string;
  durationSec?: number;
  level: ReadLevel;
  status: JobStatus;
  evidence?: EvidenceBoard;
  metadata?: unknown;
  representation?: VideoRepresentation | null;
  error?: string | null;
}): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into videos (
      id, user_id, platform, platform_id, url, canonical_url, title, creator_name,
      duration_sec, level, status, evidence, metadata, representation, error, updated_at
    ) values (
      ${row.id}, ${row.userId}, ${row.platform}, ${row.platformId}, ${row.url},
      ${row.canonicalUrl ?? null}, ${row.title ?? null}, ${row.creatorName ?? null},
      ${row.durationSec ?? null}, ${row.level}, ${row.status},
      ${JSON.stringify(row.evidence ?? EMPTY_EVIDENCE)}::jsonb,
      ${row.metadata ? JSON.stringify(row.metadata) : null}::jsonb,
      ${row.representation ? JSON.stringify(row.representation) : null}::jsonb,
      ${row.error ?? null}, now()
    )
    on conflict (id) do update set
      user_id = excluded.user_id,
      url = excluded.url,
      canonical_url = excluded.canonical_url,
      title = excluded.title,
      creator_name = excluded.creator_name,
      duration_sec = excluded.duration_sec,
      level = excluded.level,
      status = excluded.status,
      evidence = excluded.evidence,
      metadata = excluded.metadata,
      representation = excluded.representation,
      error = excluded.error,
      updated_at = now()
  `;
}

export async function getVideo(id: string): Promise<VideoRecord | null> {
  const sql = await getSql();
  const rows = await sql<DbVideo>`select * from videos where id = ${id} limit 1`;
  return rows[0] ? mapVideo(rows[0]) : null;
}

export async function getVideoByPlatform(platform: string, platformId: string): Promise<VideoRecord | null> {
  const sql = await getSql();
  const rows = await sql<DbVideo>`
    select * from videos where platform = ${platform} and platform_id = ${platformId} limit 1
  `;
  return rows[0] ? mapVideo(rows[0]) : null;
}

export async function listVideos(userId: string, limit = 30): Promise<VideoRecord[]> {
  const sql = await getSql();
  if (!userId || userId === "guest") return [];
  try {
    const rows = await sql<DbVideo>`
      select v.*
      from library_entries e
      join videos v on v.id = e.video_id
      where e.user_id = ${userId}
      order by e.created_at desc
      limit ${limit}
    `;
    return rows.map(mapVideo);
  } catch {
    return [];
  }
}

export async function addLibraryEntry(userId: string, videoId: string): Promise<void> {
  if (!userId || userId === "guest") return;
  try {
    const sql = await getSql();
    await sql`
      insert into library_entries (user_id, video_id)
      values (${userId}, ${videoId})
      on conflict (user_id, video_id) do nothing
    `;
  } catch {
    // ignore
  }
}

export async function getVideosByIds(ids: string[]): Promise<VideoRecord[]> {
  const out: VideoRecord[] = [];
  for (const id of ids) {
    const row = await getVideo(id);
    if (row) out.push(row);
  }
  return out;
}

export async function insertJob(job: JobRecord): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into jobs (id, video_id, user_id, level, status, stage, progress, log, error)
    values (
      ${job.id}, ${job.videoId}, ${job.userId}, ${job.level}, ${job.status},
      ${job.stage}, ${job.progress}, ${JSON.stringify(job.log)}::jsonb, ${job.error ?? null}
    )
  `;
}

export async function updateJob(id: string, patch: Partial<JobRecord>): Promise<void> {
  const current = await getJob(id);
  if (!current) return;
  const next: JobRecord = { ...current, ...patch };
  const sql = await getSql();
  await sql`
    update jobs set
      status = ${next.status},
      stage = ${next.stage},
      progress = ${next.progress},
      log = ${JSON.stringify(next.log)}::jsonb,
      error = ${next.error ?? null},
      updated_at = now()
    where id = ${id}
  `;
}

export async function getJob(id: string): Promise<JobRecord | null> {
  const sql = await getSql();
  const rows = await sql<DbJob>`select * from jobs where id = ${id} limit 1`;
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    videoId: r.video_id,
    userId: r.user_id,
    level: r.level as JobRecord["level"],
    status: r.status as JobRecord["status"],
    stage: r.stage,
    progress: Number(r.progress),
    log: parseJson(r.log, []),
    error: r.error ?? undefined,
  };
}

interface DbVideo {
  id: string;
  user_id: string;
  platform: string;
  platform_id: string;
  url: string;
  canonical_url: string | null;
  title: string | null;
  creator_name: string | null;
  duration_sec: number | null;
  level: string;
  status: string;
  evidence: unknown;
  metadata: unknown;
  representation: unknown;
  error: string | null;
  created_at: string;
  updated_at: string;
}

interface DbJob {
  id: string;
  video_id: string;
  user_id: string;
  level: string;
  status: string;
  stage: string;
  progress: number;
  log: unknown;
  error: string | null;
}

function mapVideo(r: DbVideo): VideoRecord {
  return {
    id: r.id,
    userId: r.user_id,
    platform: r.platform as VideoRecord["platform"],
    platformId: r.platform_id,
    url: r.url,
    canonicalUrl: r.canonical_url ?? undefined,
    title: r.title ?? undefined,
    creatorName: r.creator_name ?? undefined,
    durationSec: r.duration_sec,
    level: r.level as VideoRecord["level"],
    status: r.status as VideoRecord["status"],
    evidence: parseJson(r.evidence, EMPTY_EVIDENCE),
    metadata: parseJson(r.metadata, null),
    representation: parseJson(r.representation, null),
    error: r.error,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function parseJson<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "string") {
    try { return JSON.parse(v) as T; } catch { return fallback; }
  }
  return v as T;
}
