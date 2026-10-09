export const SYSTEM_PROMPT: string;
export const JSON_SCHEMA: Record<string, unknown>;
export function decisionFrame(input: any): { status: string; mangler: string[] };
export function buildContext(input: any, references: any[]): any;
export function validateAssessment(parsed: any, input: any, references: any[]): any;
