import { getDb } from './client.js';

/**
 * A small chainable query facade over better-sqlite3 that mirrors the subset
 * of the supabase-js / PostgREST API this codebase actually uses:
 *
 *   .select('a, b') / .select('*', { count: 'exact', head: true })
 *   .eq / .neq / .gt / .gte / .lt / .lte / .in / .ilike / .not(col, 'is', null)
 *   .order(col, { ascending }) / .limit(n) / .range(from, to)  (inclusive)
 *   .maybeSingle() / .single()
 *   .insert(values) / .update(values) / .upsert(values, { onConflict }) / .delete()
 *   .select() chained after a write = return the affected rows
 *
 * Results keep the `{ data, error, count }` shape the calling code already
 * destructures, so files read almost exactly as they did against Supabase.
 *
 * JSON and boolean columns are transparently encoded/decoded via the
 * registries below, matching how Postgres `jsonb` / `boolean` behaved.
 */

// --- Column type registries (keep in sync with ddl.ts) ---

const JSON_COLUMNS: Record<string, readonly string[]> = {
  weekly_insights: [
    'metrics_snapshot', 'findings', 'action_items', 'open_threads', 'resolved_threads',
    'corrections', 'revisions', 'chat', 'strategy', 'strategy_decisions',
    'strategy_chat', 'strategy_recommendation_chats',
  ],
  strategy_ledger: ['state'],
  evidence_deltas: ['delta', 'raw_snapshot'],
  ledger_entries: ['patch'],
  context_sources: ['digest'],
  source_snapshots: ['snapshot'],
  growth_opportunities: ['evidence'],
  growth_plans: ['plan'],
  growth_actions: ['brief'],
};

const BOOLEAN_COLUMNS: Record<string, readonly string[]> = {
  sites: ['enabled'],
  standing_caveats: ['active'],
};

/** Primary keys per table, used when upsert() omits `onConflict`. */
const PRIMARY_KEYS: Record<string, readonly string[]> = {
  weekly_insights: ['id'],
  standing_caveats: ['id'],
  strategy_ledger: ['id'],
  evidence_deltas: ['id'],
  ledger_entries: ['id'],
  context_sources: ['id'],
  source_sync_state: ['source', 'scope'],
  source_snapshots: ['source', 'scope', 'period_start', 'period_end'],
  sites: ['id'],
  gsc_rows: ['site_id', 'query', 'page', 'date', 'country', 'device'],
  bing_rows: ['site_id', 'query', 'date', 'country'],
  growth_opportunities: ['id'],
  growth_plans: ['site_id', 'week_start'],
  growth_actions: ['id'],
};

type Filter =
  | { kind: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'; col: string; val: unknown }
  | { kind: 'in'; col: string; vals: readonly unknown[] }
  | { kind: 'ilike'; col: string; pattern: string }
  | { kind: 'isnull' | 'isnotnull'; col: string };

const FILTER_SQL: Record<Filter['kind'], string> = {
  eq: '=',
  neq: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  in: 'IN',
  ilike: 'LIKE', // SQLite LIKE is already case-insensitive for ASCII
  isnull: 'IS NULL',
  isnotnull: 'IS NOT NULL',
};

export interface DbError {
  message: string;
  code?: string;
}

export interface DbResult<T = unknown> {
  data: T;
  error: DbError | null;
  count: number | null;
}

const IDENT = /^[a-z_][a-z0-9_]*$/;

function quoteIdent(col: string): string {
  if (!IDENT.test(col)) throw new Error(`Unsafe column name: ${col}`);
  return `"${col}"`;
}

function jsonCols(table: string): Set<string> {
  return new Set(JSON_COLUMNS[table] ?? []);
}

function boolCols(table: string): Set<string> {
  return new Set(BOOLEAN_COLUMNS[table] ?? []);
}

/** Apply per-table encodings (JSON stringify, boolean → 0/1) to a write value. */
function encodeValue(table: string, col: string, val: unknown): unknown {
  if (val === undefined) return undefined;
  if (val === null) return null;
  if (boolCols(table).has(col)) return val ? 1 : 0;
  if (jsonCols(table).has(col) && typeof val === 'object') return JSON.stringify(val);
  return val;
}

/** Decode a row read from SQLite back into the shapes the app expects. */
function decodeRow<T>(table: string, row: Record<string, unknown>): T {
  const json = jsonCols(table);
  const bools = boolCols(table);
  const out: Record<string, unknown> = {};
  for (const [col, val] of Object.entries(row)) {
    if (val !== null && json.has(col) && typeof val === 'string') {
      out[col] = JSON.parse(val);
    } else if (bools.has(col)) {
      out[col] = val === 1;
    } else {
      out[col] = val;
    }
  }
  return out as T;
}

interface SelectOpts {
  count?: 'exact' | 'planned' | 'estimated';
  head?: boolean;
}

class QueryChain implements PromiseLike<DbResult> {
  private readonly table: string;
  private op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' | null = null;
  private writeValues: Record<string, unknown>[] | null = null;
  private conflictCols: readonly string[] | null = null;
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private limitCount: number | null = null;
  private offsetCount = 0;
  private maybeSingleMode = false;
  private singleMode = false;
  private countMode = false;
  private headOnly = false;
  private wantReturning = false;
  private selectCols: readonly string[] | null = null;

  constructor(table: string) {
    this.table = table;
  }

  // --- read ---

  select(columns?: string | null, opts?: SelectOpts): this {
    if (this.op === null) {
      this.op = 'select';
      if (typeof columns === 'string' && columns.trim() !== '*' && columns.trim() !== '') {
        this.selectCols = columns.split(',').map((c) => c.trim()).filter(Boolean);
      }
    } else {
      // .select() chained after a write: return the affected rows.
      this.wantReturning = true;
    }
    if (opts?.count === 'exact') this.countMode = true;
    if (opts?.head) this.headOnly = true;
    return this;
  }

  // --- filters ---

  eq(col: string, val: unknown): this { this.filters.push({ kind: 'eq', col, val }); return this; }
  neq(col: string, val: unknown): this { this.filters.push({ kind: 'neq', col, val }); return this; }
  gt(col: string, val: unknown): this { this.filters.push({ kind: 'gt', col, val }); return this; }
  gte(col: string, val: unknown): this { this.filters.push({ kind: 'gte', col, val }); return this; }
  lt(col: string, val: unknown): this { this.filters.push({ kind: 'lt', col, val }); return this; }
  lte(col: string, val: unknown): this { this.filters.push({ kind: 'lte', col, val }); return this; }
  in(col: string, vals: readonly unknown[]): this { this.filters.push({ kind: 'in', col, vals }); return this; }
  ilike(col: string, pattern: string): this { this.filters.push({ kind: 'ilike', col, pattern }); return this; }

  is(col: string, val: null): this {
    this.filters.push({ kind: val === null ? 'isnull' : 'isnotnull', col });
    return this;
  }

  not(col: string, op: string, val: unknown): this {
    if (op !== 'is' || val !== null) {
      throw new Error(`Only .not(col, 'is', null) is supported, got .not(${col}, ${op}, ${val})`);
    }
    this.filters.push({ kind: 'isnotnull', col });
    return this;
  }

  // --- shaping ---

  order(col: string, opts?: { ascending?: boolean }): this {
    this.orders.push({ col, asc: opts?.ascending !== false });
    return this;
  }

  limit(n: number): this { this.limitCount = n; return this; }

  /** PostgREST-style inclusive range: rows [from, to]. */
  range(from: number, to: number): this {
    this.offsetCount = from;
    this.limitCount = to - from + 1;
    return this;
  }

  maybeSingle(): this { this.maybeSingleMode = true; return this; }
  single(): this { this.singleMode = true; return this; }

  // --- writes ---

  insert(values: Record<string, unknown> | Record<string, unknown>[]): this {
    this.op = 'insert';
    this.writeValues = Array.isArray(values) ? values : [values];
    return this;
  }

  upsert(
    values: Record<string, unknown> | Record<string, unknown>[],
    opts?: { onConflict?: string; ignoreDuplicates?: boolean },
  ): this {
    this.op = 'upsert';
    this.writeValues = Array.isArray(values) ? values : [values];
    this.conflictCols = opts?.onConflict
      ? opts.onConflict.split(',').map((c) => c.trim())
      : (PRIMARY_KEYS[this.table] ?? ['id']);
    if (opts?.ignoreDuplicates) this.conflictCols = [...this.conflictCols, '__never_used__'];
    return this;
  }

  update(values: Record<string, unknown>): this {
    this.op = 'update';
    this.writeValues = [values];
    return this;
  }

  delete(): this {
    this.op = 'delete';
    return this;
  }

  // --- execution ---

  then<T1 = DbResult, T2 = never>(
    onfulfilled?: ((value: DbResult) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.exec()).then(onfulfilled, onrejected);
  }

  exec(): DbResult {
    try {
      const db = getDb();
      switch (this.op) {
        case 'select':
        case null:
          return this.execSelect(db);
        case 'insert':
        case 'upsert':
          return this.execInsert(db);
        case 'update':
          return this.execUpdate(db);
        case 'delete':
          return this.execDelete(db);
        default:
          throw new Error(`Unsupported operation: ${this.op}`);
      }
    } catch (e) {
      const err = e as { message?: string; code?: string };
      return { data: null, error: { message: err.message ?? String(e), code: err.code } };
    }
  }

  private where(): { sql: string; params: unknown[] } {
    if (!this.filters.length) return { sql: '', params: [] };
    const parts: string[] = [];
    const params: unknown[] = [];
    for (const f of this.filters) {
      const col = quoteIdent(f.col);
      if (f.kind === 'isnull' || f.kind === 'isnotnull') {
        parts.push(`${col} ${FILTER_SQL[f.kind]}`);
      } else if (f.kind === 'in') {
        if (!f.vals.length) {
          parts.push('1 = 0');
        } else {
          parts.push(`${col} IN (${f.vals.map(() => '?').join(', ')})`);
          for (const v of f.vals) params.push(encodeValue(this.table, f.col, v));
        }
      } else if (f.kind === 'ilike') {
        parts.push(`${col} LIKE ?`);
        params.push(f.pattern);
      } else {
        parts.push(`${col} ${FILTER_SQL[f.kind]} ?`);
        params.push(encodeValue(this.table, f.col, f.val));
      }
    }
    return { sql: ` WHERE ${parts.join(' AND ')}`, params };
  }

  private execSelect(db: ReturnType<typeof getDb>): DbResult {
    const { sql: whereSql, params } = this.where();
    let count: number | null = null;

    if (this.countMode) {
      count = (
        db.prepare(`SELECT count(*) AS c FROM ${quoteIdent(this.table)}${whereSql}`).get(...params) as {
          c: number;
        }
      ).c;
    }

    if (this.headOnly) return { data: null, error: null, count };

    const cols = this.selectCols ? this.selectCols.map(quoteIdent).join(', ') : '*';
    let sql = `SELECT ${cols} FROM ${quoteIdent(this.table)}${whereSql}`;
    if (this.orders.length) {
      sql += ` ORDER BY ${this.orders.map((o) => `${quoteIdent(o.col)} ${o.asc ? 'ASC' : 'DESC'}`).join(', ')}`;
    }
    if (this.limitCount !== null) sql += ` LIMIT ${this.limitCount}`;
    if (this.offsetCount > 0) sql += ` OFFSET ${this.offsetCount}`;

    let rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
    let data: unknown;
    if (this.maybeSingleMode || this.singleMode) {
      const row = rows[0];
      if (row === undefined && this.singleMode) {
        return { data: null, error: { message: 'No rows found' }, count };
      }
      data = row ? decodeRow(this.table, row) : null;
    } else {
      data = rows.map((r) => decodeRow(this.table, r));
    }
    return { data, error: null, count };
  }

  private execInsert(db: ReturnType<typeof getDb>): DbResult {
    const rows = this.writeValues ?? [];
    if (!rows.length) return { data: null, error: null, count: null };

    // Keys omitted from a row fall back to the column DEFAULT, exactly like
    // PostgREST. Rows with differing key shapes each get their own INSERT
    // statement; all statements run inside one transaction.
    const groups = new Map<string, { keys: string[]; rows: Record<string, unknown>[] }>();
    for (const row of rows) {
      const keys = Object.keys(row).filter((k) => row[k] !== undefined);
      const shapeKey = keys.join('\u0000');
      const group = groups.get(shapeKey) ?? { keys, rows: [] };
      group.rows.push(row);
      groups.set(shapeKey, group);
    }

    const conflictCols = (this.conflictCols ?? PRIMARY_KEYS[this.table] ?? ['id']).map(quoteIdent);

    const run = db.transaction(() => {
      const returned: Record<string, unknown>[] = [];
      for (const { keys, rows: groupRows } of groups.values()) {
        const placeholders = keys.map(() => '?').join(', ');
        const encoded = keys.map((k) => quoteIdent(k)).join(', ');
        let sql = `INSERT INTO ${quoteIdent(this.table)} (${encoded}) VALUES (${placeholders})`;
        if (this.op === 'upsert') {
          const sets = keys.filter((k) => !this.conflictCols?.includes(k)).map(quoteIdent);
          // PostgREST merge-duplicates: every supplied column is updated;
          // conflict columns are (by definition) the same value, so setting
          // only non-conflict columns is equivalent.
          const updateCols = sets.length ? sets : conflictCols;
          sql += ` ON CONFLICT (${conflictCols.join(', ')}) DO UPDATE SET ${updateCols
            .map((c) => `${c} = excluded.${c}`)
            .join(', ')}`;
        }
        if (this.wantReturning) sql += ' RETURNING *';
        const stmt = db.prepare(sql);
        for (const row of groupRows) {
          const vals = keys.map((k) => encodeValue(this.table, k, row[k] ?? null));
          if (this.wantReturning) {
            returned.push(stmt.get(...vals) as Record<string, unknown>);
          } else {
            stmt.run(...vals);
          }
        }
      }
      return returned;
    });

    const returned = run();
    const data = this.wantReturning ? returned.map((r) => decodeRow(this.table, r)) : null;
    return { data, error: null, count: null };
  }

  private execUpdate(db: ReturnType<typeof getDb>): DbResult {
    const values = this.writeValues![0];
    const keys = Object.keys(values).filter((k) => values[k] !== undefined);
    if (!keys.length) throw new Error('update() called with no columns');
    const setSql = keys.map((k) => `${quoteIdent(k)} = ?`).join(', ');
    const setParams = keys.map((k) => encodeValue(this.table, k, values[k]));
    const { sql: whereSql, params } = this.where();

    let sql = `UPDATE ${quoteIdent(this.table)} SET ${setSql}${whereSql}`;
    if (this.wantReturning) sql += ' RETURNING *';
    if (this.wantReturning) {
      const rows = db.prepare(sql).all(...setParams, ...params) as Record<string, unknown>[];
      return { data: rows.map((r) => decodeRow(this.table, r)), error: null, count: null };
    }
    db.prepare(sql).run(...setParams, ...params);
    return { data: null, error: null, count: null };
  }

  private execDelete(db: ReturnType<typeof getDb>): DbResult {
    const { sql: whereSql, params } = this.where();
    let sql = `DELETE FROM ${quoteIdent(this.table)}${whereSql}`;
    if (this.wantReturning) sql += ' RETURNING *';
    if (this.wantReturning) {
      const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
      return { data: rows.map((r) => decodeRow(this.table, r)), error: null, count: null };
    }
    db.prepare(sql).run(...params);
    return { data: null, error: null, count: null };
  }
}

export interface DbClient {
  from(table: string): QueryChain;
}

/** Drop-in replacement for the old `createClient(url, key)` call sites. */
export function getClient(): DbClient {
  return {
    from: (table: string) => new QueryChain(table),
  };
}
