import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { booksPayload } from "../server/books.mjs";
import { createExamOpportunitiesRepository } from "../server/exam-opportunities.mjs";
import { createExamPlannerRepository } from "../server/exam-planner.mjs";
import {
  buildMaterialFolderIndex,
  materialFolderPayload,
  materialReadingQueuePayload,
  materialsHomePayload,
} from "../server/materials.mjs";
import { buildVaultIndex } from "../server/vault-index.mjs";
import {
  collectionPayload,
  documentPayload,
  graphPayload,
  overviewPayload,
} from "../server/vite-plugin-workbench.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workbenchRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(workbenchRoot, "..");
const vaultRoot = path.join(repositoryRoot, "个人知识库");
const outputPath = path.join(workbenchRoot, "dist", "client", "hosted-data.json");
const readingState = { updatedAt: null, items: [] };

const index = await buildVaultIndex(vaultRoot);
const planner = createExamPlannerRepository({ vaultRoot });
const opportunities = createExamOpportunitiesRepository({ vaultRoot });
const folderIndex = buildMaterialFolderIndex(index, readingState);

const documents = {};
for (const document of index.documents) {
  if (document.extension !== "md") continue;
  const payload = documentPayload(index, document.id);
  if (payload) documents[document.id] = payload;
}

const materialFolders = {};
for (const relativePath of folderIndex.folders.keys()) {
  materialFolders[relativePath] = materialFolderPayload(index, readingState, relativePath);
}

const payload = {
  generatedAt: new Date().toISOString(),
  mode: "public-demo",
  overview: overviewPayload(index),
  examDashboard: await planner.dashboard(),
  examOpportunities: await opportunities.list(),
  materials: materialsHomePayload(index, readingState),
  materialFolders,
  materialReadingQueue: materialReadingQueuePayload(index, readingState),
  books: booksPayload(index),
  collections: {
    materials: collectionPayload(index, "materials"),
    wiki: collectionPayload(index, "wiki"),
    content: collectionPayload(index, "content"),
    archive: collectionPayload(index, "archive"),
  },
  graph: graphPayload(index),
  documents,
  searchDocuments: index.documents.filter((document) => document.extension === "md"),
  runtime: {
    codex: { available: false, authenticated: null, version: null, path: null },
    vault: {
      connected: true,
      label: "公开演示 Vault",
      documents: index.stats.documents,
      generatedAt: index.generatedAt,
      errors: index.errors.length,
    },
  },
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload)}\n`, "utf8");
console.log(`Prepared hosted demo data: ${path.relative(workbenchRoot, outputPath)}`);
