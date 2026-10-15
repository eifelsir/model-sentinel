import React, { useEffect, useRef } from "react";
import {
  X,
  Check,
  AlertTriangle,
  CircleHelp,
  LoaderCircle,
  Circle,
  CodeXml,
} from "lucide-react";
import { HtmlPage } from "./html-preview.jsx";
import { UsageBreakdown } from "./usage.jsx";
import { roundUsage } from "../core/usage.mjs";

export const protocolNames = {
  responses: "OpenAI Responses",
  chat: "Chat Completions",
  gemini: "Gemini 原生",
  anthropic: "Claude Messages",
};
export const statuses = {
  normal: "正常",
  degraded: "降智",
  insufficient: "结果不足",
  detecting: "检测中",
  pending: "未检测",
  generated: "已生成",
};
const icons = {
  normal: Check,
  degraded: AlertTriangle,
  insufficient: CircleHelp,
  detecting: LoaderCircle,
  pending: Circle,
  generated: CodeXml,
};
export const uid = () => crypto.randomUUID();
export function time(value, full = false) {
  if (!value) return "—";
  return new Date(value).toLocaleString(
    "zh-CN",
    full
      ? { hour12: false }
      : {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        },
  );
}
export function reasonText(reason) {
  const reasons = {
    "Answer matches": "提取答案与固定答案一致",
    "Answer differs": "提取答案与固定答案不一致",
    "Pattern did not match": "回复未匹配提取表达式",
    "Invalid regular expression": "提取表达式无效",
    "Regex evaluation requires worker isolation": "正则提取未能执行",
    "Response exceeds answer evaluation limit": "回复过长，无法可靠判定",
    "No final answer text": "未收到最终回复文本",
    "Response is a refusal": "模型拒绝回答",
    "Expected answer is empty": "尚未设置固定答案",
    "Ambiguous answer": "回复包含不确定或多种可能答案",
    "Unable to extract a complete numeric answer": "无法提取完整数值答案",
    "Multiple numeric answers": "回复包含多个数值答案",
    "Unresolved numeric expression": "回复包含尚未计算完成的数值表达式",
    "Contradictory final answers": "回复中的最终答案互相矛盾",
    "Unable to extract an unambiguous final answer": "无法提取明确的最终答案",
    "Regex execution timed out": "提取表达式执行超时",
    "Regex worker failed": "提取表达式执行失败",
    "Regex worker exited": "提取表达式执行中断",
    "No prompts configured": "该模型尚未关联题目",
    "Request failed": "请求失败",
    "API request failed": "服务请求失败，请检查连接和网络",
    "No final assistant text": "服务未返回最终回复文本",
    "Missing or ambiguous assistant choice": "服务未返回唯一的模型回复",
    "Missing or ambiguous model candidate": "服务未返回唯一的模型候选回复",
    "Request timed out": "请求超时",
    "Request cancelled": "请求已停止",
    "Request cancelled before execution": "尚未执行的请求已停止",
    "Request or answer evaluation failed": "请求或答案判定失败",
    "Response did not complete": "服务回复未完整结束",
    "Interrupted by application restart": "应用退出或重启中断了检测",
    "Response truncated": "回复达到输出上限，未完整结束",
    "HTML generated": "已生成 HTML 页面",
    "No HTML document": "回复中没有完整 HTML 页面",
    "Multiple HTML documents": "回复包含多个 HTML 页面，无法确定最终页面",
    "Incomplete HTML document": "HTML 页面未完整结束",
    "Incomplete SVG document": "SVG 绘图未完整结束",
    "HTML document has no SVG": "HTML 页面中没有 SVG 绘图",
    "HTML document exceeds preview limit": "HTML 页面超过预览大小上限",
    "Unsupported reasoning setting for this model/protocol; choose service default or a supported level": "模型或协议不支持当前推理强度，请在模型设置中重新选择",
  };
  if (reasons[reason]) return reasons[reason];
  if (/^HTTP \d{3}$/.test(reason))
    return `服务返回 ${reason}，请检查地址、KEY 和访问权限`;
  if (/truncat|MAX_TOKENS|max_tokens|length|incomplete/i.test(reason))
    return "回复达到输出上限或未完整结束";
  if (/interrupt|restart/i.test(reason)) return "应用退出或重启中断了检测";
  return reason || "等待结果";
}
export function IconButton({ icon: Icon, label, ...props }) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon size={16} />
    </button>
  );
}
export function Status({ status = "pending" }) {
  const Icon = icons[status] || Circle;
  return (
    <span className={`status ${status}`}>
      <Icon size={13} className={status === "detecting" ? "spin" : ""} />
      {statuses[status] || statuses.pending}
    </span>
  );
}
export function Field({ label, children, className = "", hint }) {
  const id = React.useId();
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>{label}</label>
      {React.cloneElement(children, { id })}
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function Modal({
  title,
  onClose,
  closeLabel = "关闭",
  children,
  wide = false,
}) {
  const ref = useRef();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const before = document.activeElement;
    const box = ref.current;
    box.querySelector("button,input,textarea,select")?.focus();
    const key = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
      if (event.key === "Tab") {
        const nodes = [
          ...box.querySelectorAll(
            'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]',
          ),
        ];
        if (!nodes.length) return;
        const first = nodes[0],
          last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      before?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <IconButton icon={X} label={closeLabel} onClick={onClose} />
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}
export function RoundDetail({ round, onClose }) {
  if (!round) return null;
  return (
    <Modal title="检测详情" onClose={onClose} closeLabel="关闭详情" wide>
      <div className="detail-summary">
        <div>
          <strong>{round.model}</strong>
          <p>
            {round.connectionName} · {protocolNames[round.protocol]}
          </p>
        </div>
        <Status status={round.status} />
      </div>
      <div className="detail-times">
        <span>开始 {time(round.startedAt, true)}</span>
        <span>完成 {time(round.completedAt, true)}</span>
      </div>
      <section className="round-usage">
        <h3>本轮 Token</h3>
        <UsageBreakdown summary={roundUsage(round)} />
      </section>
      {round.results.map((result, i) => (
        <article className="result" key={`${result.promptId}-${i}`}>
          <div className="section-title">
            <h3>{result.promptName || "未关联题目"}</h3>
            <Status status={result.status} />
            <span className="muted">
              {(result.elapsedMs / 1000).toFixed(2)} 秒
            </span>
          </div>
          {result.type === "html" ? result.html ? (
            <HtmlPage roundId={round.id} index={i} title={result.promptName} />
          ) : <p className="html-page-empty">未收到完整的 SVG HTML 页面</p> : <div className="answer-pair">
            <div>
              <span className="overline">固定答案</span>
              <pre>{result.expected || "—"}</pre>
            </div>
            <div>
              <span className="overline">提取答案</span>
              <pre>{result.answer || "—"}</pre>
            </div>
          </div>}
          <p className="result-reason">{reasonText(result.reason)}</p>
          <UsageBreakdown values={[result.usage]} />
          <details>
            <summary>提示词原文</summary>
            <pre className="raw-text">{result.prompt || "—"}</pre>
          </details>
          <h4>最终回复</h4>
          <pre className="raw-text">{result.text || "未收到最终回复"}</pre>
        </article>
      ))}
    </Modal>
  );
}
export function HistoryBars({ rounds, onOpen, compact = false }) {
  const ordered = [...rounds].slice(0, 60).reverse();
  if (!ordered.length) return compact ? <span className="compact-bars-empty" title="暂无检测记录" /> : <div className="bars-empty">暂无检测记录</div>;
  return (
    <span className={`history-bars ${compact ? "compact-bars" : ""}`} aria-label="最近检测记录">
      {ordered.map((round) => compact ? (
        <span key={round.id} className={`history-bar ${round.status}`} title={`${time(round.startedAt, true)} · ${statuses[round.status]}`} />
      ) : (
        <button
          key={round.id}
          type="button"
          className={`history-bar ${round.status}`}
          aria-label={`${time(round.startedAt, true)} ${statuses[round.status]}`}
          title={`${time(round.startedAt, true)} · ${statuses[round.status]}\n${round.results.map((r) => r.answer || reasonText(r.reason)).join(" / ")}`}
          onClick={() => onOpen(round.id)}
        />
      ))}
    </span>
  );
}
