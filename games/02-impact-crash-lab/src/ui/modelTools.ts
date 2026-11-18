import type { Configuration } from '../physics/types';
import { validateConfig } from '../physics/obstacles';

interface Tool { name: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean }; execute(input: unknown): unknown | Promise<unknown> }
export interface ModelContext { registerTool(tool: Tool, options?: { signal?: AbortSignal }): void | Promise<void> }
export interface LabActions { read(): unknown; configure(config: Configuration): void; start(): void; reset(): void; busy(): boolean }
export function registerLabTools(context: ModelContext | undefined, actions: () => LabActions) {
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();
  const empty = { type: 'object', properties: {}, additionalProperties: false };
  const configSchema = { type: 'object', properties: { speed: { type: 'number', minimum: 10, maximum: 200 }, mass: { type: 'number', minimum: 700, maximum: 3000 }, angle: { type: 'number', minimum: -60, maximum: 60 }, obstacle: { type: 'string', enum: ['concrete', 'steel', 'light'] } }, required: ['speed', 'mass', 'angle', 'obstacle'], additionalProperties: false };
  const ensureIdle = () => { if (actions().busy()) throw new Error('The experiment is running. Reset it before configuring or starting another.'); };
  const result = async () => { if (typeof requestAnimationFrame === 'function') await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); return actions().read(); };
  const tools: Tool[] = [
    { name: 'read_crash_state', description: 'Read the configuration, current physical state, and completed experiment result.', inputSchema: empty, annotations: { readOnlyHint: true }, execute: () => actions().read() },
    { name: 'configure_crash', description: 'Set all four physical inputs and reset the visible scene. Does not start a crash.', inputSchema: configSchema, annotations: { readOnlyHint: false }, execute: input => { ensureIdle(); if (!input || typeof input !== 'object') throw new Error('Expected configuration object.'); const object = input as Record<string, unknown>; if (Object.keys(object).some(key => !['speed', 'mass', 'angle', 'obstacle'].includes(key))) throw new Error('Unknown configuration field.'); actions().configure(validateConfig(input as Configuration)); return result(); } },
    { name: 'start_crash', description: 'Start a new real-time crash with the visible configuration. Results become available after observation finishes.', inputSchema: empty, annotations: { readOnlyHint: false }, execute: () => { ensureIdle(); actions().start(); return result(); } },
    { name: 'reset_crash', description: 'Abort any running experiment and restore the current configuration. Completed history is kept.', inputSchema: empty, annotations: { readOnlyHint: false }, execute: () => { actions().reset(); return result(); } },
  ];
  for (const tool of tools) { try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch { /* Optional browser capability: visible controls continue to work. */ } }
  return () => lifecycle.abort();
}
