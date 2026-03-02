export const CONFIG_BACKUP_COUNT = 5;
const CONFIG_BACKUP_MODE = 0o600;

export async function rotateConfigBackups(
  configPath: string,
  ioFs: {
    unlink: (path: string) => Promise<void>;
    rename: (from: string, to: string) => Promise<void>;
  },
): Promise<void> {
  if (CONFIG_BACKUP_COUNT <= 1) {
    return;
  }
  const backupBase = `${configPath}.bak`;
  const maxIndex = CONFIG_BACKUP_COUNT - 1;
  await ioFs.unlink(`${backupBase}.${maxIndex}`).catch(() => {
    // best-effort
  });
  for (let index = maxIndex - 1; index >= 1; index -= 1) {
    await ioFs.rename(`${backupBase}.${index}`, `${backupBase}.${index + 1}`).catch(() => {
      // best-effort
    });
  }
  await ioFs.rename(backupBase, `${backupBase}.1`).catch(() => {
    // best-effort
  });
}

export async function hardenBackupPermissions(
  configPath: string,
  ioFs: {
    chmod: (path: string, mode: number) => Promise<void>;
  },
): Promise<void> {
  const backupBase = `${configPath}.bak`;

  await ioFs.chmod(backupBase, CONFIG_BACKUP_MODE).catch(() => {
    // best-effort
  });

  for (let index = 1; index < CONFIG_BACKUP_COUNT; index += 1) {
    await ioFs.chmod(`${backupBase}.${index}`, CONFIG_BACKUP_MODE).catch(() => {
      // best-effort
    });
  }
}
