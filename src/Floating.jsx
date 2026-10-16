import React, { useEffect, useRef, useState } from "react";
import {
  Activity, ArrowLeft, ChevronDown, ChevronRight, ExternalLink,
  Minimize2, Pin, PinOff, X,
} from "lucide-react";
import appIcon from "../assets/app.png";
import { IconButton, Status, HistoryBars, statuses, protocolNames, time } from "./components.jsx";
import { HtmlGallery } from "./html-preview.jsx";
import { UsageBrief } from "./usage.jsx";

export function Floating({ state, api, perform, error }) {
  const [pinned, setPinned] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const windowRef = useRef(null);
  const pinnedRef = useRef(false), hoverTimer = useRef(null), leaveTimer = useRef(null);
  const expanded = state.floatExpanded;
  const targets = state.config.targets;
  const latest = targets.map(target => ({
    target,
    round: state.history.find(round => round.targetId === target.id),
    connection: state.config.connections.find(connection => connection.id === target.connectionId),
    rounds: state.history.filter(round => round.targetId === target.id),
  }));
  const count = status => latest.filter(item => item.round?.status === status).length;
  const overall = count("degraded") ? "degraded"
    : count("detecting") ? "detecting"
      : count("insufficient") ? "insufficient"
        : latest.length && latest.every(item => item.round?.status === "normal") ? "normal"
          : latest.length && latest.every(item => ["normal", "generated"].includes(item.round?.status)) ? "generated"
            : "pending";
  const selected = latest.find(item => item.target.id === selectedId);
  const last = state.history.find(round => round.completedAt)?.completedAt;

  function clearTimers() {
    clearTimeout(hoverTimer.current);
    clearTimeout(leaveTimer.current);
  }
  function pin(value) {
    pinnedRef.current = value;
    setPinned(value);
    clearTimers();
  }
  function collapse() {
    pin(false);
    setSelectedId(null);
    perform(() => api.expandFloat(false));
  }
  function open(targetId = null) {
    pin(true);
    setSelectedId(targetId);
    perform(() => api.expandFloat(true));
  }
  function enter() {
    clearTimeout(leaveTimer.current);
  }
  function hover() {
    enter();
    if (expanded) return;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => perform(() => api.expandFloat(true)), 180);
  }
  function leave() {
    clearTimers();
    if (pinnedRef.current) return;
    leaveTimer.current = setTimeout(() => {
      if (!pinnedRef.current) collapse();
    }, 320);
  }
  useEffect(() => {
    if (!expanded) {
      pin(false);
      setSelectedId(null);
    }
  }, [expanded]);
  useEffect(() => {
    if (!expanded || pinned) return;
    let outsideAt = null;
    // Native resizing can clear hover without delivering a mouseleave event.
    const timer = setInterval(() => {
      if (windowRef.current?.matches(":hover")) outsideAt = null;
      else {
        outsideAt ??= performance.now();
        if (performance.now() - outsideAt >= 320) collapse();
      }
    }, 100);
    return () => clearInterval(timer);
  }, [expanded, pinned]);
  useEffect(() => {
    function keydown(event) {
      if (event.key === "Escape") collapse();
    }
    window.addEventListener("keydown", keydown);
    return () => {
      clearTimers();
      window.removeEventListener("keydown", keydown);
    };
  }, []);

  return (
    <div
      ref={windowRef}
      className={`float-window ${expanded ? "expanded" : "compact"}`}
      data-testid={expanded ? "float-expanded" : "float-compact"}
      onMouseEnter={enter}
      onMouseLeave={leave}
    >
      <header className="float-header">
        {expanded && selected && <IconButton icon={ArrowLeft} label="返回模型列表" onClick={() => setSelectedId(null)} />}
        <img src={appIcon} alt="" />
        <strong>模型检测</strong>
        {expanded && <span className="float-total">{targets.length} 个模型</span>}
        <div className="float-actions">
          {expanded && <IconButton
            icon={pinned ? PinOff : Pin}
            label={pinned ? "取消固定悬浮窗" : "固定悬浮窗"}
            aria-pressed={pinned}
            onClick={() => pin(!pinned)}
          />}
          <IconButton icon={ExternalLink} label="打开主窗口" onClick={() => perform(() => api.openMain())} />
          {expanded && <IconButton icon={Minimize2} label="收起悬浮窗" onClick={collapse} />}
          <IconButton icon={X} label="关闭悬浮窗" onClick={() => {
            clearTimers();
            perform(() => api.setFloatVisible(false));
          }} />
        </div>
      </header>
      {!expanded ? (
        <div className="float-compact-body" onMouseEnter={hover}>
          <button type="button" className="float-compact-summary" aria-label="展开悬浮窗" onClick={() => open()}>
            <Status status={overall} />
            <span className="float-counts">{targets.length ? `${targets.length} 个模型` : "待配置"}</span>
            {error && <span className="float-error-dot" title={error} aria-label={error} />}
            <time className="float-timestamp">{time(last)}</time>
            <ChevronDown size={13} />
          </button>
          <div className="float-compact-models">
            {latest.map(({ target, connection, round, rounds }) => (
              <button
                type="button"
                key={target.id}
                className="float-compact-row"
                aria-label={`展开模型 ${connection?.name || ""} · ${target.model}`}
                onClick={() => open(target.id)}
              >
                <span className="float-compact-top">
                  <span className="float-compact-identity"><FloatModelName target={target} connection={connection} /></span>
                  <Status status={round?.status} />
                </span>
                <TextAnswers round={round} compact />
                <span className="float-compact-meter"><HistoryBars rounds={rounds} compact /><UsageBrief round={round} compact /></span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className={`float-rows ${selected ? "float-detail" : "float-list"}`} onMouseEnter={enter}>
          {error && <div className="error-banner" role="alert">{error}</div>}
          {!targets.length && <div className="empty-state">
            <Activity size={26} />
            <h3>待配置</h3>
            <button type="button" className="button secondary" onClick={() => perform(() => api.openMain())}>打开工作台</button>
          </div>}
          {(selected ? [selected] : latest).map(({ target, connection, round, rounds }) => (
            <article key={target.id} className="float-model-row">
              {selected ? (
                <div className="float-model-top">
                  <div className="model-identity">
                    <FloatModelName target={target} connection={connection} />
                    <small>{protocolNames[target.protocol || connection?.protocol]}</small>
                  </div>
                  <Status status={round?.status} />
                </div>
              ) : (
                <button type="button" className="float-model-select" aria-label={`查看模型 ${connection?.name || ""} · ${target.model}`} onClick={() => open(target.id)}>
                  <div className="model-identity">
                    <FloatModelName target={target} connection={connection} />
                    <small>{protocolNames[target.protocol || connection?.protocol]}</small>
                  </div>
                  <Status status={round?.status} />
                  <ChevronRight size={15} />
                </button>
              )}
              <TextAnswers round={round} />
              <div className="float-legend">
                <span>最近 60 轮</span>
                {["normal", "degraded", "insufficient", "detecting", "generated"]
                  .filter(status => rounds.some(round => round.status === status))
                  .map(status => <span key={status}><i className={`legend-dot ${status}`} />{statuses[status]} {rounds.slice(0, 60).filter(round => round.status === status).length}</span>)}
              </div>
              <HistoryBars rounds={rounds.slice(0, 60)} onOpen={id => perform(() => api.openMain(id))} />
              <div className="bar-times">
                <span>{time(rounds.slice(0, 60).at(-1)?.startedAt)}</span>
                <span title={time(round?.startedAt, true)}>{rounds.length ? "现在" : "—"}</span>
              </div>
              <UsageBrief round={round} />
              {selected && <HtmlGallery rounds={rounds} onOpen={(id, index) => perform(() => api.openHtml(id, index))} />}
              <div className="float-bottom">
                {selected && <span>上次开始 {time(round?.startedAt, true)}</span>}
                {selected && round?.textCompletedAt && <span>文字完成 {time(round.textCompletedAt, true)}</span>}
                <span>上次完成 {time(round?.completedAt, true)}</span>
                {state.nextRuns[target.id] && <span>下次 {time(state.nextRuns[target.id])}</span>}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function FloatModelName({ target, connection }) {
  const name = connection?.name || "未命名连接";
  return (
    <strong className="float-model-name" title={`${name} · ${target.model}`}>
      <span className="float-connection-label" title={name}>{name}</span>
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
      {results.map((result, index) => <span className="float-text-answer" key={`${result.promptId}-${index}`}>
        <span>{result.promptName}</span>
        <strong>{result.answer || result.text || (result.status === "detecting" ? "等待回答…" : "—")}</strong>
      </span>)}
    </span>
  );
}
