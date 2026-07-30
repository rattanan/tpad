import { createDecipheriv } from "node:crypto";
import mysql from "mysql2/promise";
import oracledb from "oracledb";

function decrypt(source: Record<string, unknown>) {
  const version = String(source.password_key_version);
  const envName = `DATA_SOURCE_ENCRYPTION_KEY_${version.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`;
  const raw = process.env[envName] || process.env.DATA_SOURCE_ENCRYPTION_KEY;
  if (!raw) throw new Error("DATA_SOURCE_ENCRYPTION_KEY is required");
  const key = Buffer.from(raw, raw.length === 64 ? "hex" : "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(String(source.password_iv), "base64"));
  decipher.setAuthTag(Buffer.from(String(source.password_auth_tag), "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(String(source.encrypted_password), "base64")),
    decipher.final(),
  ]).toString("utf8");
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL });
  const [rows] = await pool.query(`SELECT ds.*
    FROM data_sources ds
    INNER JOIN business_context_models model ON model.data_source_id = ds.id
    WHERE model.name = 'Maintenance Context' AND model.status = 'PUBLISHED' AND model.deleted_at IS NULL
    ORDER BY model.version DESC
    LIMIT 1`);
  await pool.end();
  const source = (rows as Array<Record<string, unknown>>)[0];
  if (!source) throw new Error("Configured Oracle data source was not found");

  const connection = await oracledb.getConnection({
    user: String(source.username),
    password: decrypt(source),
    connectString: `${source.host}:${source.port}/${source.service_name}`,
  });
  connection.callTimeout = 120_000;

  const queries: Record<string, string> = {
    clock: "SELECT SYSDATE AS oracle_now, CURRENT_DATE AS session_now FROM DUAL",
    state: `SELECT state, objstate, COUNT(*) AS work_orders
      FROM IFSAPP.ACTIVE_WORK_ORDER
      GROUP BY state, objstate
      ORDER BY work_orders DESC
      FETCH FIRST 20 ROWS ONLY`,
    workType: `SELECT NVL(work_type_id, '(null)') AS value, COUNT(*) AS work_orders
      FROM IFSAPP.ACTIVE_WORK_ORDER
      GROUP BY work_type_id
      ORDER BY work_orders DESC
      FETCH FIRST 20 ROWS ONLY`,
    organization: `SELECT org_code AS value, COUNT(*) AS work_orders
      FROM IFSAPP.ACTIVE_WORK_ORDER
      GROUP BY org_code
      ORDER BY work_orders DESC
      FETCH FIRST 20 ROWS ONLY`,
    equipment: `SELECT NVL(mch_code_description, '(null)') AS value, COUNT(DISTINCT wo_no) AS work_orders
      FROM IFSAPP.ACTIVE_WORK_ORDER
      GROUP BY mch_code_description
      ORDER BY work_orders DESC
      FETCH FIRST 12 ROWS ONLY`,
    connectionType: `SELECT connection_type AS value, COUNT(*) AS work_orders
      FROM IFSAPP.ACTIVE_WORK_ORDER
      GROUP BY connection_type
      ORDER BY work_orders DESC
      FETCH FIRST 10 ROWS ONLY`,
    flags: `SELECT repair_flag, fault_rep_flag, exclude_from_scheduling, COUNT(*) AS work_orders
      FROM IFSAPP.ACTIVE_WORK_ORDER
      GROUP BY repair_flag, fault_rep_flag, exclude_from_scheduling
      ORDER BY work_orders DESC
      FETCH FIRST 20 ROWS ONLY`,
    priority: `SELECT NVL(priority_id, '(null)') AS value, COUNT(*) AS work_orders
      FROM IFSAPP.ACTIVE_WORK_ORDER
      GROUP BY priority_id
      ORDER BY work_orders DESC
      FETCH FIRST 10 ROWS ONLY`,
    registrationYear: `SELECT TO_CHAR(reg_date, 'YYYY') AS year_value, COUNT(*) AS work_orders
      FROM IFSAPP.ACTIVE_WORK_ORDER
      GROUP BY TO_CHAR(reg_date, 'YYYY')
      ORDER BY year_value
      FETCH FIRST 50 ROWS ONLY`,
    dateQuality: `SELECT COUNT(*) AS total,
        SUM(CASE WHEN reg_date <= SYSDATE THEN 1 ELSE 0 END) AS reg_not_future,
        SUM(CASE WHEN reg_date > SYSDATE THEN 1 ELSE 0 END) AS reg_future,
        SUM(CASE WHEN reg_date BETWEEN DATE '2000-01-01' AND SYSDATE THEN 1 ELSE 0 END) AS reg_trusted,
        SUM(CASE WHEN plan_f_date BETWEEN DATE '2000-01-01' AND SYSDATE + 3650 THEN 1 ELSE 0 END) AS plan_finish_plausible,
        SUM(CASE WHEN real_f_date BETWEEN DATE '2000-01-01' AND SYSDATE THEN 1 ELSE 0 END) AS real_finish_trusted
      FROM IFSAPP.ACTIVE_WORK_ORDER`,
    aging: `SELECT CASE
          WHEN TRUNC(SYSDATE) - TRUNC(reg_date) BETWEEN 0 AND 7 THEN '0-7 days'
          WHEN TRUNC(SYSDATE) - TRUNC(reg_date) BETWEEN 8 AND 15 THEN '8-15 days'
          WHEN TRUNC(SYSDATE) - TRUNC(reg_date) BETWEEN 16 AND 30 THEN '16-30 days'
          WHEN TRUNC(SYSDATE) - TRUNC(reg_date) BETWEEN 31 AND 60 THEN '31-60 days'
          WHEN TRUNC(SYSDATE) - TRUNC(reg_date) BETWEEN 61 AND 90 THEN '61-90 days'
          WHEN TRUNC(SYSDATE) - TRUNC(reg_date) > 90 THEN 'Over 90 days'
          ELSE 'Invalid/Future'
        END AS age_bucket,
        COUNT(*) AS work_orders
      FROM IFSAPP.ACTIVE_WORK_ORDER
      GROUP BY CASE
          WHEN TRUNC(SYSDATE) - TRUNC(reg_date) BETWEEN 0 AND 7 THEN '0-7 days'
          WHEN TRUNC(SYSDATE) - TRUNC(reg_date) BETWEEN 8 AND 15 THEN '8-15 days'
          WHEN TRUNC(SYSDATE) - TRUNC(reg_date) BETWEEN 16 AND 30 THEN '16-30 days'
          WHEN TRUNC(SYSDATE) - TRUNC(reg_date) BETWEEN 31 AND 60 THEN '31-60 days'
          WHEN TRUNC(SYSDATE) - TRUNC(reg_date) BETWEEN 61 AND 90 THEN '61-90 days'
          WHEN TRUNC(SYSDATE) - TRUNC(reg_date) > 90 THEN 'Over 90 days'
          ELSE 'Invalid/Future'
        END
      ORDER BY work_orders DESC
      FETCH FIRST 10 ROWS ONLY`,
  };

  try {
    for (const [name, sql] of Object.entries(queries)) {
      const result = await connection.execute(sql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      console.log(`\n${name.toUpperCase()}\n${JSON.stringify(result.rows, null, 2)}`);
    }
  } finally {
    await connection.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
