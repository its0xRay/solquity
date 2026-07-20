import { ObservedVariant } from "./reconciliation";

export type ReconciliationSnapshot = {
  observedAt: number;
  variants: ObservedVariant[];
};

export interface ReconciliationStore {
  load(): Promise<ReconciliationSnapshot | null>;
  save(snapshot: ReconciliationSnapshot): Promise<void>;
}

export class MemoryReconciliationStore implements ReconciliationStore {
  private snapshot: ReconciliationSnapshot | null = null;
  async load() { return this.snapshot; }
  async save(snapshot: ReconciliationSnapshot) { this.snapshot = structuredClone(snapshot); }
}
