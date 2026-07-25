import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Key,
  RefreshCw,
  Shield,
  UserCheck,
} from '../../icons';
import { acceptInvitation, fetchInvitation } from '../../services/appAuth';
import { handleLogoImageError } from '../../utils/branding';

const inputClass = 'w-full rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent-color)_24%,transparent)]';

const formatExpiry = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleString('nb-NO', { dateStyle: 'long', timeStyle: 'short' });
  } catch {
    return date.toISOString();
  }
};

export default function InvitationAcceptance({
  token,
  logoUrl,
  appTitle,
  onReturnToLogin,
}) {
  const [invitation, setInvitation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [account, setAccount] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetchInvitation(token)
      .then((payload) => {
        if (!active) return;
        setInvitation(payload);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError?.message || 'Invitasjonen kunne ikke åpnes.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const passwordChecks = useMemo(() => ([
    { label: 'Minst 10 tegn', ready: password.length >= 10 },
    { label: 'Minst én bokstav', ready: /\p{L}/u.test(password) },
    { label: 'Minst ett tall', ready: /\p{N}/u.test(password) },
  ]), [password]);

  const canSubmit = Boolean(
    username.trim().length >= 3
    && passwordChecks.every((check) => check.ready)
    && password === confirmPassword
    && !submitting,
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      const activated = await acceptInvitation(token, {
        username: username.trim(),
        password,
      });
      setAccount(activated);
      setPassword('');
      setConfirmPassword('');
    } catch (submitError) {
      setError(submitError?.message || 'Kontoen kunne ikke aktiveres.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen px-4 py-8 text-[var(--text-primary)]"
      style={{ background: 'radial-gradient(900px 420px at 18% -10%, color-mix(in srgb, var(--accent-color) 24%, transparent), transparent 64%), linear-gradient(150deg, var(--bg-gradient-from), var(--bg-primary), var(--bg-gradient-to))' }}
    >
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center">
        <section className="grid w-full overflow-hidden rounded-[2rem] border border-[var(--glass-border)] bg-[var(--card-bg)] shadow-2xl lg:grid-cols-[0.82fr_1.18fr]">
          <div className="relative hidden overflow-hidden border-r border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--accent-color)_9%,var(--bg-primary))] p-10 lg:flex lg:flex-col lg:justify-between">
            <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full border border-[color-mix(in_srgb,var(--accent-color)_24%,transparent)]" />
            <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full border border-[color-mix(in_srgb,var(--accent-color)_20%,transparent)]" />
            <div className="relative">
              <img
                src={logoUrl}
                alt=""
                className="h-16 w-16 rounded-2xl object-contain"
                onError={handleLogoImageError}
              />
              <p className="mt-7 text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--text-muted)]">Førstegangsoppsett</p>
              <h1 className="mt-3 max-w-sm text-3xl font-semibold leading-tight">Din tilgang. Ditt eget passord.</h1>
              <p className="mt-4 max-w-sm text-sm leading-7 text-[var(--text-secondary)]">
                Administratoren har kun registrert navn og e-post. Det er du som velger innloggingsopplysningene.
              </p>
            </div>
            <div className="relative space-y-4 text-sm text-[var(--text-secondary)]">
              <div className="flex items-center gap-3"><Shield className="h-4 w-4 text-[var(--accent-color)]" /> Engangslenken kan bare brukes én gang</div>
              <div className="flex items-center gap-3"><Key className="h-4 w-4 text-[var(--accent-color)]" /> Passordet lagres sikkert og vises aldri til admin</div>
            </div>
          </div>

          <div className="p-6 sm:p-9 lg:p-12">
            <div className="mb-8 flex items-center gap-4 lg:hidden">
              <img src={logoUrl} alt="" className="h-12 w-12 rounded-xl object-contain" onError={handleLogoImageError} />
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Invitasjon</p>
                <p className="mt-1 text-sm font-semibold">{appTitle}</p>
              </div>
            </div>

            {loading ? (
              <div className="flex min-h-72 items-center justify-center gap-3 text-sm text-[var(--text-secondary)]">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Kontrollerer invitasjonen…
              </div>
            ) : account ? (
              <div className="flex min-h-72 flex-col justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]">
                  <Check className="h-5 w-5" />
                </div>
                <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--text-muted)]">Konto aktivert</p>
                <h2 className="mt-2 text-3xl font-semibold">Alt er klart.</h2>
                <p className="mt-4 text-sm leading-7 text-[var(--text-secondary)]">
                  Logg inn med kunde-ID <strong className="text-[var(--text-primary)]">{account.clientId}</strong> og brukernavnet <strong className="text-[var(--text-primary)]">{account.username}</strong>.
                </p>
                <button
                  type="button"
                  onClick={() => onReturnToLogin?.(account)}
                  className="mt-8 inline-flex items-center justify-center gap-2 self-start rounded-xl bg-[var(--accent-color)] px-5 py-3 text-sm font-bold text-white transition hover:brightness-110"
                >
                  Gå til innlogging
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            ) : !invitation ? (
              <div className="flex min-h-72 flex-col justify-center">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--status-danger-text)]">Lenken kan ikke brukes</p>
                <h2 className="mt-2 text-2xl font-semibold">Invitasjonen er ugyldig eller utløpt.</h2>
                <p className="mt-4 text-sm leading-7 text-[var(--text-secondary)]">{error || 'Be administratoren sende en ny invitasjon.'}</p>
                <button type="button" onClick={() => onReturnToLogin?.(null)} className="mt-7 self-start text-sm font-semibold text-[var(--accent-color)] underline underline-offset-4">
                  Tilbake til innlogging
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="flex items-start gap-4">
                  <div className="mt-1 hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] sm:flex">
                    <UserCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--text-muted)]">Velkommen</p>
                    <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">{invitation.fullName || 'Aktiver kontoen din'}</h2>
                    <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                      Tilgang til <strong className="text-[var(--text-primary)]">{invitation.clientName}</strong>. Kunde-ID ved innlogging er <strong className="text-[var(--text-primary)]">{invitation.clientId}</strong>.
                    </p>
                  </div>
                </div>

                <div className="mt-8 space-y-5">
                  <label className="block space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-secondary)]">Velg brukernavn</span>
                    <input
                      className={inputClass}
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      autoComplete="username"
                      minLength={3}
                      maxLength={64}
                      required
                    />
                    <span className="block text-xs text-[var(--text-muted)]">3–64 tegn. Bokstaver, tall, punktum, bindestrek og understrek.</span>
                  </label>

                  <label className="block space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-secondary)]">Velg passord</span>
                    <div className="relative">
                      <input
                        className={`${inputClass} pr-12`}
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="new-password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[var(--text-secondary)]"
                        aria-label={showPassword ? 'Skjul passord' : 'Vis passord'}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {passwordChecks.map((check) => (
                        <span
                          key={check.label}
                          className={`rounded-full border px-2.5 py-1 text-[11px] ${check.ready ? 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]' : 'border-[var(--glass-border)] text-[var(--text-muted)]'}`}
                        >
                          {check.label}
                        </span>
                      ))}
                    </div>
                  </label>

                  <label className="block space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-secondary)]">Gjenta passord</span>
                    <input
                      className={inputClass}
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </label>
                </div>

                {error ? (
                  <p className="mt-5 rounded-xl border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3 text-sm text-[var(--status-danger-text)]">{error}</p>
                ) : null}

                <div className="mt-7 flex flex-col gap-3 border-t border-[var(--glass-border)] pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-[var(--text-muted)]">Gyldig til {formatExpiry(invitation.expiresAt)}</p>
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent-color)] px-5 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                    Aktiver konto
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

