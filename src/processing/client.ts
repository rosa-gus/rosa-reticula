import type { Frame, Parameters } from "../core/types.ts";
import type { ProcessRequest, ProcessResponse } from "./protocol.ts";

interface Job {
  revision: number;
  sourceId: number;
  frame: Frame;
  parameters: Parameters;
}
export class ProcessingClient {
  private worker: Worker;
  private busy = false;
  private pending: Job | undefined;
  private loadedSource = -1;
  private failed = false;
  private receive: (response: ProcessResponse) => void;
  constructor(receive: (response: ProcessResponse) => void) {
    this.receive = receive;
    this.worker = new Worker(new URL("./image.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = ({ data }: MessageEvent<ProcessResponse>) => {
      this.busy = false;
      this.receive(data);
      const next = this.pending;
      this.pending = undefined;
      if (next) this.submit(next);
    };
    this.worker.onerror = () => {
      this.failed = true;
      this.busy = false;
      this.pending = undefined;
      this.receive({ type: "error", revision: -1, code: "workerStopped" });
    };
  }
  submit(job: Job): void {
    if (this.failed) {
      this.receive({
        type: "error",
        revision: job.revision,
        code: "workerRestart",
      });
      return;
    }
    if (this.busy) {
      this.pending = job;
      return;
    }
    this.busy = true;
    const message: ProcessRequest = {
      type: "process",
      revision: job.revision,
      sourceId: job.sourceId,
      parameters: job.parameters,
    };
    const transfers: Transferable[] = [];
    if (job.sourceId !== this.loadedSource) {
      message.frame = { ...job.frame, rgba: job.frame.rgba.slice() };
      transfers.push(message.frame.rgba.buffer as ArrayBuffer);
      this.loadedSource = job.sourceId;
    }
    this.worker.postMessage(message, transfers);
  }
  dispose(): void {
    this.worker.terminate();
    this.pending = undefined;
  }
}
