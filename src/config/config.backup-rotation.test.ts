import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hardenBackupPermissions, rotateConfigBackups } from "./backup-rotation.js";
import { withTempHome } from "./test-helpers.js";
import type { OpenClawConfig } from "./types.js";

describe("config backup rotation", () => {
  it("keeps a 5-deep backup ring for config writes", async () => {
    await withTempHome(async () => {
      const stateDir = process.env.OPENCLAW_STATE_DIR?.trim();
      if (!stateDir) {
        throw new Error("Expected OPENCLAW_STATE_DIR to be set by withTempHome");
      }
      const configPath = path.join(stateDir, "openclaw.json");
      const buildConfig = (version: number): OpenClawConfig =>
        ({
          agents: { list: [{ id: `v${version}` }] },
        }) as OpenClawConfig;

      const writeVersion = async (version: number) => {
        const json = JSON.stringify(buildConfig(version), null, 2).trimEnd().concat("\n");
        await fs.writeFile(configPath, json, "utf-8");
      };

      await writeVersion(0);
      for (let version = 1; version <= 6; version += 1) {
        await rotateConfigBackups(configPath, fs);
        await fs.copyFile(configPath, `${configPath}.bak`).catch(() => {
          // best-effort
        });
        await writeVersion(version);
      }

      const readName = async (suffix = "") => {
        const raw = await fs.readFile(`${configPath}${suffix}`, "utf-8");
        return (
          (JSON.parse(raw) as { agents?: { list?: Array<{ id?: string }> } }).agents?.list?.[0]
            ?.id ?? null
        );
      };

      await expect(readName()).resolves.toBe("v6");
      await expect(readName(".bak")).resolves.toBe("v5");
      await expect(readName(".bak.1")).resolves.toBe("v4");
      await expect(readName(".bak.2")).resolves.toBe("v3");
      await expect(readName(".bak.3")).resolves.toBe("v2");
      await expect(readName(".bak.4")).resolves.toBe("v1");
      await expect(fs.stat(`${configPath}.bak.5`)).rejects.toThrow();
    });
  });

  it("hardenBackupPermissions sets 0o600 on all backup files", async () => {
    await withTempHome(async () => {
      const stateDir = process.env.OPENCLAW_STATE_DIR?.trim();
      if (!stateDir) {
        throw new Error("Expected OPENCLAW_STATE_DIR to be set by withTempHome");
      }

      const configPath = path.join(stateDir, "openclaw.json");
      const bakPath = `${configPath}.bak`;
      const bak1Path = `${configPath}.bak.1`;

      await fs.writeFile(bakPath, "{}\n", "utf-8");
      await fs.writeFile(bak1Path, "{}\n", "utf-8");
      await fs.chmod(bakPath, 0o666);
      await fs.chmod(bak1Path, 0o666);

      await hardenBackupPermissions(configPath, fs);

      const bakStat = await fs.stat(bakPath);
      const bak1Stat = await fs.stat(bak1Path);

      expect(bakStat.mode & 0o777).toBe(0o600);
      expect(bak1Stat.mode & 0o777).toBe(0o600);
    });
  });
});
