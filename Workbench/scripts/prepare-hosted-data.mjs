import { createCipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

import { bookPdfDocument, booksPayload } from "../server/books.mjs";
import { createExamCurrentAffairsService } from "../server/exam-current-affairs.mjs";
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
const demoVaultRoot = path.join(repositoryRoot, "个人知识库");
const localEnv = loadEnv("production", workbenchRoot, "");
const usePrivateSnapshot = process.env.PAGES_SNAPSHOT_PRIVATE === "true";
const vaultRoot = path.resolve(usePrivateSnapshot
  ? process.env.PAGES_SNAPSHOT_VAULT_ROOT || localEnv.PERSONAL_DASHBOARD_VAULT_ROOT || demoVaultRoot
  : demoVaultRoot);
const outputDirectory = path.join(workbenchRoot, "dist", "client");
const outputPath = path.join(outputDirectory, "hosted-data.json");
const encryptedOutputPath = path.join(outputDirectory, "hosted-data.enc.json");
const pdfOutputDirectory = path.join(outputDirectory, "hosted-pdfs");
const readingState = { updatedAt: null, items: [] };
const accessKey = String(process.env.PAGES_ACCESS_KEY || "");
const requireAccessKey = process.env.VITE_REQUIRE_ACCESS_KEY === "true";

if (usePrivateSnapshot && !accessKey) {
  throw new Error("PAGES_SNAPSHOT_PRIVATE=true requires PAGES_ACCESS_KEY so private data is never written in plaintext.");
}

function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = selector(item) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function isSharedDocument(document) {
  return (
    document.path.startsWith("10_raw/books/") ||
    document.path.startsWith("10_raw/exam-") ||
    document.path.startsWith("wiki/")
  );
}

function encryptedEnvelope(buffer, secret, contentType) {
  const iterations = 250_000;
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(secret, salt, iterations, 32, "sha256");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final(), cipher.getAuthTag()]);
  return {
    version: 1,
    contentType,
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
}

const index = await buildVaultIndex(vaultRoot);
const sharedDocuments = index.documents.filter(isSharedDocument);
const sharedWikiPages = index.wiki.pages.filter(isSharedDocument);
const sharedIndex = {
  ...index,
  stats: {
    ...index.stats,
    documents: sharedDocuments.length,
    rawFiles: sharedDocuments.filter((document) => document.layer === "raw").length,
    formalWikiPages: sharedWikiPages.length,
    topics: 0,
    filmedTopics: 0,
    publishedTopics: 0,
    runs: 0,
    brainstormSessions: 0,
    douyinWorks: 0,
  },
  documents: sharedDocuments,
  wiki: {
    pages: sharedWikiPages,
    countsByType: countBy(sharedWikiPages, (document) => document.type),
    countsByStatus: countBy(sharedWikiPages, (document) => document.status),
  },
  topics: { items: [], countsByFolder: {}, countsByPipelineStage: {}, filmed: 0, published: 0 },
  runs: { items: [], countsByCategory: {} },
  brainstorm: { items: [], countsByKind: {}, countsByStatus: {} },
  recent: sharedDocuments.slice(0, 30),
  douyin: {
    available: false,
    sourcePath: null,
    updatedAt: null,
    comparableCount: 0,
    works: [],
    monthly: [],
    contentLines: [],
    summary: {},
    summaryLowerBounds: {},
    qualityFlags: [],
    qualityIssues: [],
    range: {},
  },
};
const planner = createExamPlannerRepository({ vaultRoot: demoVaultRoot });
const opportunities = createExamOpportunitiesRepository({ vaultRoot });
const folderIndex = buildMaterialFolderIndex(sharedIndex, readingState);
const currentAffairs = createExamCurrentAffairsService();

const documents = {};
for (const document of sharedDocuments) {
  if (document.extension !== "md") continue;
  const payload = documentPayload(index, document.id);
  if (payload) documents[document.id] = payload;
}

const materialFolders = {};
for (const relativePath of folderIndex.folders.keys()) {
  materialFolders[relativePath] = materialFolderPayload(sharedIndex, readingState, relativePath);
}

let currentAffairsPayload;
try {
  currentAffairsPayload = await currentAffairs.load({ force: true });
} catch (error) {
  currentAffairsPayload = {
    schemaVersion: 1,
    status: "unavailable",
    fetchedAt: null,
    source: { name: "中国政府网", url: "https://www.gov.cn/" },
    sources: [],
    counts: { upstream: null, mustRead: 0, browse: 0, other: 0 },
    tiers: { mustRead: [], browse: [], other: [] },
    error: { message: error?.message || "官方时政数据暂时无法读取。" },
  };
}

const pdfAssets = {};
await rm(pdfOutputDirectory, { force: true, recursive: true });
if (accessKey) {
  await mkdir(pdfOutputDirectory, { recursive: true });
  for (const document of sharedDocuments) {
    const pdf = bookPdfDocument(sharedIndex, document.id);
    if (!pdf) continue;
    const fileName = `${encodeURIComponent(pdf.id)}.json`;
    const envelope = encryptedEnvelope(
      await readFile(path.join(vaultRoot, pdf.path)),
      accessKey,
      "application/pdf",
    );
    await writeFile(path.join(pdfOutputDirectory, fileName), `${JSON.stringify(envelope)}\n`, "utf8");
    pdfAssets[pdf.id] = {
      url: `hosted-pdfs/${fileName}`,
      fileName: pdf.fileName,
      sizeBytes: pdf.sizeBytes,
    };
  }
}

const payload = {
  generatedAt: new Date().toISOString(),
  mode: path.resolve(vaultRoot) === path.resolve(demoVaultRoot) ? "public-demo" : "encrypted-share",
  overview: overviewPayload(sharedIndex),
  examDashboard: await planner.dashboard(),
  examOpportunities: await opportunities.list(),
  currentAffairs: currentAffairsPayload,
  materials: materialsHomePayload(sharedIndex, readingState),
  materialFolders,
  materialReadingQueue: materialReadingQueuePayload(sharedIndex, readingState),
  books: booksPayload(sharedIndex),
  pdfAssets,
  collections: {
    materials: collectionPayload(sharedIndex, "materials"),
    wiki: collectionPayload(sharedIndex, "wiki"),
    content: { total: 0, groups: [], items: [] },
    archive: { total: 0, groups: [], items: [] },
  },
  graph: graphPayload(sharedIndex),
  documents,
  searchDocuments: sharedDocuments.filter((document) => document.extension === "md"),
  runtime: {
    codex: { available: false, authenticated: null, version: null, path: null },
    vault: {
      connected: true,
      label: "加密分享资料",
      documents: sharedDocuments.length,
      generatedAt: index.generatedAt,
      errors: index.errors.length,
    },
  },
};

await mkdir(outputDirectory, { recursive: true });

if (requireAccessKey && !accessKey) {
  throw new Error("VITE_REQUIRE_ACCESS_KEY=true requires PAGES_ACCESS_KEY.");
}

if (accessKey) {
  const envelope = encryptedEnvelope(
    Buffer.from(JSON.stringify(payload), "utf8"),
    accessKey,
    "application/json",
  );
  await rm(outputPath, { force: true });
  await writeFile(encryptedOutputPath, `${JSON.stringify(envelope)}\n`, "utf8");
  console.log(`Prepared encrypted hosted data: ${path.relative(workbenchRoot, encryptedOutputPath)}`);
} else {
  await rm(encryptedOutputPath, { force: true });
  await writeFile(outputPath, `${JSON.stringify(payload)}\n`, "utf8");
  console.log(`Prepared hosted demo data: ${path.relative(workbenchRoot, outputPath)}`);
}
