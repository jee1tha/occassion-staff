/**
 * Template for plugging your own local agent into the runner (provider kind "command").
 *
 * Contract:
 *   stdin   one JSON object: { model, system, prompt, schema, schema_name }
 *   stdout  one JSON object: { output, input_tokens?, output_tokens? }
 *           where `output` matches `schema`
 *   exit    0 on success, 75 if your agent is out of quota, anything else on failure
 *
 * This example doesn't call a model: it fills the schema with placeholder values, which is
 * enough to test the wiring. Replace `answer` with a call to your agent or model.
 */

type Schema = { type?: string; properties?: Record<string, Schema>; items?: Schema; enum?: unknown[] };

function placeholder(s: Schema): unknown {
  if (s.enum) return s.enum[0];
  switch (s.type) {
    case "object":
      return Object.fromEntries(Object.entries(s.properties ?? {}).map(([k, v]) => [k, placeholder(v)]));
    case "array":
      return [];
    case "boolean":
      return true;
    case "number":
    case "integer":
      return 0;
    default:
      return "pong";
  }
}

async function answer(req: { model: string; system: string; prompt: string; schema: Schema }) {
  return placeholder(req.schema);
}

let input = "";
for await (const chunk of process.stdin) input += chunk;
const req = JSON.parse(input);
process.stdout.write(JSON.stringify({ output: await answer(req), input_tokens: 0, output_tokens: 0 }));
