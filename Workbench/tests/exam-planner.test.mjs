import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  EXAM_PLANNER_STORE_PATH,
  createExamPlannerRepository,
} from "../server/exam-planner.mjs";

test("exam planner persists profile, tasks and study logs", async (context) => {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "exam-planner-"));
  context.after(() => rm(vaultRoot, { recursive: true, force: true }));
  const now = () => new Date("2026-10-08T08:00:00+08:00");
  const repository = createExamPlannerRepository({ vaultRoot, now });

  const empty = await repository.dashboard();
  assert.equal(empty.today, "2026-10-08");
  assert.equal(empty.stats.weekTaskCount, 0);

  await repository.updateProfile({
    examName: "2027 年国考",
    examDate: "2026-12-06",
    targetScore: 142.5,
    dailyMinutes: 180,
  });
  const withTask = await repository.addTask({
    title: "完成资料分析练习",
    subject: "资料分析",
    date: "2026-10-08",
    estimatedMinutes: 60,
    target: "30 题",
    priority: "high",
  });
  const taskId = withTask.tasks[0].id;
  await repository.updateTask(taskId, { status: "completed" });
  await repository.addLog({
    date: "2026-10-08",
    subject: "资料分析",
    minutes: 55,
    questions: 30,
    correct: 24,
    note: "增长率题型需要复习",
  });

  const dashboard = await repository.dashboard();
  assert.equal(dashboard.profile.examName, "2027 年国考");
  assert.equal(dashboard.stats.weekCompletedCount, 1);
  assert.equal(dashboard.stats.weekMinutes, 55);
  assert.equal(dashboard.stats.weekAccuracy, 80);
  assert.equal(dashboard.subjectProgress.find((item) => item.subject === "资料分析").accuracy, 80);

  const stored = JSON.parse(await readFile(path.join(vaultRoot, EXAM_PLANNER_STORE_PATH), "utf8"));
  assert.equal(stored.tasks[0].status, "completed");
  assert.equal(stored.logs[0].questions, 30);
});

test("exam planner rejects impossible study log values", async (context) => {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "exam-planner-invalid-"));
  context.after(() => rm(vaultRoot, { recursive: true, force: true }));
  const repository = createExamPlannerRepository({ vaultRoot });

  await assert.rejects(
    repository.addLog({
      date: "2026-10-08",
      subject: "判断推理",
      minutes: 30,
      questions: 10,
      correct: 11,
    }),
    (error) => error.code === "INVALID_EXAM_INPUT",
  );
});
