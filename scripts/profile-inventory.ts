import { db, pool } from "../lib/db";
import { dataSources, dataSourceTables, dataSourceColumns, businessContextModels, businessObjects, businessFields } from "../lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getDataSource } from "../lib/data-sources/service";
import { withOracleConnection } from "../lib/data-sources/oracle";

async function main() {
  console.log("--- Inventory Data Profiling ---");

  // 1. Find the Oracle Data Source
  const [sourceData] = await db.select().from(dataSources).where(eq(dataSources.databaseType, "ORACLE")).limit(1);
  if (!sourceData) {
    console.error("No Oracle data source found.");
    return;
  }
  const source = await getDataSource(sourceData.id);
  if (!source) {
    console.error("Failed to load data source.");
    return;
  }
  console.log(`Using Data Source: ${sourceData.name} (${sourceData.host})`);

  // 2. Look for existing Inventory Business Context
  const [existingContext] = await db.select()
    .from(businessContextModels)
    .where(and(
      eq(businessContextModels.name, "Inventory"),
      isNull(businessContextModels.deletedAt)
    ))
    .limit(1);
  
  if (existingContext) {
    console.log(`Found existing Business Context: ${existingContext.name} (ID: ${existingContext.id})`);
  }

  // 3. Search for candidate tables in metadata
  console.log("\nSearching for candidate inventory tables in metadata...");
  const candidates = await db.select({
    tableName: dataSourceTables.tableName,
    schemaName: dataSourceTables.schemaName,
    description: dataSourceTables.description
  })
  .from(dataSourceTables)
  .where(and(
    eq(dataSourceTables.dataSourceId, sourceData.id),
    eq(dataSourceTables.status, "ACTIVE")
  ));

  const inventoryKeywords = ["INVENTORY", "PART", "STOCK", "WAREHOUSE", "LOCATION", "AVAIL", "RESERV"];
  const matches = candidates.filter(t => 
    inventoryKeywords.some(k => t.tableName.toUpperCase().includes(k))
  );

  console.log(`Found ${matches.length} candidate tables.`);
  for (const m of matches.slice(0, 20)) {
    console.log(`- ${m.schemaName}.${m.tableName}: ${m.description || "No description"}`);
  }

  // 4. Profile key tables if found
  // We'll look for common IFS inventory views: INVENTORY_PART_IN_STOCK, INVENTORY_PART, WAREHOUSE
  const priorityTables = ["INVENTORY_PART_IN_STOCK", "INVENTORY_PART", "WAREHOUSE", "PURCHASE_ORDER_LINE", "INVENTORY_TRANSACTION_HIST"];
  
  await withOracleConnection(source, async (connection, outFormat) => {
    for (const table of priorityTables) {
      let exists = matches.find(m => m.tableName.toUpperCase() === table);
      if (!exists) {
         // Try checking all active tables if not matched in keyword search
         const anyMatch = candidates.find(m => m.tableName.toUpperCase() === table);
         if (!anyMatch) continue;
         exists = anyMatch;
      }

      console.log(`\nProfiling ${exists.schemaName}.${exists.tableName}...`);
      try {
        const countRes = await connection.execute(`SELECT COUNT(*) as CNT FROM "${exists.schemaName}"."${exists.tableName}"`, {}, { outFormat });
        console.log(`Row count: ${(countRes.rows?.[0] as any)?.CNT}`);

        const sampleRes = await connection.execute(`SELECT * FROM "${exists.schemaName}"."${exists.tableName}" FETCH FIRST 1 ROWS ONLY`, {}, { outFormat });
        console.log("Columns found:", Object.keys(sampleRes.rows?.[0] || {}));
      } catch (e: any) {
        console.log(`Could not profile ${table}: ${e.message}`);
      }
    }
  });
}

main().catch(console.error).finally(() => pool.end());
