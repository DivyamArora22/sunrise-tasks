import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
Deno.serve(async (request) => {
  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (!secret || request.headers.get("x-webhook-secret") !== secret) return new Response("Unauthorized", { status: 401 });
  const { record } = await request.json();
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: tokens } = await supabase.from("push_tokens").select("token").eq("user_id", record.user_id);
  if (!tokens?.length) return Response.json({ delivered: 0 });
  const messages = tokens.map(({ token }) => ({ to: token, sound: "default", title: record.title, body: record.message, data: { taskId: record.task_id }, channelId: "tasks" }));
  const response = await fetch("https://exp.host/--/api/v2/push/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(messages) });
  return new Response(await response.text(), { status: response.status, headers: { "Content-Type": "application/json" } });
});
