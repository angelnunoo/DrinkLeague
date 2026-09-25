const fs = require("fs");
const files = [
  ["rpc_leagues", "supabase/migrations/20260325000004_rpc_leagues.sql"],
  ["rpc_log_drinks", "supabase/migrations/20260325000005_rpc_log_drinks.sql"],
  ["rls_policies", "supabase/migrations/20260325000006_rls.sql"],
];
for (const [name, path] of files) {
  const query = fs.readFileSync(path, "utf8");
  fs.writeFileSync(`supabase/.tmp_${name}.json`, JSON.stringify({ name, query }));
  console.log(name, query.length);
}
