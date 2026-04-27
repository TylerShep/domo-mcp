import { describe, expect, it } from "vitest";
import { parseDatasetName } from "../../src/domo/governance.js";

describe("parseDatasetName", () => {
  it("parses 3-segment name with versioned stage", () => {
    const p = parseDatasetName("PROD2D | Sales | Pipeline Snapshot");
    expect(p.stage).toBe("PROD");
    expect(p.stageLabel).toBe("Production");
    expect(p.version).toBe("2");
    expect(p.frequency).toBe("D");
    expect(p.frequencyLabel).toBe("Daily");
    expect(p.topic).toBe("Sales");
    expect(p.specificName).toBe("Pipeline Snapshot");
    expect(p.segmentCount).toBe(3);
  });

  it("parses 3-segment name with bare stage", () => {
    const p = parseDatasetName("PROD | Operations | Daily Orders");
    expect(p.stage).toBe("PROD");
    expect(p.version).toBe("");
    expect(p.frequency).toBe("");
    expect(p.topic).toBe("Operations");
    expect(p.specificName).toBe("Daily Orders");
  });

  it("handles 4+ segments by joining the rest into specificName", () => {
    const p = parseDatasetName("BETA2W | LC | calls | property | month");
    expect(p.topic).toBe("LC");
    expect(p.specificName).toBe("calls | property | month");
    expect(p.segmentCount).toBe(5);
  });

  it("handles a single-segment name", () => {
    const p = parseDatasetName("CWM");
    expect(p.stage).toBe("");
    expect(p.topic).toBe("");
    expect(p.specificName).toBe("CWM");
  });

  it("returns empty parsed name for empty input", () => {
    const p = parseDatasetName("");
    expect(p.specificName).toBe("");
    expect(p.segmentCount).toBe(0);
  });
});
