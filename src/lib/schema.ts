import { z } from 'zod'
import { WORD_TYPES } from './types'

export const exampleSchema = z.object({
  ja: z.string().min(1),
  kana: z.string().optional(),
  en: z.string().min(1),
  pl: z.string().min(1),
  ref: z.string().optional(),
})

export const wordSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'id must be lowercase slug'),
  japanese: z.string().min(1),
  kana: z.string().min(1),
  romaji: z.string().optional(),
  furigana: z.string().optional(),
  alt: z.array(z.string()).optional(),
  tts: z.string().optional(),
  en: z.string().min(1),
  pl: z.string().min(1),
  type: z.enum(WORD_TYPES),
  genkiLesson: z.number().int().min(0).max(99),
  tags: z.array(z.string()),
  example: exampleSchema.optional(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  frequency: z.number().optional(),
  deck: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'deck must be lowercase slug').optional(),
  verify: z.string().optional(),
})

export const lessonFileSchema = z.object({
  lesson: z.number().int(),
  title: z.object({ en: z.string(), pl: z.string(), ja: z.string().optional() }),
  words: z.array(wordSchema),
})
