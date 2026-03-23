import { Wifi, Settings, Check } from 'lucide-react';
import { normalizeHaUrlInput } from '../utils/haConnections';

export const buildOnboardingSteps = (t) => [
  { key: 'connection', label: t('onboarding.step.connection'), icon: Wifi },
  { key: 'preferences', label: t('onboarding.step.preferences'), icon: Settings },
  { key: 'finish', label: t('onboarding.step.finish'), icon: Check }
];

export const validateUrl = (url) => {
  const normalized = normalizeHaUrlInput(url);
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};
