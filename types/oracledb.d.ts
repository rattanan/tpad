declare module "oracledb" {
  export type ExecuteResult = { rows?: Array<Record<string, unknown>>; metaData?: Array<{ name: string }> };
  export type Connection = { callTimeout: number; oracleServerVersionString?: string; execute: (sql: string, binds?: Record<string, unknown> | unknown[], options?: Record<string, unknown>) => Promise<ExecuteResult>; close: () => Promise<void> };
  export type Pool = { getConnection: () => Promise<Connection>; close: (drainTime?: number) => Promise<void>; connectionsOpen?: number; connectionsInUse?: number };
  const oracle: { createPool: (options: Record<string, unknown>) => Promise<Pool>; getConnection: (options: Record<string, unknown>) => Promise<Connection>; OUT_FORMAT_OBJECT: number };
  export default oracle;
}
