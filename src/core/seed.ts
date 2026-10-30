/** 解析 URL 查询参数中的可选 32 位无符号固定种子；无效输入时使用调用方提供的默认种子。 */
export function resolveSeed(search: string, fallbackSeed: number): number {
  const fallback = fallbackSeed >>> 0;
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null || !/^\d+$/.test(raw)) return fallback;

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 0xffff_ffff) return fallback;
  return parsed;
}
