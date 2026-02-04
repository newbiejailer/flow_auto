let currentStep = 0;

export function resetStepCounter(): void {
  currentStep = 0;
}

export function log(message: string): void {
  const timestamp = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  console.log(`[${timestamp}] ${message}`);
}

export function logStep(message: string): void {
  currentStep++;
  log(`[步骤 ${currentStep}] ${message}`);
}
