import { createCipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
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
const outputDirectory = path.join(workbenchRoot, "dist", "client");
const outputPath = path.join(outputDirectory, "hosted-data.json");
const encryptedOutputPath = path.join(outputDirectory, "hosted-data.enc.json");
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

await mkdir(outputDirectory, { recursive: true });

const accessKey = String(process.env.PAGES_ACCESS_KEY || "");
const requireAccessKey = process.env.VITE_REQUIRE_ACCESS_KEY === "true";

if (requireAccessKey && !accessKey) {
  throw new Error("VITE_REQUIRE_ACCESS_KEY=true requires PAGES_ACCESS_KEY.");
}

if (accessKey) {
  const iterations = 250_000;
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(accessKey, salt, iterations, 32, "sha256");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const envelope = {
    version: 1,
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations,
      salt: salt.toString("base64"),
    },
    cipher: {
      name: "AES-GCM",
      iv: iv.toString("base64"),
    },
    data: ciphertext.toString("base64"),
  };
  await rm(outputPath, { force: true });
  await writeFile(encryptedOutputPath, `${JSON.stringify(envelope)}\n`, "utf8");
  console.log(`Prepared encrypted hosted data: ${path.relative(workbenchRoot, encryptedOutputPath)}`);
} else {
  await rm(encryptedOutputPath, { force: true });
  await writeFile(outputPath, `${JSON.stringify(payload)}\n`, "utf8");
  console.log(`Prepared hosted demo data: ${path.relative(workbenchRoot, outputPath)}`);
}
