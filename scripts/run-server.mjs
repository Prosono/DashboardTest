try {
  await import('../server/index.js');
} catch (error) {
  const message = String(error?.message || '');
  const missingDeps =
    error?.code === 'ERR_MODULE_NOT_FOUND'
    || message.includes("Cannot find package 'express'")
    || message.includes("Cannot find package 'better-sqlite3'");

  if (missingDeps) {
    console.error('\n[server] Missing dependencies.');
    console.error('[server] Run: npm install');
    console.error('[server] If better-sqlite3 fails to compile on macOS, install Xcode CLT: xcode-select --install');
  } else {
    console.error(error);
  }

  process.exit(1);
}
