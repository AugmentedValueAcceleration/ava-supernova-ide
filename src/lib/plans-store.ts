// ── Plan records, read straight from the project ────────────────────────────
//
// The chat sidebar's Plans tab used to get these from the sidecar
// (`list_decisions` → core.listPlanRecords). That coupled a folder of Markdown
// files to whether the AGENT was running: the sidecar only starts when
// `canChat` is true, which needs a chat provider key or a platform account. So
// a user with neither — the exact person who opens the app to read what they
// planned — sent listDecisions() into a dead pipe and saw an empty tab.
//
// Plans are files in your project. They need no account, no key and no agent,
// so they are read here the same way tasks, journal, learning, creative and
// the audit log already are: directly, through Tauri fs.
//
// The parsing mirrors core's listPlanRecords (config/project.ts) field for
// field — same filename numbering, same metadata lines, same "steps are the
// numbered list under ## Plan and only that one" rule. Core stays canonical;
// if that parser changes, this follows.

import { readDir, readTextFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';

/** Matches core's DECISIONS_DIR_NAME. */
const DECISIONS_DIR_NAME = 'Decisions';

export interface PlanRecord {
  number: number;
  title: string;
  path: string;
  relPath: string;
  date?: string;
  status?: string;
  chosen?: string;
  stepCount: number;
  steps: string[];
}

/**
 * The numbered list under `## Plan`, and only that one.
 *
 * A numbered list in the goal or the verification is not a step. Sub-lines
 * (files, notes) are indented and so never match — the sidebar wants the
 * steps, not the whole record. Line-by-line rather than a section regex:
 * core's first attempt closed the section with `(?=^##\s|\Z)`, and `\Z` is not
 * a JavaScript anchor, so any record whose Plan was the last section counted
 * zero steps.
 */
function extractPlanSteps(body: string): string[] {
  const steps: string[] = [];
  let inPlan = false;
  for (const raw of body.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (/^##\s/.test(line)) {
      inPlan = /^##\s+Plan\s*$/.test(line);
      continue;
    }
    const m = inPlan ? /^\d+\.\s+(.*)$/.exec(line) : null;
    if (m) steps.push(m[1].trim());
  }
  return steps;
}

/**
 * List a project's decision records, newest first.
 *
 * Local-first: a missing folder, an unreadable file or no project at all is an
 * empty list, never an error — there is nothing useful to say to someone who
 * simply has not written a plan yet.
 */
export async function readPlanRecords(projectFolder: string | null | undefined): Promise<PlanRecord[]> {
  if (!projectFolder) return [];
  // join(), not string concat: the project folder arrives with Windows
  // separators, and the same walk in scanLocalLibrary already uses it.
  const recordsDir = await join(projectFolder, DECISIONS_DIR_NAME, 'records');

  // readDir straight off — no exists() first. fs:allow-exists is NOT in the
  // capability allow-list (fs:allow-read-dir and fs:allow-read-file are), so
  // exists() is denied at runtime and throws. A missing folder just makes
  // readDir reject, which is the same answer.
  let names: string[];
  try {
    names = (await readDir(recordsDir))
      .filter((e) => e.isFile && e.name?.toLowerCase().endsWith('.md'))
      .map((e) => e.name as string);
  } catch {
    return [];
  }

  const out: PlanRecord[] = [];
  for (const name of names) {
    const path = await join(recordsDir, name);
    let body: string;
    try {
      body = await readTextFile(path);
    } catch {
      continue; // unreadable file — skip it rather than fail the whole list
    }

    const numMatch = /^(\d{1,6})[-.]/.exec(name);
    const headingMatch = /^#\s+(?:\d+\.\s*)?(.+)$/m.exec(body);
    const dateMatch = /^-\s+\*\*Date:\*\*\s*(.+)$/m.exec(body);
    const statusMatch = /^-\s+\*\*Status:\*\*\s*(.+)$/m.exec(body);
    const chosenMatch = /Chose the \*\*(.+?)\*\* approach/.exec(body);
    const steps = extractPlanSteps(body);

    out.push({
      number: numMatch ? parseInt(numMatch[1], 10) : 0,
      title: headingMatch?.[1].trim() || name.replace(/\.md$/i, ''),
      path,
      relPath: `${DECISIONS_DIR_NAME}/records/${name}`,
      date: dateMatch?.[1].trim(),
      status: statusMatch?.[1].trim(),
      chosen: chosenMatch?.[1].trim(),
      stepCount: steps.length,
      steps,
    });
  }

  // Newest first — an unnumbered record sorts by name so it still has a place.
  return out.sort((a, b) => (b.number - a.number) || a.title.localeCompare(b.title));
}

/** The full text of one record, for a surface that wants to show it. */
export async function readPlanRecordBody(path: string): Promise<string | null> {
  try {
    return await readTextFile(path);
  } catch {
    return null;
  }
}
