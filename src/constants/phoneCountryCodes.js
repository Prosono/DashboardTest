const BASE_PHONE_COUNTRY_CODES = [
  { value: '+47', label: '+47 Norway' },
  { value: '+46', label: '+46 Sweden' },
  { value: '+45', label: '+45 Denmark' },
  { value: '+358', label: '+358 Finland' },
  { value: '+354', label: '+354 Iceland' },
  { value: '+44', label: '+44 United Kingdom' },
  { value: '+353', label: '+353 Ireland' },
  { value: '+49', label: '+49 Germany' },
  { value: '+31', label: '+31 Netherlands' },
  { value: '+33', label: '+33 France' },
  { value: '+34', label: '+34 Spain' },
  { value: '+39', label: '+39 Italy' },
  { value: '+41', label: '+41 Switzerland' },
  { value: '+43', label: '+43 Austria' },
  { value: '+32', label: '+32 Belgium' },
  { value: '+48', label: '+48 Poland' },
  { value: '+1', label: '+1 US / Canada' },
  { value: '+61', label: '+61 Australia' },
  { value: '+64', label: '+64 New Zealand' },
  { value: '+65', label: '+65 Singapore' },
];

export const normalizePhoneCountryCode = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  return `+${digits}`;
};

export const getPhoneCountryCodeOptions = (selectedValue = '') => {
  const normalizedSelected = normalizePhoneCountryCode(selectedValue);
  if (!normalizedSelected) return BASE_PHONE_COUNTRY_CODES;
  const alreadyExists = BASE_PHONE_COUNTRY_CODES.some((option) => option.value === normalizedSelected);
  if (alreadyExists) return BASE_PHONE_COUNTRY_CODES;
  return [{ value: normalizedSelected, label: normalizedSelected }, ...BASE_PHONE_COUNTRY_CODES];
};

