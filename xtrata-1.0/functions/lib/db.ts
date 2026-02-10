export type Env = {
  DB: D1Database;
  ASSETS: R2Bucket;
};

export async function queryAll(env: Env, query: string, binds: Array<unknown> = []) {
  const statement = await env.DB.prepare(query);
  binds.forEach((value, index) => statement.bind(index + 1, value));
  return statement.all();
}

export async function run(env: Env, query: string, binds: Array<unknown> = []) {
  const statement = await env.DB.prepare(query);
  binds.forEach((value, index) => statement.bind(index + 1, value));
  return statement.run();
}
