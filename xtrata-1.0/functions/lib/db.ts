export type Env = {
  DB: D1Database;
  ASSETS: R2Bucket;
};

const requireDb = (env: Partial<Env>) => {
  if (!env.DB || typeof env.DB.prepare !== 'function') {
    throw new Error(
      'Missing DB binding. Configure D1 as binding `DB` for this Pages environment.'
    );
  }
  return env.DB;
};

export async function queryAll(env: Env, query: string, binds: Array<unknown> = []) {
  const statement = requireDb(env).prepare(query);
  if (binds.length > 0) {
    return statement.bind(...binds).all();
  }
  return statement.all();
}

export async function run(env: Env, query: string, binds: Array<unknown> = []) {
  const statement = requireDb(env).prepare(query);
  if (binds.length > 0) {
    return statement.bind(...binds).run();
  }
  return statement.run();
}
