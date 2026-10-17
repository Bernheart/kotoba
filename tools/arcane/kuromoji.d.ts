declare module 'kuromoji' {
  import type { KuromojiToken } from './mine'

  export interface Tokenizer {
    tokenize(text: string): KuromojiToken[]
  }

  const kuromoji: {
    builder(opts: { dicPath: string }): { build(cb: (err: Error | null, tokenizer: Tokenizer) => void): void }
  }
  export default kuromoji
}
