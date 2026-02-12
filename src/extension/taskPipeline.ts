import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createModuleLogger } from '../shared/logger';

const log = createModuleLogger('TaskPipeline');

// ============================================================================
// Types
// ============================================================================

export interface PipelineStep {
  id: string;
  title: string;
  prompt: string;
  contextFiles?: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
}

export interface Pipeline {
  id: string;
  goal: string;
  steps: PipelineStep[];
  status: 'planning' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStepIndex: number;
}

export type PipelineEvent =
  | { type: 'pipelineCreated'; pipeline: Pipeline }
  | { type: 'stepStarted'; stepId: string; stepIndex: number }
  | { type: 'stepCompleted'; stepId: string; stepIndex: number }
  | { type: 'stepFailed'; stepId: string; stepIndex: number; error: string }
  | { type: 'pipelineCompleted'; pipeline: Pipeline }
  | { type: 'pipelineFailed'; pipeline: Pipeline; error: string }
  | { type: 'pipelineCancelled'; pipeline: Pipeline };

// ============================================================================
// TaskPipeline Service
// ============================================================================

const MAX_FILE_CONTENT = 3000;

export class TaskPipeline {
  private _pipeline: Pipeline | null = null;
  private _cancelled = false;
  private _onEvent: (event: PipelineEvent) => void;

  constructor(onEvent: (event: PipelineEvent) => void) {
    this._onEvent = onEvent;
  }

  /**
   * Phase 1: Decompose a high-level goal into 2-6 steps using claude -p.
   */
  async plan(goal: string, workspaceRoot: string): Promise<Pipeline> {
    this._cancelled = false;

    const pipelineId = `pipeline-${Date.now()}`;
    this._pipeline = {
      id: pipelineId,
      goal,
      steps: [],
      status: 'planning',
      currentStepIndex: -1,
    };

    const planPrompt = `You are a task planner. Decompose this goal into 2-6 sequential steps.
Each step should be a concrete, actionable task that a coding AI assistant can execute.

Goal: ${goal}

Working directory: ${workspaceRoot}

Respond with ONLY a JSON array. No markdown, no explanation. Example format:
[
  {"title": "Step title", "prompt": "Detailed instruction for the AI", "contextFiles": ["src/file.ts"]},
  {"title": "Step title", "prompt": "Detailed instruction for the AI"}
]

Rules:
- Each step must be self-contained with enough context
- contextFiles is optional: list relevant files the AI should read
- Keep prompts detailed and specific
- 2-6 steps maximum
- Steps execute sequentially, so later steps can reference earlier work`;

    try {
      const stdout = await this._runClaudePrint(planPrompt, workspaceRoot);
      const steps = this._parseSteps(stdout, goal);

      this._pipeline.steps = steps;
      this._pipeline.status = 'running';
      this._onEvent({ type: 'pipelineCreated', pipeline: { ...this._pipeline } });

      return this._pipeline;
    } catch (err) {
      // Fallback: create single step with the original goal
      log.warn('Pipeline planning failed, using single-step fallback', { error: String(err) });
      this._pipeline.steps = [{
        id: `step-${Date.now()}-0`,
        title: goal.substring(0, 60),
        prompt: goal,
        status: 'pending',
      }];
      this._pipeline.status = 'running';
      this._onEvent({ type: 'pipelineCreated', pipeline: { ...this._pipeline } });
      return this._pipeline;
    }
  }

  /**
   * Phase 2: Get the next step's enhanced prompt.
   * Returns null when all steps are done.
   */
  prepareNextStep(workspaceRoot: string): string | null {
    if (!this._pipeline || this._cancelled) return null;

    const nextIndex = this._pipeline.currentStepIndex + 1;
    if (nextIndex >= this._pipeline.steps.length) {
      this._pipeline.status = 'completed';
      this._onEvent({ type: 'pipelineCompleted', pipeline: { ...this._pipeline } });
      return null;
    }

    const step = this._pipeline.steps[nextIndex];
    step.status = 'running';
    this._pipeline.currentStepIndex = nextIndex;

    this._onEvent({ type: 'stepStarted', stepId: step.id, stepIndex: nextIndex });

    // Build enhanced prompt with context file contents
    let prompt = `[Pipeline Step ${nextIndex + 1}/${this._pipeline.steps.length}: ${step.title}]\n\n`;
    prompt += step.prompt;

    if (step.contextFiles && step.contextFiles.length > 0) {
      prompt += '\n\n[Relevant files for this step]\n';
      for (const relPath of step.contextFiles) {
        const absPath = path.join(workspaceRoot, relPath);
        try {
          if (fs.existsSync(absPath)) {
            const content = fs.readFileSync(absPath, 'utf8');
            const truncated = content.length > MAX_FILE_CONTENT
              ? content.substring(0, MAX_FILE_CONTENT) + '\n...truncated'
              : content;
            prompt += `\n--- ${relPath} ---\n${truncated}\n`;
          }
        } catch { /* skip unreadable files */ }
      }
    }

    return prompt;
  }

  /**
   * Called when a step completes successfully (from onProcessEnd).
   */
  markStepCompleted(): void {
    if (!this._pipeline) return;
    const step = this._pipeline.steps[this._pipeline.currentStepIndex];
    if (step) {
      step.status = 'completed';
      this._onEvent({
        type: 'stepCompleted',
        stepId: step.id,
        stepIndex: this._pipeline.currentStepIndex,
      });
    }
  }

  /**
   * Called when a step fails (from onError).
   */
  markStepFailed(error: string): void {
    if (!this._pipeline) return;
    const step = this._pipeline.steps[this._pipeline.currentStepIndex];
    if (step) {
      step.status = 'failed';
      step.error = error;
      this._onEvent({
        type: 'stepFailed',
        stepId: step.id,
        stepIndex: this._pipeline.currentStepIndex,
        error,
      });
    }
    this._pipeline.status = 'failed';
    this._onEvent({ type: 'pipelineFailed', pipeline: { ...this._pipeline }, error });
  }

  cancel(): void {
    this._cancelled = true;
    if (this._pipeline && this._pipeline.status === 'running') {
      this._pipeline.status = 'cancelled';
      this._onEvent({ type: 'pipelineCancelled', pipeline: { ...this._pipeline } });
    }
  }

  get isRunning(): boolean {
    return this._pipeline?.status === 'running' && !this._cancelled;
  }

  get currentPipeline(): Pipeline | null {
    return this._pipeline;
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private _runClaudePrint(prompt: string, cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = cp.spawn('claude', ['-p', prompt, '--output-format', 'text', '--model', 'claude-haiku-4-5-20251001'], {
        cwd,
        shell: process.platform === 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      proc.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        if (code !== 0 && !stdout) {
          reject(new Error(`claude -p exited with code ${code}: ${stderr}`));
        } else {
          resolve(stdout);
        }
      });

      proc.on('error', (err) => reject(err));

      // 60s timeout for planning
      setTimeout(() => {
        try { if (!proc.killed) proc.kill('SIGTERM'); } catch { /* already dead */ }
        reject(new Error('Planning timed out after 60s'));
      }, 60000);
    });
  }

  private _parseSteps(stdout: string, fallbackGoal: string): PipelineStep[] {
    try {
      // Extract JSON array from output (may have surrounding text)
      const jsonMatch = stdout.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('No JSON array found');

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        title: string;
        prompt: string;
        contextFiles?: string[];
      }>;

      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty steps array');

      // Cap at 6 steps
      const capped = parsed.slice(0, 6);
      return capped.map((s, i) => ({
        id: `step-${Date.now()}-${i}`,
        title: s.title || `Step ${i + 1}`,
        prompt: s.prompt || fallbackGoal,
        contextFiles: s.contextFiles,
        status: 'pending' as const,
      }));
    } catch (err) {
      log.warn('Failed to parse pipeline steps', { error: String(err), stdout: stdout.substring(0, 200) });
      throw err;
    }
  }
}
