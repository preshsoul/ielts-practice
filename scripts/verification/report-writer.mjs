import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export async function writeReport(name, payload) {
  const jsonPath = resolve("tmp", "verification", `${name}.json`);
  await mkdir(dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return jsonPath;
}
