import fs from "node:fs";
import path from "node:path";

export interface MapAuditResult {
  graphPath: string | null;
  graphStatus: "current" | "missing" | "invalid";
  modes: { full: number; topK: Array<{ name: string; score: number }>; skeleton: string[] };
  fallback: string;
}

export function auditMap(root: string, query = "", limit = 8): MapAuditResult {
  const graphPath = path.join(root, ".understand-anything", "knowledge-graph.json");
  if (!fs.existsSync(graphPath)) return { graphPath: null, graphStatus: "missing", modes: { full: 0, topK: [], skeleton: [] }, fallback: "使用源码目录和符号检索；Understand Anything 图谱缺失" };
  let graph: any;
  try { graph = JSON.parse(fs.readFileSync(graphPath, "utf8")); } catch { return { graphPath, graphStatus: "invalid", modes: { full: 0, topK: [], skeleton: [] }, fallback: "图谱不可解析，回退到源码事实核实" }; }
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const topK = nodes.map((node: any) => {
    const text = JSON.stringify(node).toLowerCase();
    return { name: String(node.name ?? node.path ?? node.id ?? "unknown"), score: tokens.length ? tokens.reduce((sum, token) => sum + (text.includes(token) ? 1 : 0), 0) : 0 };
  }).filter((item: { score: number }) => !tokens.length || item.score > 0).sort((a: { score: number }, b: { score: number }) => b.score - a.score).slice(0, limit);
  const skeleton = nodes.map((node: any) => String(node.path ?? node.file ?? node.name ?? "")).filter(Boolean).slice(0, limit);
  return { graphPath, graphStatus: "current", modes: { full: nodes.length, topK, skeleton }, fallback: "所有候选仍需回到当前源码和真实调用方核实" };
}
