import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  Cable,
  History,
  Settings,
  Play,
  Square,
  PanelTop,
  AlertTriangle,
  Check,
  LoaderCircle,
  X,
  ExternalLink,
  Minimize2,
  Maximize2,
} from "lucide-react";
import appIcon from "../assets/app.png";
import {
  IconButton,
  Status,
  RoundDetail,
  HistoryBars,
  statuses,
  protocolNames,
  time,
} from "./components.jsx";
import { Workbench, Connections, HistoryPage, SettingsPage } from "./views.jsx";
import { HtmlGallery } from "./html-preview.jsx";
import { UsageBrief } from "./usage.jsx";

const api = window.sentinel;
export default function App() {
  const [state, setState] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [page, setPage] = useState("workbench"),
    [roundId, setRoundId] = useState(null);
  const stateRef = useRef(null),
    seenRound = useRef(null),
    noticeTimer = useRef(null);
  const floating = new URLSearchParams(location.search).get("view") === "float";
  function receive(next) {
    stateRef.current = next;
    setState(next);
    if (
      next.selectedRoundId &&
      next.selectedRoundNonce !== seenRound.current &&
      !floating
    ) {
      seenRound.current = next.selectedRoundNonce;
      setRoundId(next.selectedRoundId);
    }
  }
  useEffect(() => {
    if (!api) {
      setError("桌面连接不可用，请从应用程序启动。");
      return;
    }
    const unsubscribe = api.onState(receive);
    api
      .getState()
      .then(receive)
      .catch((e) => setError(e.message));
    return () => {
      unsubscribe();
      clearTimeout(noticeTimer.current);
    };
  }, []);
  async function act(work, message = "") {
    setError("");
    try {
      const value = await work();
      if (value?.config) receive(value);
      if (message) {
        setNotice(message);
        clearTimeout(noticeTimer.current);
        noticeTimer.current = setTimeout(() => setNotice(""), 2800);
      }
      return value;
    } catch (e) {
      setError(e.message || "操作失败，请重试。");
      throw e;
    }
  }
  async function mutate(change, message = "已保存") {
    if (!stateRef.current) return;
    setBusy(true);
    try {
      const config = structuredClone(stateRef.current.config);
      change(config);
      return await act(() => api.saveConfig(config), message);
    } finally {
      setBusy(false);
    }
  }
  const perform = (work) => {
    void act(work).catch(() => {});
  };
  const props = {
    state,
    mutate,
    busy,
    perform,
    api,
    setPage,
    openRound: setRoundId,
  };
  if (!state)
    return (
      <div className="startup">
        <img src={appIcon} alt="" />
        <h1>模型检测</h1>
        <p>{error || "正在载入本地配置…"}</p>
      </div>
    );
  if (floating)
    return (
      <Floating
        state={state}
        api={api}
        perform={perform}
        error={error || state.error}
      />
    );
  const nav = [
    ["workbench", Activity, "检测工作台"],
    ["connections", Cable, "连接与模型"],
    ["history", History, "检测历史"],
    ["settings", Settings, "设置"],
  ];
  const active = state.activeTargetIds.length > 0;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src={appIcon} alt="" />
          <div>
            <strong>模型检测</strong>
            <small>MODEL SENTINEL</small>
          </div>
        </div>
        <nav aria-label="主导航">
          {nav.map(([id, Icon, label]) => (
            <button
              type="button"
              key={id}
              aria-label={label}
              className={id === page ? "selected" : ""}
              aria-current={id === page ? "page" : undefined}
              onClick={() => setPage(id)}
            >
              <Icon size={18} />
              {label}
              {id === "connections" && state.config.connections.length > 0 && (
                <span className="nav-count">
                  {state.config.connections.length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span
            className={`connection-dot ${active ? "detecting" : "normal"}`}
          />
          {active
            ? `${state.activeTargetIds.length} 个模型检测中`
            : "本地监测就绪"}
          <small>
            {state.config.settings.autoRun ? "自动检测已开启" : "手动检测模式"}
          </small>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            模型检测 <span>/</span> {nav.find((n) => n[0] === page)[2]}
          </div>
          <div className="header-actions">
            <label className="toggle-label" title="自动检测">
              <input
                type="checkbox"
                role="switch"
                aria-label="自动检测"
                checked={state.config.settings.autoRun}
                onChange={(e) => perform(() => api.setAuto(e.target.checked))}
              />
              <span>自动</span>
            </label>
            <IconButton
              icon={PanelTop}
              label={
                state.config.settings.floatVisible ? "隐藏悬浮窗" : "显示悬浮窗"
              }
              aria-pressed={state.config.settings.floatVisible}
              onClick={() =>
                perform(() =>
                  api.setFloatVisible(!state.config.settings.floatVisible),
                )
              }
            />
            <button
              type="button"
              className="button secondary stop-button"
              disabled={!active && !state.config.settings.autoRun}
              onClick={() => perform(() => api.stop())}
              title="停止全部检测并暂停自动检测"
            >
              <Square size={14} />
              停止
            </button>
            <button
              type="button"
              className="button primary"
              disabled={!state.config.targets.some((t) => t.enabled) || busy}
              onClick={() => perform(() => api.run())}
            >
              <Play size={15} />
              检测全部
            </button>
          </div>
        </header>
        {(error || state.error) && (
          <div className="error-banner" role="alert">
            <AlertTriangle size={17} />
            <span>{error || state.error}</span>
            {error && (
              <IconButton
                icon={X}
                label="关闭错误提示"
                onClick={() => setError("")}
              />
            )}
          </div>
        )}
        <main className="page-content" key={page}>
          {page === "workbench" ? (
            <Workbench {...props} />
          ) : page === "connections" ? (
            <Connections {...props} />
          ) : page === "history" ? (
            <HistoryPage {...props} />
          ) : (
            <SettingsPage {...props} />
          )}
        </main>
        <footer className="app-footer">
          <span>
            {state.config.targets.length} 个模型 · {state.config.prompts.length}{" "}
            道题目
          </span>
          <span>
            {busy ? (
              <>
                <LoaderCircle size={12} className="spin" />
                正在保存…
              </>
            ) : notice ? (
              <>
                <Check size={12} />
                {notice}
              </>
            ) : (
              "配置与记录保存在此设备"
            )}
          </span>
        </footer>
      </div>
      <RoundDetail
        round={state.history.find((r) => r.id === roundId)}
        onClose={() => setRoundId(null)}
      />
    </div>
  );
}

function Floating({ state, api, perform, error }) {
  const targets = state.config.targets;
  const latest = targets.map((target) => ({
    target,
    round: state.history.find((r) => r.targetId === target.id),
    connection: state.config.connections.find(
      (c) => c.id === target.connectionId,
    ),
  }));
  const count = (status) =>
    latest.filter((item) => item.round?.status === status).length;
  const overall = count("degraded")
      ? "degraded"
      : count("detecting")
        ? "detecting"
      : count("insufficient")
        ? "insufficient"
        : latest.length &&
            latest.every((item) => item.round?.status === "normal")
          ? "normal"
          : latest.length && latest.every(item => ["normal", "generated"].includes(item.round?.status))
            ? "generated"
          : "pending";
  const last = state.history.find((r) => r.completedAt)?.completedAt;
  const expanded = state.floatExpanded;
  return (
    <div
      className={`float-window ${expanded ? "expanded" : "compact"}`}
      data-testid={expanded ? "float-expanded" : "float-compact"}
    >
      <header className="float-header">
        <img src={appIcon} alt="" />
        <strong>模型检测</strong>
        {expanded && (
          <span className="float-total">{targets.length} 个模型</span>
        )}
        <div className="float-actions">
          <IconButton
            icon={ExternalLink}
            label="打开主窗口"
            onClick={() => perform(() => api.openMain())}
          />
          {expanded && (
            <IconButton
              icon={Minimize2}
              label="收起悬浮窗"
              onClick={() => perform(() => api.expandFloat(false))}
            />
          )}
          <IconButton
            icon={X}
            label="关闭悬浮窗"
            onClick={() => perform(() => api.setFloatVisible(false))}
          />
        </div>
      </header>
      {!expanded ? (
        <div className="float-compact-body">
          <button type="button" className="float-compact-summary" aria-label="展开悬浮窗" onClick={() => perform(() => api.expandFloat(true))}>
            <span className="float-state">
              <Status status={overall} />
              <span className="float-timestamp">{time(last)}</span>
              <Maximize2 size={13} />
            </span>
            <span className="float-counts">
              {!targets.length ? (
                <span>待配置</span>
              ) : (
                <>
                  <span>{targets.length} 个模型</span>
                  <span className={count("degraded") ? "text-danger" : ""}>
                    降智 {count("degraded")}
                  </span>
                  <span className={count("insufficient") ? "text-warning" : ""}>
                    不足 {count("insufficient")}
                  </span>
                </>
              )}
            </span>
          </button>
          {latest.length > 0 && (
            <span className="float-compact-models">
              {latest.map(({ target, connection, round }) => {
                const rounds = state.history.filter(r => r.targetId === target.id);
                return <button type="button" key={target.id} className="float-compact-row" aria-label={`展开模型 ${connection?.name || ""} · ${target.model}`} onClick={() => perform(() => api.expandFloat(true))}>
                  <span className="float-compact-top">
                    <span className="float-compact-identity">
                      <FloatModelName target={target} connection={connection} />
                    </span>
                    <Status status={round?.status} />
                  </span>
                  <span className="float-compact-meter"><HistoryBars rounds={rounds} compact /><UsageBrief round={round} compact /></span>
                  <TextAnswers round={round} compact />
                </button>;
              })}
            </span>
          )}
        </div>
      ) : (
        <div className="float-rows">
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          {!targets.length && (
            <div className="empty-state">
              <Activity size={26} />
              <h3>待配置</h3>
              <button
                type="button"
                className="button secondary"
                onClick={() => perform(() => api.openMain())}
              >
                打开工作台
              </button>
            </div>
          )}
          {latest.map(({ target, connection, round }) => {
            const rounds = state.history
              .filter((r) => r.targetId === target.id)
              .slice(0, 60);
            const answer =
              round?.results.filter(r => r.type !== "html")
                .map((r) => r.answer)
                .filter(Boolean)
                .join(" / ") || "—";
            return (
              <article key={target.id} className="float-model-row">
                <div className="float-model-top">
                  <div className="model-identity">
                    <FloatModelName target={target} connection={connection} />
                    <small>
                      {protocolNames[target.protocol || connection?.protocol]}
                    </small>
                  </div>
                  <div className="float-result">
                    <Status status={round?.status} />
                    <span title={answer}>
                      答案 <strong>{answer}</strong>
                    </span>
                  </div>
                </div>
                <div className="float-legend">
                  <span>最近 60 轮</span>
                  {["normal", "degraded", "insufficient", "detecting", "generated"].filter(s => s !== "generated" || rounds.some(r => r.status === "generated")).map(
                    (status) => (
                      <span key={status}>
                        <i className={`legend-dot ${status}`} />
                        {statuses[status]}{" "}
                        {rounds.filter((r) => r.status === status).length}
                      </span>
                    ),
                  )}
                </div>
                <HistoryBars
                  rounds={rounds}
                  onOpen={(id) => perform(() => api.openMain(id))}
                />
                <div className="bar-times">
                  <span>{time(rounds.at(-1)?.startedAt)}</span>
                  <span title={time(rounds[0]?.startedAt, true)}>
                    {rounds.length ? "现在" : "—"}
                  </span>
                </div>
                <TextAnswers round={round} />
                <UsageBrief round={round} />
                <HtmlGallery rounds={state.history.filter(r => r.targetId === target.id)} />
                <div className="float-bottom">
                  <span>上次开始 {time(round?.startedAt, true)}</span>
                  {round?.textCompletedAt && <span>文字完成 {time(round.textCompletedAt, true)}</span>}
                  <span>上次完成 {time(round?.completedAt, true)}</span>
                  {state.nextRuns[target.id] && (
                    <span>下次 {time(state.nextRuns[target.id])}</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FloatModelName({ target, connection }) {
  const connectionName = connection?.name || "未命名连接";
  return (
    <strong className="float-model-name" title={`${connectionName} · ${target.model}\n${protocolNames[target.protocol || connection?.protocol] || ""}`}>
      <span className="float-connection-label" title={connectionName}>{connectionName}</span>
      <span className="float-name-separator" aria-hidden="true">·</span>
      <span className="float-model-label" title={target.model}>{target.model}</span>
    </strong>
  );
}

function TextAnswers({ round, compact = false }) {
  const results = round?.results.filter(result => result.type !== "html" && result.promptId) || [];
  if (!results.length) return compact ? <span className="float-compact-answers empty">—</span> : null;
  const title = results.map(result => `${result.promptName}：${result.answer || "—"}\n${result.text || ""}`).join("\n\n");
  return (
    <span className={compact ? "float-compact-answers" : "float-text-answers"} title={title}>
      {results.map((result, index) => <span className="float-text-answer" key={`${result.promptId}-${index}`}><span>{result.promptName}</span><strong>{result.answer || result.text || (result.status === "detecting" ? "等待回答…" : "—")}</strong></span>)}
    </span>
  );
}
