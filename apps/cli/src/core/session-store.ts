import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { CliFileReadError, CliFileWriteError } from "./errors";
import type { CliArtifact } from "./types";

export const canonicalReturnFileName = "canonical-return.json";
export const exportManifestFileName = "export-manifest.json";

export type ResolvedCanonicalInput = {
  readonly canonicalPath: string;
  readonly sessionDir: string | null;
};

export async function resolveCanonicalInput(inputPath: string): Promise<ResolvedCanonicalInput> {
  let inputStat: Awaited<ReturnType<typeof stat>>;

  try {
    inputStat = await stat(inputPath);
  } catch (cause) {
    throw new CliFileReadError({
      path: inputPath,
      cause,
    });
  }

  if (inputStat.isDirectory()) {
    return {
      canonicalPath: join(inputPath, canonicalReturnFileName),
      sessionDir: inputPath,
    };
  }

  return {
    canonicalPath: inputPath,
    sessionDir: null,
  };
}

export function buildDefaultSessionDir(cwd: string, returnId: string): string {
  return join(cwd, ".taxzilla", "returns", returnId);
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  } catch (cause) {
    throw new CliFileWriteError({
      path,
      cause,
    });
  }
}

export async function writeExportManifest(options: {
  readonly outputDir: string;
  readonly commandName: "run" | "export";
  readonly generatedAt: string;
  readonly returnId: string;
  readonly taxYear: number;
  readonly canonicalPath: string;
  readonly artifacts: ReadonlyArray<CliArtifact>;
}): Promise<string> {
  const manifestPath = join(options.outputDir, exportManifestFileName);

  await writeJsonFile(manifestPath, {
    command: options.commandName,
    generated_at: options.generatedAt,
    return_id: options.returnId,
    tax_year: options.taxYear,
    canonical_path: options.canonicalPath,
    artifacts: options.artifacts,
  });

  return manifestPath;
}
