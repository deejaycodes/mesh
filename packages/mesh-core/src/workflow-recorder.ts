import type { Address } from "./address.js";
import type { Workflow, WorkflowEvent, WorkflowEventData, WorkflowEventKind, WorkflowStatus } from "./workflow.js";

/**
 * Write-side contract for durable workflows.
 *
 * Defined in @corelay/mesh-core so callers (like run()) can accept a
 * WorkflowRecorder without depending on a specific storage package.
 * @corelay/mesh-postgres provides the production implementation; tests can
 * pass an in-memory stub.
 */
export interface WorkflowRecorder {
  createWorkflow(rootPeer: Address): Promise<Workflow>;
  appendEvent(
    workflowId: string,
    kind: WorkflowEventKind,
    data: WorkflowEventData,
  ): Promise<WorkflowEvent>;
  updateStatus(
    workflowId: string,
    status: WorkflowStatus,
    error?: string,
  ): Promise<void>;
}
