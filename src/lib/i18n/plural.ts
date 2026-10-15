/** Polish plural: 1 słowo · 2–4 słowa (except 12–14) · 5+ słów */
export function plPlural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one
  const m10 = n % 10
  const m100 = n % 100
  if (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14)) return few
  return many
}

export const enPlural = (n: number, one: string, other: string) => (n === 1 ? one : other)
