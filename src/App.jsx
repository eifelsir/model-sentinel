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
} from "lucide-react";
import appIcon from "../assets/app.png";
import {
  IconButton,
  RoundDetail,
} from "./components.jsx";
import { Workbench, Connections, HistoryPage, SettingsPage } from "./views.jsx";
import { Floating } from "./Floating.jsx";

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
