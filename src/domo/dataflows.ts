import type { DomoClient } from "./client.js";

const DATAFLOW_PATH = "/api/dataprocessing/v1/dataflows";

const ACTION_TYPE_LABELS: Record<string, string> = {
  LoadFromVault: "Input (Load Dataset)",
  PublishToVault: "Output (Write Dataset)",
  Filter: "Filter Rows",
  SelectValues: "Select / Rename Columns",
  ExpressionEvaluator: "Add Formula Column",
  MergeJoin: "Join",
  UnionAll: "Append Rows (Union)",
  Metadata: "Edit Schema (Metadata)",
  GroupBy: "Group By / Aggregate",
  Pivot: "Pivot",
  Unpivot: "Unpivot",
  Rank: "Rank & Window",
  TextFormat: "Text Formatting",
  SplitColumn: "Split Column",
  SetOperation: "Set Operation",
  Sample: "Sample Rows",
  Sort: "Sort",
};

interface RawAction {
  id?: string;
  name?: string;
  type?: string;
  dependsOn?: string[];
  dataSourceId?: string;
  sourceType?: string;
  executeFlowWhenUpdated?: boolean;
  updateMethod?: string;
  filterList?: Array<{
    expression?: string;
    leftField?: string;
    operator?: string;
    rightValue?: unknown;
  }>;
  columns?: Array<{ sourceName?: string; name?: string; type?: string }>;
  expressions?: Array<{
    outputColumn?: string;
    name?: string;
    expression?: string;
    expr?: string;
    type?: string;
  }>;
  joinType?: string;
  leftInput?: string;
  rightInput?: string;
  joinConditions?: unknown[];
  inputs?: string[];
  groupByColumns?: unknown[];
  aggregations?: unknown[];
  [key: string]: unknown;
}

interface RawDataflow {
  id?: number;
  name?: string;
  magic?: boolean;
  created?: string | number;
  modified?: string | number;
  enabled?: boolean;
  paused?: boolean;
  runState?: string;
  executionCount?: number;
  lastExecution?: {
    state?: string;
    began?: string | number;
    ended?: string | number;
    rowsProcessed?: number;
  };
  actions?: RawAction[];
}

export interface DataflowDocumentation {
  dataflow: {
    id: number | undefined;
    name: string | undefined;
    type: string;
    created: string | number | undefined;
    modified: string | number | undefined;
    enabled: boolean | undefined;
    paused: boolean | undefined;
    run_state: string | undefined;
    execution_count: number | undefined;
    last_execution: {
      state: string | undefined;
      began: string | number | undefined;
      ended: string | number | undefined;
      rows_processed: number | undefined;
    } | null;
  };
  step_counts: { total: number; inputs: number; transforms: number; outputs: number };
  inputs: SummarizedAction[];
  transforms: SummarizedAction[];
  outputs: SummarizedAction[];
}

interface SummarizedAction {
  id: string | undefined;
  name: string;
  type: string;
  type_label: string;
  depends_on: Array<{ id: string; name: string }>;
  details: Record<string, unknown>;
}

export class DataflowsApi {
  constructor(private readonly client: DomoClient) {}

  async document(dataflowId: number | string): Promise<DataflowDocumentation> {
    const raw = await this.client.request<RawDataflow>({
      host: "instance",
      path: `${DATAFLOW_PATH}/${encodeURIComponent(String(dataflowId))}`,
    });
    return buildDocumentation(raw);
  }
}

function buildDocumentation(raw: RawDataflow): DataflowDocumentation {
  const actions = raw.actions ?? [];
  const idToName: Record<string, string> = {};
  for (const a of actions) {
    if (a.id) idToName[a.id] = a.name ?? "";
  }

  const summarized = actions.map((a) => summarize(a, idToName));
  const inputs = summarized.filter((s) => s.type === "LoadFromVault");
  const outputs = summarized.filter((s) => s.type === "PublishToVault");
  const transforms = summarized.filter(
    (s) => s.type !== "LoadFromVault" && s.type !== "PublishToVault",
  );

  const lastExec = raw.lastExecution;
  return {
    dataflow: {
      id: raw.id,
      name: raw.name,
      type: raw.magic ? "Magic ETL" : "SQL Dataflow",
      created: raw.created,
      modified: raw.modified,
      enabled: raw.enabled,
      paused: raw.paused,
      run_state: raw.runState,
      execution_count: raw.executionCount,
      last_execution: lastExec
        ? {
            state: lastExec.state,
            began: lastExec.began,
            ended: lastExec.ended,
            rows_processed: lastExec.rowsProcessed,
          }
        : null,
    },
    step_counts: {
      total: summarized.length,
      inputs: inputs.length,
      transforms: transforms.length,
      outputs: outputs.length,
    },
    inputs,
    transforms,
    outputs,
  };
}

function summarize(action: RawAction, idToName: Record<string, string>): SummarizedAction {
  const atype = action.type ?? "Unknown";
  const dependsOn = (action.dependsOn ?? []).map((dep) => ({
    id: dep,
    name: idToName[dep] ?? dep,
  }));
  let details: Record<string, unknown> = {};
  switch (atype) {
    case "LoadFromVault":
      details = {
        dataset_id: action.dataSourceId,
        source_type: action.sourceType,
        trigger_on_update: action.executeFlowWhenUpdated ?? false,
      };
      break;
    case "PublishToVault":
      details = {
        dataset_id: action.dataSourceId,
        update_method: action.updateMethod,
      };
      break;
    case "Filter":
      details = {
        conditions: (action.filterList ?? []).map((f) =>
          f.expression
            ? { expression: f.expression }
            : { left_field: f.leftField, operator: f.operator, right_value: f.rightValue },
        ),
      };
      break;
    case "SelectValues":
      details = {
        columns: (action.columns ?? []).map((c) => ({
          source_name: c.sourceName ?? c.name,
          output_name: c.name,
          type: c.type,
        })),
      };
      break;
    case "ExpressionEvaluator":
      details = {
        formulas: (action.expressions ?? []).map((e) => ({
          output_column: e.outputColumn ?? e.name,
          expression: e.expression ?? e.expr,
          type: e.type,
        })),
      };
      break;
    case "MergeJoin":
      details = {
        join_type: action.joinType,
        left_input: { id: action.leftInput, name: idToName[action.leftInput ?? ""] ?? "" },
        right_input: { id: action.rightInput, name: idToName[action.rightInput ?? ""] ?? "" },
        join_conditions: action.joinConditions ?? [],
      };
      break;
    case "UnionAll":
      details = {
        inputs: (action.inputs ?? []).map((inp) => ({ id: inp, name: idToName[inp] ?? inp })),
      };
      break;
    case "GroupBy":
      details = {
        group_by_columns: action.groupByColumns ?? [],
        aggregations: action.aggregations ?? [],
      };
      break;
    default: {
      const skip = new Set([
        "type",
        "id",
        "name",
        "dependsOn",
        "gui",
        "settings",
        "tables",
        "previewRowLimit",
        "propagateAi",
        "filterPolicy",
      ]);
      const rest: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(action)) {
        if (!skip.has(k)) rest[k] = v;
      }
      details = rest;
      break;
    }
  }
  return {
    id: action.id,
    name: action.name ?? "(unnamed)",
    type: atype,
    type_label: ACTION_TYPE_LABELS[atype] ?? atype,
    depends_on: dependsOn,
    details,
  };
}
