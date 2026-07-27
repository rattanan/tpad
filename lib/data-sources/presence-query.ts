const identifier = /^[A-Za-z][A-Za-z0-9_$#]*$/;
const quote = (value: string) => { if (!identifier.test(value)) throw new Error("Invalid Oracle identifier"); return `"${value}"`; };

export function buildNonNullPresenceQuery(schemaName: string, tableName: string, columnNames: string[]) {
  if (!columnNames.length || columnNames.length > 100) throw new Error("Select between 1 and 100 columns");
  const table = `${quote(schemaName)}.${quote(tableName)}`;
  const aliases = columnNames.map((_, index) => `P${index}`);
  const checks = columnNames.map((column, index) => `(SELECT 1 FROM ${table} WHERE ${quote(column)} IS NOT NULL AND ROWNUM <= 1) AS "${aliases[index]}"`);
  return { sql: `SELECT ${checks.join(",")} FROM DUAL`, aliases };
}
