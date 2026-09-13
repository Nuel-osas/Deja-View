import fs from "node:fs/promises";
import path from "node:path";
import { zipSync } from "fflate";

export async function zipDirectory(directory, destination) {
  const entries = Object.create(null);
  async function walk(current, prefix = "") {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const name = prefix + entry.name;
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(filename, name + "/");
      else if (entry.isFile()) entries[name] = await fs.readFile(filename);
    }
  }
  await walk(directory);
  await fs.writeFile(destination, zipSync(entries, { level: 0 }));
}
