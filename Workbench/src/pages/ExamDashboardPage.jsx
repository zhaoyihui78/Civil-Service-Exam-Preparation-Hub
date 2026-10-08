import { useEffect, useMemo, useState } from "react";
import {
  IconBook2,
  IconCalendarEvent,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconPlus,
  IconTargetArrow,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import {
  createExamTask,
  createStudyLog,
  deleteExamTask,
  loadExamDashboard,
  updateExamProfile,
  updateExamTask,
} from "../lib/api";
import "./exam-dashboard.css";

function displayDate(value, options = {}) {
  if (!value) return "待设置";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    ...options,
  }).format(new Date(`${value}T00:00:00+08:00`));
}

function minutesLabel(value) {
  const minutes = Number(value) || 0;
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} 小时 ${remainder} 分` : `${hours} 小时`;
}

function emptyTask(today) {
  return {
    title: "",
    subject: "资料分析",
    date: today,
    estimatedMinutes: 60,
    target: "",
    priority: "normal",
  };
}

function emptyLog(today) {
  return {
    date: today,
    subject: "资料分析",
    minutes: 60,
    questions: 0,
    correct: 0,
    note: "",
  };
}

function ProgressRing({ value }) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="exam-ring" style={{ "--progress": `${safe * 3.6}deg` }}>
      <div>
        <strong>{safe}%</strong>
        <span>本周完成</span>
      </div>
    </div>
  );
}

export function ExamDashboardPage() {
  const [dashboard, setDashboard] = useState(null);
  const [activeForm, setActiveForm] = useState(null);
  const [taskDraft, setTaskDraft] = useState(emptyTask(""));
  const [logDraft, setLogDraft] = useState(emptyLog(""));
  const [profileDraft, setProfileDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadExamDashboard()
      .then((data) => {
        if (cancelled) return;
        setDashboard(data);
        setProfileDraft(data.profile);
        setTaskDraft(emptyTask(data.today));
        setLogDraft(emptyLog(data.today));
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError.message || "考公计划加载失败。");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const plannedTasks = useMemo(
    () =>
      [...(dashboard?.tasks || [])]
        .sort((left, right) => left.date.localeCompare(right.date) || left.createdAt.localeCompare(right.createdAt))
        .slice(0, 12),
    [dashboard?.tasks],
  );

  async function runMutation(operation, { close = false } = {}) {
    setBusy(true);
    setError("");
    try {
      const next = await operation();
      setDashboard(next);
      setProfileDraft(next.profile);
      if (close) setActiveForm(null);
      return true;
    } catch (mutationError) {
      setError(mutationError.message || "保存失败，请稍后重试。");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openForm(name) {
    setError("");
    setActiveForm((current) => (current === name ? null : name));
  }

  if (!dashboard) {
    return (
      <div className="exam-page exam-loading" aria-live="polite">
        <div className="exam-skeleton exam-skeleton--hero" />
        <div className="exam-skeleton-grid">
          <div className="exam-skeleton" />
          <div className="exam-skeleton" />
          <div className="exam-skeleton" />
        </div>
        {error ? <div className="exam-alert exam-alert--error">{error}</div> : null}
      </div>
    );
  }

  const { profile, stats, todayTasks, recentLogs, subjectProgress } = dashboard;

  return (
    <div className="exam-page">
      <header className="exam-hero">
        <div className="exam-hero__copy">
          <span className="exam-kicker">CIVIL SERVICE · STUDY DESK</span>
          <p className="exam-date">{displayDate(dashboard.today, { weekday: "long", year: "numeric" })}</p>
          <h1>今天，把计划<br />推进一格。</h1>
          <p className="exam-hero__description">
            围绕目标考试安排每天的学习，让任务、刷题和复盘落在同一条进度线上。
          </p>
          <div className="exam-actions">
            <button className="exam-button exam-button--primary" onClick={() => openForm("task")} type="button">
              <IconPlus size={17} /> 添加任务
            </button>
            <button className="exam-button exam-button--quiet" onClick={() => openForm("log")} type="button">
              记录学习 <IconChevronRight size={16} />
            </button>
          </div>
        </div>

        <section className="exam-target" aria-label="考试目标">
          <div className="exam-target__top">
            <span>当前目标</span>
            <button onClick={() => openForm("profile")} type="button">设置</button>
          </div>
          <strong className="exam-target__name">{profile.examName}</strong>
          <div className="exam-target__countdown">
            <span>{stats.examDays ?? "—"}</span>
            <small>{stats.examDays === null ? "设置日期后开始倒计时" : "天后考试"}</small>
          </div>
          <div className="exam-target__meta">
            <span>目标 {profile.targetScore} 分</span>
            <span>每日 {minutesLabel(profile.dailyMinutes)}</span>
          </div>
        </section>
      </header>

      {error ? (
        <div className="exam-alert exam-alert--error" role="alert">
          <span>{error}</span>
          <button aria-label="关闭错误提示" onClick={() => setError("")} type="button"><IconX size={16} /></button>
        </div>
      ) : null}

      {activeForm ? (
        <section className="exam-composer" aria-label="快速录入">
          <div className="exam-composer__head">
            <div>
              <span className="exam-kicker">QUICK ENTRY</span>
              <h2>{activeForm === "task" ? "安排一项任务" : activeForm === "log" ? "记录一次学习" : "设置备考目标"}</h2>
            </div>
            <button aria-label="关闭表单" onClick={() => setActiveForm(null)} type="button"><IconX /></button>
          </div>

          {activeForm === "task" ? (
            <form
              className="exam-form exam-form--task"
              onSubmit={(event) => {
                event.preventDefault();
                runMutation(() => createExamTask(taskDraft), { close: true }).then((saved) => {
                  if (saved) setTaskDraft(emptyTask(dashboard.today));
                });
              }}
            >
              <label className="exam-field exam-field--wide"><span>任务名称</span><input autoFocus maxLength="160" onChange={(event) => setTaskDraft({ ...taskDraft, title: event.target.value })} placeholder="例如：完成资料分析速算练习" required value={taskDraft.title} /></label>
              <label className="exam-field"><span>科目</span><select onChange={(event) => setTaskDraft({ ...taskDraft, subject: event.target.value })} value={taskDraft.subject}>{dashboard.subjects.map((subject) => <option key={subject}>{subject}</option>)}</select></label>
              <label className="exam-field"><span>日期</span><input onChange={(event) => setTaskDraft({ ...taskDraft, date: event.target.value })} required type="date" value={taskDraft.date} /></label>
              <label className="exam-field"><span>预计分钟</span><input min="5" onChange={(event) => setTaskDraft({ ...taskDraft, estimatedMinutes: event.target.value })} required type="number" value={taskDraft.estimatedMinutes} /></label>
              <label className="exam-field"><span>优先级</span><select onChange={(event) => setTaskDraft({ ...taskDraft, priority: event.target.value })} value={taskDraft.priority}><option value="normal">普通</option><option value="high">重点</option></select></label>
              <label className="exam-field exam-field--wide"><span>完成标准</span><input maxLength="120" onChange={(event) => setTaskDraft({ ...taskDraft, target: event.target.value })} placeholder="例如：30 题，正确率达到 80%" value={taskDraft.target} /></label>
              <button className="exam-button exam-button--primary" disabled={busy} type="submit">{busy ? "保存中…" : "加入计划"}</button>
            </form>
          ) : activeForm === "log" ? (
            <form
              className="exam-form"
              onSubmit={(event) => {
                event.preventDefault();
                runMutation(() => createStudyLog(logDraft), { close: true }).then((saved) => {
                  if (saved) setLogDraft(emptyLog(dashboard.today));
                });
              }}
            >
              <label className="exam-field"><span>日期</span><input onChange={(event) => setLogDraft({ ...logDraft, date: event.target.value })} required type="date" value={logDraft.date} /></label>
              <label className="exam-field"><span>科目</span><select onChange={(event) => setLogDraft({ ...logDraft, subject: event.target.value })} value={logDraft.subject}>{dashboard.subjects.map((subject) => <option key={subject}>{subject}</option>)}</select></label>
              <label className="exam-field"><span>学习分钟</span><input min="1" onChange={(event) => setLogDraft({ ...logDraft, minutes: event.target.value })} required type="number" value={logDraft.minutes} /></label>
              <label className="exam-field"><span>刷题数</span><input min="0" onChange={(event) => setLogDraft({ ...logDraft, questions: event.target.value })} type="number" value={logDraft.questions} /></label>
              <label className="exam-field"><span>正确数</span><input max={logDraft.questions} min="0" onChange={(event) => setLogDraft({ ...logDraft, correct: event.target.value })} type="number" value={logDraft.correct} /></label>
              <label className="exam-field exam-field--wide"><span>学习备注</span><input maxLength="500" onChange={(event) => setLogDraft({ ...logDraft, note: event.target.value })} placeholder="记录难点、状态或下一步" value={logDraft.note} /></label>
              <button className="exam-button exam-button--primary" disabled={busy} type="submit">{busy ? "保存中…" : "保存记录"}</button>
            </form>
          ) : (
            <form
              className="exam-form"
              onSubmit={(event) => {
                event.preventDefault();
                runMutation(() => updateExamProfile(profileDraft), { close: true });
              }}
            >
              <label className="exam-field exam-field--wide"><span>考试名称</span><input autoFocus maxLength="80" onChange={(event) => setProfileDraft({ ...profileDraft, examName: event.target.value })} required value={profileDraft.examName} /></label>
              <label className="exam-field"><span>考试日期</span><input onChange={(event) => setProfileDraft({ ...profileDraft, examDate: event.target.value })} type="date" value={profileDraft.examDate || ""} /></label>
              <label className="exam-field"><span>目标分数</span><input max="300" min="0" onChange={(event) => setProfileDraft({ ...profileDraft, targetScore: event.target.value })} required step="0.1" type="number" value={profileDraft.targetScore} /></label>
              <label className="exam-field"><span>每日学习分钟</span><input max="1440" min="15" onChange={(event) => setProfileDraft({ ...profileDraft, dailyMinutes: event.target.value })} required type="number" value={profileDraft.dailyMinutes} /></label>
              <button className="exam-button exam-button--primary" disabled={busy} type="submit">{busy ? "保存中…" : "保存目标"}</button>
            </form>
          )}
        </section>
      ) : null}

      <section className="exam-metrics" aria-label="本周数据">
        <div><span>本周投入</span><strong>{minutesLabel(stats.weekMinutes)}</strong><small>累计学习时间</small></div>
        <div><span>本周刷题</span><strong>{stats.weekQuestions}</strong><small>已记录题目</small></div>
        <div><span>平均正确率</span><strong>{stats.weekAccuracy === null ? "—" : `${stats.weekAccuracy}%`}</strong><small>仅统计已记录题目</small></div>
        <div><span>任务推进</span><strong>{stats.weekCompletedCount}<i> / {stats.weekTaskCount}</i></strong><small>本周完成任务</small></div>
      </section>

      <div className="exam-grid">
        <div className="exam-main-column">
          <section className="exam-panel exam-panel--today">
            <div className="exam-panel__head">
              <div><span className="exam-kicker">TODAY</span><h2>今日任务</h2></div>
              <span className="exam-panel__count">{todayTasks.filter((task) => task.status === "completed").length}/{todayTasks.length}</span>
            </div>
            {todayTasks.length ? (
              <div className="exam-task-list">
                {todayTasks.map((task) => (
                  <article className={`exam-task${task.status === "completed" ? " exam-task--done" : ""}`} key={task.id}>
                    <button
                      aria-label={task.status === "completed" ? "标记为未完成" : "标记为完成"}
                      className="exam-task__check"
                      disabled={busy}
                      onClick={() => runMutation(() => updateExamTask(task.id, { status: task.status === "completed" ? "pending" : "completed" }))}
                      type="button"
                    >
                      {task.status === "completed" ? <IconCheck size={16} /> : null}
                    </button>
                    <div className="exam-task__body">
                      <div><span>{task.subject}</span>{task.priority === "high" ? <em>重点</em> : null}</div>
                      <strong>{task.title}</strong>
                      <small>{task.target || "完成后记得补充学习记录"}</small>
                    </div>
                    <span className="exam-task__time"><IconClock size={14} /> {task.estimatedMinutes}m</span>
                    <button className="exam-task__delete" aria-label={`删除${task.title}`} disabled={busy} onClick={() => runMutation(() => deleteExamTask(task.id))} type="button"><IconTrash size={15} /></button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="exam-empty">
                <IconCalendarEvent size={28} />
                <strong>今天还没有安排</strong>
                <p>从一个可以在 60 分钟内完成的任务开始。</p>
                <button onClick={() => openForm("task")} type="button">添加今日任务</button>
              </div>
            )}
          </section>

          <section className="exam-panel">
            <div className="exam-panel__head">
              <div><span className="exam-kicker">PLAN</span><h2>近期计划</h2></div>
              <button className="exam-text-button" onClick={() => openForm("task")} type="button"><IconPlus size={15} /> 新任务</button>
            </div>
            {plannedTasks.length ? (
              <div className="exam-plan-list">
                {plannedTasks.map((task) => (
                  <div className="exam-plan-row" key={task.id}>
                    <time>{displayDate(task.date)}</time>
                    <span className="exam-plan-row__subject">{task.subject}</span>
                    <strong className={task.status === "completed" ? "is-done" : ""}>{task.title}</strong>
                    <span>{task.estimatedMinutes}m</span>
                    <span className={`exam-plan-row__state exam-plan-row__state--${task.status}`}>{task.status === "completed" ? "已完成" : "待完成"}</span>
                  </div>
                ))}
              </div>
            ) : <div className="exam-empty exam-empty--compact">计划为空，先安排本周最重要的三件事。</div>}
          </section>
        </div>

        <aside className="exam-side-column">
          <section className="exam-panel exam-week-card">
            <div className="exam-panel__head"><div><span className="exam-kicker">WEEKLY PACE</span><h2>本周节奏</h2></div></div>
            <ProgressRing value={stats.weekCompletionRate} />
            <p>{stats.weekTaskCount ? `已经完成 ${stats.weekCompletedCount} 项，还有 ${stats.weekTaskCount - stats.weekCompletedCount} 项待推进。` : "添加本周任务后，这里会显示你的推进节奏。"}</p>
          </section>

          <section className="exam-panel">
            <div className="exam-panel__head"><div><span className="exam-kicker">SUBJECTS</span><h2>科目进度</h2></div></div>
            <div className="exam-subject-list">
              {subjectProgress.map((item) => {
                const completion = item.tasks ? Math.round((item.completed / item.tasks) * 100) : 0;
                return (
                  <div className="exam-subject" key={item.subject}>
                    <div><strong>{item.subject}</strong><span>{item.accuracy === null ? `${minutesLabel(item.minutes)}` : `${item.accuracy}% 正确率`}</span></div>
                    <div className="exam-subject__track"><span style={{ width: `${completion}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="exam-panel">
            <div className="exam-panel__head">
              <div><span className="exam-kicker">STUDY LOG</span><h2>最近学习</h2></div>
              <button className="exam-text-button" onClick={() => openForm("log")} type="button"><IconPlus size={15} /> 记录</button>
            </div>
            {recentLogs.length ? (
              <div className="exam-log-list">
                {recentLogs.slice(0, 5).map((log) => (
                  <article className="exam-log" key={log.id}>
                    <div className="exam-log__icon"><IconBook2 size={17} /></div>
                    <div><strong>{log.subject}</strong><span>{log.note || `${log.questions} 题 · 正确 ${log.correct} 题`}</span></div>
                    <time>{log.minutes}m<br /><small>{displayDate(log.date)}</small></time>
                  </article>
                ))}
              </div>
            ) : <div className="exam-empty exam-empty--compact">完成学习后，在这里留下第一条记录。</div>}
          </section>
        </aside>
      </div>
    </div>
  );
}
