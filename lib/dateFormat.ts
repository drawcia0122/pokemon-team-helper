const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const japaneseDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "short",
  day: "numeric"
});

function isValidDateOnly(value: string): boolean {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
  );
}

export function formatJapaneseDate(value: string): string {
  if (!isValidDateOnly(value)) {
    throw new RangeError(`実在するYYYY-MM-DD形式の日付ではありません: ${value}`);
  }

  return japaneseDateFormatter.format(
    new Date(`${value}T00:00:00+09:00`)
  );
}
