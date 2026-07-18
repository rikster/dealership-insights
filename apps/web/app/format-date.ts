const ISO_DATE_TIME = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g;

export function formatLocalDateTime(value: string, locale?: string | string[]): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function localizeDateTimesInText(value: string, locale?: string | string[]): string {
  return value.replace(ISO_DATE_TIME, (timestamp) => formatLocalDateTime(timestamp, locale));
}
