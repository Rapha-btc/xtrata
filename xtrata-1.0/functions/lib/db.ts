export type Env = {
  DB: D1Database;
  ASSETS: R2Bucket;
};

export async function queryAll(env: Env, query: string, binds: Array<unknown> = []) {
  const statement = env.DB.prepare(query);
  if (binds.length > 0) {
    return statement.bind(...binds).all();
  }
  return statement.all();
}

export async function run(env: Env, query: string, binds: Array<unknown> = []) {
  const statement = env.DB.prepare(query);
  if (binds.length > 0) {
    return statement.bind(...binds).run();
  }
  return statement.run();
}
