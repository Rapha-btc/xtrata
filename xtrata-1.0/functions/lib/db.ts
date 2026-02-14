export type Env = {
  DB: D1Database;
  ASSETS: R2Bucket;
};

const resolveDb = (env: Partial<Env> & Record<string, unknown>) => {
  const candidate =
    (env.DB as D1Database | undefined) ??
    (env.D1 as D1Database | undefined) ??
    (env.db as D1Database | undefined);
  if (!candidate || typeof candidate.prepare !== 'function') {
    const availableBindings = Object.keys(env)
      .filter((key) => key.trim().length > 0)
      .sort()
      .join(', ');
    throw new Error(
      `Missing D1 binding. Configure D1 as binding \`DB\` for this Pages environment. Available bindings: ${
        availableBindings || 'none'
      }`
    );
  }
  return candidate;
};

export async function queryAll(env: Env, query: string, binds: Array<unknown> = []) {
  const statement = resolveDb(env as Partial<Env> & Record<string, unknown>).prepare(
    query
  );
  if (binds.length > 0) {
    return statement.bind(...binds).all();
  }
  return statement.all();
}

export async function run(env: Env, query: string, binds: Array<unknown> = []) {
  const statement = resolveDb(env as Partial<Env> & Record<string, unknown>).prepare(
    query
  );
  if (binds.length > 0) {
    return statement.bind(...binds).run();
  }
  return statement.run();
}
