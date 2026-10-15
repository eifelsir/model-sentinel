import React from "react";
import { ChartNoAxesColumnIncreasing } from "lucide-react";
import { aggregateUsage, roundUsage, usageRecords } from "../core/usage.mjs";

const metrics = [
  ["inputTokens", "输入"],
  ["outputTokens", "输出（含推理）"],
  ["totalTokens", "总计"],
  ["cacheReadTokens", "缓存读取"],
  ["cacheWriteTokens", "缓存写入"],
  ["reasoningTokens", "推理（输出内）"],
];
const format = value => value == null ? "未提供" : value.toLocaleString("en-US");
const partial = (summary, field) => summary[field] != null && summary.counts[field] < summary.samples;
const metricTitle = (summary, field) => `${summary.counts[field]} / ${summary.samples} 次请求提供此项用量`;

export function UsageValue({ summary, field }) {
  return <span title={metricTitle(summary, field)}>{format(summary[field])}{partial(summary, field) && <small className="usage-partial">部分</small>}</span>;
}

export function UsageBrief({ round, compact = false }) {
  const summary = roundUsage(round);
  const title = metrics.map(([field, label]) => `${label}：${format(summary[field])}${partial(summary, field) ? "（部分）" : ""}`).join("\n");
  return <span className={`usage-brief ${compact ? "compact-usage" : ""}`} title={title}>Token {format(summary.totalTokens)}{partial(summary, "totalTokens") ? "（部分）" : ""}</span>;
}

export function UsageBreakdown({ values, summary = aggregateUsage(values || []) }) {
  return <dl className="usage-breakdown">
    {metrics.map(([field, label]) => <div key={field}><dt>{label}</dt><dd><UsageValue summary={summary} field={field} /></dd></div>)}
  </dl>;
}

export function UsageSummary({ history }) {
  const records = history.flatMap(usageRecords);
  const summary = aggregateUsage(records.map(record => record.usage));
  const groups = new Map();
  for (const record of records) {
    const key = JSON.stringify([record.targetId, record.model, record.connectionName, record.protocol]);
    if (!groups.has(key)) groups.set(key, { key, model: record.model, connection: record.connectionName, protocol: record.protocol, values: [] });
    groups.get(key).values.push(record.usage);
  }
  return <section className="token-section">
    <div className="section-title"><ChartNoAxesColumnIncreasing size={17} /><h2>Token 使用情况</h2></div>
    <div data-testid="token-summary">
      <p className="usage-scope">已保存历史 · {history.length} 轮 · {summary.samples} 次接口请求</p>
      <UsageBreakdown summary={summary} />
      <p className="usage-coverage">接口返回用量 {summary.reported} / {summary.samples} 次；总计完整 {summary.counts.totalTokens} / {summary.samples} 次</p>
    </div>
    {groups.size > 0 && <div className="token-table-scroll"><table className="token-table" data-testid="token-models">
      <thead><tr><th>模型 / 连接</th><th>请求</th><th>输入</th><th>输出</th><th>总计</th></tr></thead>
      <tbody>{[...groups.values()].map(group => {
        const usage = aggregateUsage(group.values);
        return <tr key={group.key}><td><strong>{group.model}</strong><small>{group.connection} · {group.protocol}</small></td><td>{usage.samples}</td>{["inputTokens", "outputTokens", "totalTokens"].map(field => <td key={field}><UsageValue summary={usage} field={field} /></td>)}</tr>;
      })}</tbody>
    </table></div>}
  </section>;
}
