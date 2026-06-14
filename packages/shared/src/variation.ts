import { z } from 'zod';

// AI returns a map of platform -> text.
export const AIVariationsSchema = z.record(z.string(), z.string());
export type AIVariations = z.infer<typeof AIVariationsSchema>;

export function charCount(s: string): number {
  return [...s].length;
}

export function buildVariationPrompt(sourceText: string, platforms: string[]): string {
  return [
    'You are a social media copywriter. Rewrite the source post for each target platform,',
    "respecting each platform's tone and length norms. Return ONLY a JSON object mapping",
    `each platform name to its rewritten text. Platforms: ${platforms.join(', ')}.`,
    '',
    `Source post:\n${sourceText}`,
  ].join('\n');
}
