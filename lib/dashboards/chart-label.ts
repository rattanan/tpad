const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const DASHBOARD_TIME_ZONE = "Asia/Bangkok";
const zonedDateParts = new Intl.DateTimeFormat("en-US", { timeZone: DASHBOARD_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

function isValidDatePart(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function formatChartLabel(value: unknown) {
  const original = String(value ?? "Current");
  const match = ISO_DATE_TIME.exec(original.trim());
  if (!match) return original;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText, zoneText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText ?? 0);
  const minute = Number(minuteText ?? 0);
  const second = Number(secondText ?? 0);
  const fraction = Number(fractionText ?? 0);
  if (!isValidDatePart(year, month, day) || hour > 23 || minute > 59 || second > 59) return original;

  let displayYear=yearText;let displayMonth=monthText;let displayDay=dayText;let displayHour=hourText;let displayMinute=minuteText;let displaySecond=secondText;let displayFraction=fraction;
  if(zoneText){
    const normalized=original.trim().replace(/([+-]\d{2})(\d{2})$/, "$1:$2");const instant=new Date(normalized);
    if(!Number.isFinite(instant.getTime()))return original;
    const parts=Object.fromEntries(zonedDateParts.formatToParts(instant).filter(part=>part.type!=="literal").map(part=>[part.type,part.value]));
    displayYear=parts.year;displayMonth=parts.month;displayDay=parts.day;displayHour=parts.hour;displayMinute=parts.minute;displaySecond=parts.second;displayFraction=instant.getUTCMilliseconds();
  }
  const date = `${displayYear}-${displayMonth}-${displayDay}`;
  const displayHourValue=Number(displayHour??0);const displayMinuteValue=Number(displayMinute??0);const displaySecondValue=Number(displaySecond??0);
  if (!displayHour || (displayHourValue === 0 && displayMinuteValue === 0 && displaySecondValue === 0 && displayFraction === 0)) return date;
  if (displaySecondValue === 0 && displayFraction === 0) return `${date} ${displayHour}:${displayMinute}`;
  return `${date} ${displayHour}:${displayMinute}:${displaySecond ?? "00"}`;
}
