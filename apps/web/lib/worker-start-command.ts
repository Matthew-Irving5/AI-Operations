export function workerStartCommand(appEnv: string | undefined): string {
  const taskName =
    appEnv === 'production' ? 'AI Operations Windows Worker' : 'AI Operations Staging Worker';
  return `powershell -NoProfile -ExecutionPolicy Bypass -File "C:\\ProgramData\\AI-Operations\\start-worker.ps1" -TaskName "${taskName}"`;
}
