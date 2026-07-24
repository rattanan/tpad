import { compare, hash } from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../lib/db";
import { users, type Role } from "../lib/db/schema";

const definitions: Array<{ role: Role; name: string; username: string; emailKey: string; passwordKey: string; defaultEmail: string }> = [
  { role: "ADMIN", name: "System Administrator", username: "admin", emailKey: "SEED_ADMIN_EMAIL", passwordKey: "SEED_ADMIN_PASSWORD", defaultEmail: "admin@example.com" },
  { role: "DATA_SOURCE_CREATOR", name: "Data Source Creator", username: "datasource", emailKey: "SEED_DATA_SOURCE_EMAIL", passwordKey: "SEED_DATA_SOURCE_PASSWORD", defaultEmail: "datasource@example.com" },
  { role: "DASHBOARD_CREATOR", name: "Dashboard Creator", username: "dashboard", emailKey: "SEED_DASHBOARD_EMAIL", passwordKey: "SEED_DASHBOARD_PASSWORD", defaultEmail: "dashboard@example.com" },
  { role: "VIEWER", name: "Dashboard Viewer", username: "viewer", emailKey: "SEED_VIEWER_EMAIL", passwordKey: "SEED_VIEWER_PASSWORD", defaultEmail: "viewer@example.com" },
];

function temporaryPassword() {
  return `A!${randomBytes(12).toString("base64url")}9z`;
}

async function main() {
  const created: Array<{ role: Role; email: string; password: string }> = [];
  for (const definition of definitions) {
    const email = (process.env[definition.emailKey] || definition.defaultEmail).trim().toLowerCase();
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length) continue;
    const supplied = process.env[definition.passwordKey];
    if (process.env.NODE_ENV === "production" && !supplied) throw new Error(`${definition.passwordKey} is required in production`);
    const password = supplied || temporaryPassword();
    const passwordHash = await hash(password, 12);
    if (await compare(password, passwordHash) !== true) throw new Error("Password hashing verification failed");
    const now = new Date();
    await db.insert(users).values({ id: randomUUID(), fullName: definition.name, username: definition.username, email, passwordHash, role: definition.role, status: "ACTIVE", mustChangePassword: true, createdAt: now, updatedAt: now });
    created.push({ role: definition.role, email, password });
  }
  if (!created.length) console.log("Seed skipped: all four role users already exist.");
  else {
    console.log("Created seed users. Temporary passwords are shown once; store them securely:");
    for (const item of created) console.log(`${item.role}: ${item.email} / ${item.password}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Seed failed");
  process.exitCode = 1;
}).finally(async () => pool.end());
