const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const config = require("../config");

let db;

function getDb() {
  if (db) return db;
  const dir = path.dirname(config.databasePath);
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(config.databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

function migrate() {
  const database = getDb();
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  database.exec(schema);
  console.log("[db] migrated", config.databasePath);
  return database;
}

module.exports = { getDb, migrate };
