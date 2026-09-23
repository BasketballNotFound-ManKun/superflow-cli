import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { auditMap } from "../../src/domains/map-audit.js";

describe("Understand Anything 地图对照", () => {
  it("输出 full/topK/skeleton 三种上下文，不修改图谱", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-map-"));
    const dir = path.join(root, ".understand-anything");
    fs.mkdirSync(dir);
    const graph = { nodes: [{ name: "OrderController", path: "src/OrderController.java" }, { name: "PaymentMapper", path: "src/PaymentMapper.xml" }] };
    fs.writeFileSync(path.join(dir, "knowledge-graph.json"), JSON.stringify(graph));
    const result = auditMap(root, "payment", 1);
    expect(result.graphStatus).toBe("current");
    expect(result.modes.full).toBe(2);
    expect(result.modes.topK[0].name).toBe("PaymentMapper");
    expect(result.modes.skeleton).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "knowledge-graph.json"), "utf8")).nodes).toHaveLength(2);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("图谱缺失时明确 fallback，不伪装召回结果", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "superflow-map-missing-"));
    const result = auditMap(root, "payment");
    expect(result.graphStatus).toBe("missing");
    expect(result.modes.full).toBe(0);
    expect(result.fallback).toContain("图谱缺失");
    fs.rmSync(root, { recursive: true, force: true });
  });
});
