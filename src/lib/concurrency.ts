/**
 * 全局并发控制配置
 * 控制 API 调用的并行数量，避免触发接口频率限制
 */

// 生成首尾帧提示词的并发数（AI 文本接口）
export const KEYFRAME_PROMPTS_CONCURRENCY = parseInt(process.env.KEYFRAME_PROMPTS_CONCURRENCY || "2", 10);

// 批量生成视频提示词的并发数（AI 文本 + 图像接口）
export const VIDEO_PROMPT_CONCURRENCY = parseInt(process.env.VIDEO_PROMPT_CONCURRENCY || "2", 10);

// 批量生成帧的并发数（AI 图像接口，频率限制较宽松）
export const FRAME_GENERATE_CONCURRENCY = parseInt(process.env.FRAME_GENERATE_CONCURRENCY || "2", 10);

/**
 * 带并发限制的并行执行器
 * 使用信号量模式，控制同时执行的任务数量
 */
export class ConcurrencyLimiter<T> {
  private queue: Array<{
    task: () => Promise<T>;
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
  }> = [];
  private running = 0;

  constructor(private limit: number) {
    if (limit < 1) throw new Error("Concurrency limit must be >= 1");
  }

  /**
   * 添加一个任务到队列
   */
  async run(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.process();
    });
  }

  private process() {
    while (this.running < this.limit && this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.running++;
      item.task()
        .then(item.resolve)
        .catch(item.reject)
        .finally(() => {
          this.running--;
          this.process();
        });
    }
  }

  /**
   * 执行一组任务，返回所有结果
   */
  async runAll(tasks: Array<() => Promise<T>>): Promise<T[]> {
    return Promise.all(tasks.map((task) => this.run(task)));
  }
}

/**
 * 简单的 pMap 实现，支持并发限制
 */
export async function pMapLimited<T, R>(
  items: T[],
  mapper: (item: T, index: number) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const limiter = new ConcurrencyLimiter<R>(concurrency);
  return Promise.all(items.map((item, index) => limiter.run(() => mapper(item, index))));
}
