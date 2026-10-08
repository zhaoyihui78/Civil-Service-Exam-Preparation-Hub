import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const EXAM_PLANNER_STORE_PATH = "20_exam/.exam-planner.json";

const SUBJECTS = ["言语理解", "数量关系", "判断推理", "资料分析", "常识判断", "申论"];
const TASK_STATUSES = new Set(["pending", "completed"]);
const MAX_ITEMS = 10_000;

const defaultState = () => ({
  schemaVersion: 1,
  updatedAt: null,
  profile: {
    examName: "我的目标考试",
    examDate: null,
    targetScore: 140,
    dailyMinutes: 180,
  },
  subjects: SUBJECTS,
  tasks: [],
  logs: [],
});

function plannerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function cleanText(value, label, { required = true, maximum = 160 } = {}) {
  const text = String(value ?? "").trim();
  if (required && !text) throw plannerError("INVALID_EXAM_INPUT", `请填写${label}。`);
  if (text.length > maximum) {
    throw plannerError("INVALID_EXAM_INPUT", `${label}不能超过 ${maximum} 个字符。`);
  }
  return text;
}

function cleanDate(value, label, { required = true } = {}) {
  if (!value && !required) return null;
  const date = cleanText(value, label, { required, maximum: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw plannerError("INVALID_EXAM_INPUT", `${label}必须是有效日期。`);
  }
  return date;
}

function cleanNumber(value, label, { minimum = 0, maximum = 100_000, integer = true } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw plannerError("INVALID_EXAM_INPUT", `${label}必须在 ${minimum}–${maximum} 之间。`);
  }
  return integer ? Math.round(number) : number;
}

function normalizeState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw plannerError("EXAM_STORE_CORRUPT", "考公计划数据无法读取。请检查数据文件格式。");
  }
  const initial = defaultState();
  return {
    ...initial,
    ...value,
    profile: { ...initial.profile, ...(value.profile || {}) },
    subjects: Array.isArray(value.subjects) && value.subjects.length ? value.subjects : initial.subjects,
    tasks: Array.isArray(value.tasks) ? value.tasks : [],
    logs: Array.isArray(value.logs) ? value.logs : [],
  };
}

function dateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date, amount) {
  const next = new Date(`${date}T12:00:00+08:00`);
  next.setUTCDate(next.getUTCDate() + amount);
  return dateKey(next);
}

function startOfWeek(today) {
  const parsed = new Date(`${today}T12:00:00+08:00`);
  const weekday = parsed.getUTCDay() || 7;
  return addDays(today, 1 - weekday);
}

function subjectProgress(state) {
  return state.subjects.map((subject) => {
    const tasks = state.tasks.filter((task) => task.subject === subject);
    const completed = tasks.filter((task) => task.status === "completed").length;
    const logs = state.logs.filter((log) => log.subject === subject);
    const questions = logs.reduce((sum, log) => sum + log.questions, 0);
    const correct = logs.reduce((sum, log) => sum + log.correct, 0);
    return {
      subject,
      tasks: tasks.length,
      completed,
      minutes: logs.reduce((sum, log) => sum + log.minutes, 0),
      questions,
      accuracy: questions ? Math.round((correct / questions) * 1000) / 10 : null,
    };
  });
}

export function createExamPlannerRepository({ vaultRoot, now = () => new Date() }) {
  const storePath = path.join(path.resolve(vaultRoot), EXAM_PLANNER_STORE_PATH);
  let mutationQueue = Promise.resolve();

  async function read() {
    try {
      return normalizeState(JSON.parse(await readFile(storePath, "utf8")));
    } catch (error) {
      if (error?.code === "ENOENT") return defaultState();
      if (error?.code === "EXAM_STORE_CORRUPT") throw error;
      throw plannerError("EXAM_STORE_CORRUPT", "考公计划数据无法读取。请检查数据文件格式。");
    }
  }

  async function write(state) {
    if (state.tasks.length > MAX_ITEMS || state.logs.length > MAX_ITEMS) {
      throw plannerError("EXAM_STORE_LIMIT", "考公计划记录数量已达到当前版本上限。");
    }
    const next = { ...state, updatedAt: now().toISOString() };
    await mkdir(path.dirname(storePath), { recursive: true });
    const temporaryPath = `${storePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, storePath);
    return next;
  }

  function mutate(operation) {
    const result = mutationQueue.then(async () => write(await operation(await read())));
    mutationQueue = result.catch(() => {});
    return result;
  }

  async function dashboard() {
    const state = await read();
    const today = dateKey(now());
    const weekStart = startOfWeek(today);
    const weekEnd = addDays(weekStart, 6);
    const todayTasks = state.tasks
      .filter((task) => task.date === today)
      .sort((left, right) => Number(right.priority === "high") - Number(left.priority === "high"));
    const weekTasks = state.tasks.filter((task) => task.date >= weekStart && task.date <= weekEnd);
    const weekLogs = state.logs.filter((log) => log.date >= weekStart && log.date <= weekEnd);
    const weekQuestions = weekLogs.reduce((sum, log) => sum + log.questions, 0);
    const weekCorrect = weekLogs.reduce((sum, log) => sum + log.correct, 0);
    const examDays = state.profile.examDate
      ? Math.max(0, Math.ceil((Date.parse(`${state.profile.examDate}T00:00:00+08:00`) - Date.parse(`${today}T00:00:00+08:00`)) / 86_400_000))
      : null;

    return {
      ...state,
      today,
      todayTasks,
      recentLogs: [...state.logs].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 10),
      stats: {
        examDays,
        weekTaskCount: weekTasks.length,
        weekCompletedCount: weekTasks.filter((task) => task.status === "completed").length,
        weekCompletionRate: weekTasks.length
          ? Math.round((weekTasks.filter((task) => task.status === "completed").length / weekTasks.length) * 100)
          : 0,
        weekMinutes: weekLogs.reduce((sum, log) => sum + log.minutes, 0),
        weekQuestions,
        weekAccuracy: weekQuestions ? Math.round((weekCorrect / weekQuestions) * 1000) / 10 : null,
      },
      subjectProgress: subjectProgress(state),
    };
  }

  return {
    dashboard,
    updateProfile(input) {
      return mutate(async (state) => ({
        ...state,
        profile: {
          examName: cleanText(input.examName, "考试名称", { maximum: 80 }),
          examDate: cleanDate(input.examDate, "考试日期", { required: false }),
          targetScore: cleanNumber(input.targetScore, "目标分数", { minimum: 0, maximum: 300, integer: false }),
          dailyMinutes: cleanNumber(input.dailyMinutes, "每日学习分钟", { minimum: 15, maximum: 1_440 }),
        },
      }));
    },
    addTask(input) {
      return mutate(async (state) => ({
        ...state,
        tasks: [
          ...state.tasks,
          {
            id: `task-${randomUUID()}`,
            title: cleanText(input.title, "任务名称"),
            subject: cleanText(input.subject, "科目", { maximum: 40 }),
            date: cleanDate(input.date, "计划日期"),
            estimatedMinutes: cleanNumber(input.estimatedMinutes, "预计用时", { minimum: 5, maximum: 1_440 }),
            target: cleanText(input.target, "完成标准", { required: false, maximum: 120 }),
            priority: input.priority === "high" ? "high" : "normal",
            status: "pending",
            createdAt: now().toISOString(),
            completedAt: null,
          },
        ],
      }));
    },
    updateTask(id, input) {
      return mutate(async (state) => {
        const index = state.tasks.findIndex((task) => task.id === id);
        if (index < 0) throw plannerError("EXAM_TASK_NOT_FOUND", "学习任务不存在。");
        const current = state.tasks[index];
        const status = input.status ?? current.status;
        if (!TASK_STATUSES.has(status)) {
          throw plannerError("INVALID_EXAM_INPUT", "任务状态无效。");
        }
        const tasks = [...state.tasks];
        tasks[index] = {
          ...current,
          status,
          completedAt: status === "completed" ? current.completedAt || now().toISOString() : null,
        };
        return { ...state, tasks };
      });
    },
    deleteTask(id) {
      return mutate(async (state) => {
        if (!state.tasks.some((task) => task.id === id)) {
          throw plannerError("EXAM_TASK_NOT_FOUND", "学习任务不存在。");
        }
        return { ...state, tasks: state.tasks.filter((task) => task.id !== id) };
      });
    },
    addLog(input) {
      return mutate(async (state) => {
        const questions = cleanNumber(input.questions ?? 0, "刷题数量", { minimum: 0, maximum: 10_000 });
        const correct = cleanNumber(input.correct ?? 0, "正确数量", { minimum: 0, maximum: questions });
        return {
          ...state,
          logs: [
            ...state.logs,
            {
              id: `log-${randomUUID()}`,
              date: cleanDate(input.date, "学习日期"),
              subject: cleanText(input.subject, "科目", { maximum: 40 }),
              minutes: cleanNumber(input.minutes, "学习时长", { minimum: 1, maximum: 1_440 }),
              questions,
              correct,
              note: cleanText(input.note, "学习备注", { required: false, maximum: 500 }),
              createdAt: now().toISOString(),
            },
          ],
        };
      });
    },
  };
}
