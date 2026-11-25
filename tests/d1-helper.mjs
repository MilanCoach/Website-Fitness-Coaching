import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

export function memoryD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../migrations/0001_weekly_analytics.sql", import.meta.url), "utf8"));
  function prepare(sql, values = []) {
    function all() {
      const results = sqlite.prepare(sql).all(...values).map((row) => ({ ...row }));
      return { success: true, results };
    }
    return {
      bind(...next) { return prepare(sql, next); },
      async first() { const row = sqlite.prepare(sql).get(...values); return row ? { ...row } : null; },
      async run() { const result = sqlite.prepare(sql).run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
      async all() { return all(); },
      _all: all
    };
  }
  return {
    prepare, sqlite,
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((statement) => statement._all());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    }
  };
}
