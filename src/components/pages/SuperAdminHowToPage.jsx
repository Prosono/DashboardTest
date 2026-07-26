import {
  AlertTriangle,
  Archive,
  ArrowRight,
  BookOpen,
  Check,
  Cloud,
  Cpu,
  Database,
  Globe,
  Key,
  ListChecks,
  Lock,
  Radio,
  Router,
  Server,
  Shield,
  Workflow,
  Wrench,
  Zap,
} from '../../icons';

const focusClass = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]';

const sections = [
  { id: 'overview', labelKey: 'superAdminHowTo.nav.overview' },
  { id: 'architecture', labelKey: 'superAdminHowTo.nav.architecture' },
  { id: 'ownership', labelKey: 'superAdminHowTo.nav.ownership' },
  { id: 'setup', labelKey: 'superAdminHowTo.nav.setup' },
  { id: 'addresses', labelKey: 'superAdminHowTo.nav.addresses' },
  { id: 'backups', labelKey: 'superAdminHowTo.nav.backups' },
  { id: 'troubleshooting', labelKey: 'superAdminHowTo.nav.troubleshooting' },
  { id: 'security', labelKey: 'superAdminHowTo.nav.security' },
  { id: 'checklist', labelKey: 'superAdminHowTo.nav.checklist' },
];

function Pill({ children, tone = 'neutral' }) {
  const tones = {
    good: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
    info: 'border-sky-400/30 bg-sky-400/10 text-sky-100',
    warning: 'border-amber-400/30 bg-amber-400/10 text-amber-100',
    neutral: 'border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-secondary)]',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] ${tones[tone] || tones.neutral}`}>
      {children}
    </span>
  );
}

function SectionHeading({ eyebrow, title, text }) {
  return (
    <div className="mb-5 max-w-3xl">
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--accent-color)]">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-2xl">{title}</h2>
      {text ? <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{text}</p> : null}
    </div>
  );
}

function ArchitectureNode({ icon: Icon, eyebrow, title, text, tone = 'neutral' }) {
  const toneClass = tone === 'accent'
    ? 'border-[color-mix(in_srgb,var(--accent-color)_45%,var(--glass-border))] bg-[color-mix(in_srgb,var(--accent-color)_10%,var(--glass-bg))]'
    : tone === 'good'
      ? 'border-emerald-400/25 bg-emerald-400/[0.06]'
      : 'border-[var(--glass-border)] bg-[var(--glass-bg)]';
  return (
    <div className={`min-w-0 flex-1 rounded-2xl border p-4 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[var(--text-muted)]">{eyebrow}</p>
          <h3 className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
        </div>
        <Icon className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{text}</p>
    </div>
  );
}

function FlowArrow({ label }) {
  return (
    <div className="flex shrink-0 items-center justify-center gap-2 px-1 py-1 text-[var(--text-muted)] lg:flex-col lg:px-0">
      <ArrowRight className="h-4 w-4 rotate-90 lg:rotate-0" />
      {label ? <span className="text-[8px] font-bold uppercase tracking-[0.12em]">{label}</span> : null}
    </div>
  );
}

function ResponsibilityRow({ system, owns, why, tag, controlsLabel, reasonLabel, tone = 'neutral' }) {
  return (
    <div className="grid gap-2 border-t border-[var(--glass-border)] px-4 py-4 first:border-t-0 sm:grid-cols-[minmax(150px,0.7fr)_minmax(220px,1.1fr)_minmax(220px,1.2fr)] sm:gap-5">
      <div>
        <p className="text-sm font-semibold text-[var(--text-primary)]">{system}</p>
        <div className="mt-2"><Pill tone={tone}>{tag}</Pill></div>
      </div>
      <div>
        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">{controlsLabel}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{owns}</p>
      </div>
      <div>
        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">{reasonLabel}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{why}</p>
      </div>
    </div>
  );
}

function SetupStep({ number, icon: Icon, title, purpose, children }) {
  return (
    <article className="relative grid gap-4 rounded-3xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4 sm:grid-cols-[52px_minmax(0,1fr)] sm:p-5">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[color-mix(in_srgb,var(--accent-color)_34%,var(--glass-border))] bg-[color-mix(in_srgb,var(--accent-color)_10%,transparent)] text-sm font-bold text-[var(--text-primary)]">
        {number}
      </div>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{purpose}</p>
          </div>
          <Icon className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </article>
  );
}

function CheckList({ items, tone = 'good' }) {
  const iconClass = tone === 'warning' ? 'text-amber-300' : 'text-emerald-300';
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-xs leading-5 text-[var(--text-secondary)]">
          <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${iconClass}`} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function AddressCard({ label, value, text, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[var(--text-muted)]">{label}</p>
        <Icon className="h-4 w-4 text-[var(--text-muted)]" />
      </div>
      <code className="mt-3 block break-all text-sm font-semibold text-[var(--text-primary)]">{value}</code>
      <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{text}</p>
    </div>
  );
}

function TroubleItem({ title, symptom, checks, result, defaultOpen = false }) {
  return (
    <details
      className="group rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)]"
      open={defaultOpen}
    >
      <summary className={`flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 text-left ${focusClass}`}>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[var(--text-primary)]">{title}</span>
          <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">{symptom}</span>
        </span>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--glass-border)] text-[var(--text-muted)] transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="border-t border-[var(--glass-border)] px-4 py-4">
        <CheckList items={checks} tone="warning" />
        <p className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2.5 text-xs leading-5 text-emerald-100">
          {result}
        </p>
      </div>
    </details>
  );
}

export default function SuperAdminHowToPage({ t }) {
  const setupChecks = [
    t('superAdminHowTo.setup.step1.item1'),
    t('superAdminHowTo.setup.step1.item2'),
    t('superAdminHowTo.setup.step1.item3'),
  ];
  const registerChecks = [
    t('superAdminHowTo.setup.step2.item1'),
    t('superAdminHowTo.setup.step2.item2'),
    t('superAdminHowTo.setup.step2.item3'),
  ];
  const vpnChecks = [
    t('superAdminHowTo.setup.step3.item1'),
    t('superAdminHowTo.setup.step3.item2'),
    t('superAdminHowTo.setup.step3.item3'),
    t('superAdminHowTo.setup.step3.item4'),
  ];
  const publishChecks = [
    t('superAdminHowTo.setup.step4.item1'),
    t('superAdminHowTo.setup.step4.item2'),
    t('superAdminHowTo.setup.step4.item3'),
  ];
  const backupChecks = [
    t('superAdminHowTo.setup.step5.item1'),
    t('superAdminHowTo.setup.step5.item2'),
    t('superAdminHowTo.setup.step5.item3'),
  ];
  const verifyChecks = [
    t('superAdminHowTo.setup.step6.item1'),
    t('superAdminHowTo.setup.step6.item2'),
    t('superAdminHowTo.setup.step6.item3'),
    t('superAdminHowTo.setup.step6.item4'),
  ];

  return (
    <div className="mx-auto w-full max-w-[1500px] pb-16">
      <header className="relative overflow-hidden rounded-[2rem] border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--card-bg)_84%,transparent)] p-5 sm:p-7 lg:p-9">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[color-mix(in_srgb,var(--accent-color)_14%,transparent)] blur-3xl" />
        <div className="relative max-w-4xl">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[var(--accent-color)]" />
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--accent-color)]">
              {t('superAdminHowTo.eyebrow')}
            </p>
          </div>
          <h1 className="mt-4 max-w-3xl text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl lg:text-4xl">
            {t('superAdminHowTo.title')}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
            {t('superAdminHowTo.subtitle')}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Pill tone="info">{t('superAdminHowTo.hero.firstSetup')}</Pill>
            <Pill tone="good">{t('superAdminHowTo.hero.operations')}</Pill>
            <Pill>{t('superAdminHowTo.hero.troubleshooting')}</Pill>
          </div>
        </div>
      </header>

      <div className="mt-5 grid min-w-0 max-w-full gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="min-w-0 max-w-full xl:sticky xl:top-4 xl:self-start">
          <nav
            aria-label={t('superAdminHowTo.nav.aria')}
            className="scrollbar-hide flex w-full min-w-0 max-w-full snap-x gap-2 overflow-x-auto rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-2 xl:flex-col xl:overflow-visible"
          >
            {sections.map((section, index) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className={`flex min-w-max snap-start items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--glass-bg-hover)] hover:text-[var(--text-primary)] ${focusClass}`}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--glass-border)] text-[9px] text-[var(--text-muted)]">
                  {String(index + 1).padStart(2, '0')}
                </span>
                {t(section.labelKey)}
              </a>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 space-y-5">
          <section id="overview" className="scroll-mt-24 rounded-3xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-5 sm:p-6">
            <SectionHeading
              eyebrow={t('superAdminHowTo.overview.eyebrow')}
              title={t('superAdminHowTo.overview.title')}
              text={t('superAdminHowTo.overview.text')}
            />
            <div className="grid gap-3 md:grid-cols-3">
              <AddressCard
                icon={Workflow}
                label={t('superAdminHowTo.overview.rule1.label')}
                value={t('superAdminHowTo.overview.rule1.value')}
                text={t('superAdminHowTo.overview.rule1.text')}
              />
              <AddressCard
                icon={Shield}
                label={t('superAdminHowTo.overview.rule2.label')}
                value={t('superAdminHowTo.overview.rule2.value')}
                text={t('superAdminHowTo.overview.rule2.text')}
              />
              <AddressCard
                icon={Database}
                label={t('superAdminHowTo.overview.rule3.label')}
                value={t('superAdminHowTo.overview.rule3.value')}
                text={t('superAdminHowTo.overview.rule3.text')}
              />
            </div>
          </section>

          <section id="architecture" className="scroll-mt-24 rounded-3xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-5 sm:p-6">
            <SectionHeading
              eyebrow={t('superAdminHowTo.architecture.eyebrow')}
              title={t('superAdminHowTo.architecture.title')}
              text={t('superAdminHowTo.architecture.text')}
            />

            <div className="rounded-2xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--bg-primary)_50%,transparent)] p-4">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                {t('superAdminHowTo.architecture.controlFlow')}
              </p>
              <div className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-center">
                <ArchitectureNode
                  icon={Cloud}
                  eyebrow={t('superAdminHowTo.architecture.booking.eyebrow')}
                  title={t('superAdminHowTo.architecture.booking.title')}
                  text={t('superAdminHowTo.architecture.booking.text')}
                />
                <FlowArrow label={t('superAdminHowTo.architecture.fetches')} />
                <ArchitectureNode
                  icon={Cpu}
                  eyebrow={t('superAdminHowTo.architecture.hub.eyebrow')}
                  title={t('superAdminHowTo.architecture.hub.title')}
                  text={t('superAdminHowTo.architecture.hub.text')}
                  tone="accent"
                />
                <FlowArrow label={t('superAdminHowTo.architecture.controls')} />
                <ArchitectureNode
                  icon={Workflow}
                  eyebrow={t('superAdminHowTo.architecture.knx.eyebrow')}
                  title={t('superAdminHowTo.architecture.knx.title')}
                  text={t('superAdminHowTo.architecture.knx.text')}
                />
                <FlowArrow label={t('superAdminHowTo.architecture.bus')} />
                <ArchitectureNode
                  icon={Zap}
                  eyebrow={t('superAdminHowTo.architecture.equipment.eyebrow')}
                  title={t('superAdminHowTo.architecture.equipment.title')}
                  text={t('superAdminHowTo.architecture.equipment.text')}
                  tone="good"
                />
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--bg-primary)_50%,transparent)] p-4">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                {t('superAdminHowTo.architecture.remoteFlow')}
              </p>
              <div className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-center">
                <ArchitectureNode
                  icon={Globe}
                  eyebrow="HTTPS"
                  title={t('superAdminHowTo.architecture.domain.title')}
                  text={t('superAdminHowTo.architecture.domain.text')}
                />
                <FlowArrow />
                <ArchitectureNode
                  icon={Server}
                  eyebrow="Caddy"
                  title={t('superAdminHowTo.architecture.server.title')}
                  text={t('superAdminHowTo.architecture.server.text')}
                  tone="accent"
                />
                <FlowArrow />
                <ArchitectureNode
                  icon={Shield}
                  eyebrow="WireGuard"
                  title={t('superAdminHowTo.architecture.tunnel.title')}
                  text={t('superAdminHowTo.architecture.tunnel.text')}
                />
                <FlowArrow />
                <ArchitectureNode
                  icon={Router}
                  eyebrow="4G / UMR"
                  title={t('superAdminHowTo.architecture.umr.title')}
                  text={t('superAdminHowTo.architecture.umr.text')}
                />
                <FlowArrow />
                <ArchitectureNode
                  icon={Cpu}
                  eyebrow="LAN :8123"
                  title="Home Assistant"
                  text={t('superAdminHowTo.architecture.ha.text')}
                  tone="good"
                />
              </div>
            </div>

            <div className="mt-3 flex items-start gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/[0.06] p-4">
              <Radio className="mt-0.5 h-4 w-4 shrink-0 text-sky-200" />
              <p className="text-xs leading-5 text-sky-100">{t('superAdminHowTo.architecture.switchNote')}</p>
            </div>
          </section>

          <section id="ownership" className="scroll-mt-24 overflow-hidden rounded-3xl border border-[var(--glass-border)] bg-[var(--glass-bg)]">
            <div className="p-5 pb-1 sm:p-6 sm:pb-1">
              <SectionHeading
                eyebrow={t('superAdminHowTo.ownership.eyebrow')}
                title={t('superAdminHowTo.ownership.title')}
                text={t('superAdminHowTo.ownership.text')}
              />
            </div>
            <ResponsibilityRow
              system="Home Assistant / SMARTi Hub"
              controlsLabel={t('superAdminHowTo.ownership.controlsLabel')}
              reasonLabel={t('superAdminHowTo.ownership.reasonLabel')}
              owns={t('superAdminHowTo.ownership.ha.owns')}
              why={t('superAdminHowTo.ownership.ha.why')}
              tag={t('superAdminHowTo.ownership.tag.control')}
              tone="good"
            />
            <ResponsibilityRow
              system="KNX gateway"
              controlsLabel={t('superAdminHowTo.ownership.controlsLabel')}
              reasonLabel={t('superAdminHowTo.ownership.reasonLabel')}
              owns={t('superAdminHowTo.ownership.knx.owns')}
              why={t('superAdminHowTo.ownership.knx.why')}
              tag={t('superAdminHowTo.ownership.tag.field')}
            />
            <ResponsibilityRow
              system="Ubiquiti UMR"
              controlsLabel={t('superAdminHowTo.ownership.controlsLabel')}
              reasonLabel={t('superAdminHowTo.ownership.reasonLabel')}
              owns={t('superAdminHowTo.ownership.umr.owns')}
              why={t('superAdminHowTo.ownership.umr.why')}
              tag={t('superAdminHowTo.ownership.tag.edge')}
              tone="info"
            />
            <ResponsibilityRow
              system="WireGuard + Caddy"
              controlsLabel={t('superAdminHowTo.ownership.controlsLabel')}
              reasonLabel={t('superAdminHowTo.ownership.reasonLabel')}
              owns={t('superAdminHowTo.ownership.server.owns')}
              why={t('superAdminHowTo.ownership.server.why')}
              tag={t('superAdminHowTo.ownership.tag.access')}
              tone="info"
            />
            <ResponsibilityRow
              system="SmartSauna"
              controlsLabel={t('superAdminHowTo.ownership.controlsLabel')}
              reasonLabel={t('superAdminHowTo.ownership.reasonLabel')}
              owns={t('superAdminHowTo.ownership.app.owns')}
              why={t('superAdminHowTo.ownership.app.why')}
              tag={t('superAdminHowTo.ownership.tag.source')}
              tone="good"
            />
            <ResponsibilityRow
              system="UniFi Mobility"
              controlsLabel={t('superAdminHowTo.ownership.controlsLabel')}
              reasonLabel={t('superAdminHowTo.ownership.reasonLabel')}
              owns={t('superAdminHowTo.ownership.mobility.owns')}
              why={t('superAdminHowTo.ownership.mobility.why')}
              tag={t('superAdminHowTo.ownership.tag.operations')}
            />
          </section>

          <section id="setup" className="scroll-mt-24 rounded-3xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--card-bg)_76%,transparent)] p-5 sm:p-6">
            <SectionHeading
              eyebrow={t('superAdminHowTo.setup.eyebrow')}
              title={t('superAdminHowTo.setup.title')}
              text={t('superAdminHowTo.setup.text')}
            />
            <div className="space-y-3">
              <SetupStep
                number="01"
                icon={ListChecks}
                title={t('superAdminHowTo.setup.step1.title')}
                purpose={t('superAdminHowTo.setup.step1.purpose')}
              >
                <CheckList items={setupChecks} />
              </SetupStep>
              <SetupStep
                number="02"
                icon={Router}
                title={t('superAdminHowTo.setup.step2.title')}
                purpose={t('superAdminHowTo.setup.step2.purpose')}
              >
                <CheckList items={registerChecks} />
              </SetupStep>
              <SetupStep
                number="03"
                icon={Key}
                title={t('superAdminHowTo.setup.step3.title')}
                purpose={t('superAdminHowTo.setup.step3.purpose')}
              >
                <CheckList items={vpnChecks} />
                <div className="mt-4 grid gap-2 sm:grid-cols-4">
                  <AddressCard label="Address" value="10.88.0.x/32" text={t('superAdminHowTo.setup.wg.address')} icon={Radio} />
                  <AddressCard label="Endpoint" value="65.21.203.69:51820" text={t('superAdminHowTo.setup.wg.endpoint')} icon={Server} />
                  <AddressCard label="AllowedIPs" value="10.88.0.0/24" text={t('superAdminHowTo.setup.wg.allowed')} icon={Shield} />
                  <AddressCard label="Keepalive / MTU" value="25 / 1420" text={t('superAdminHowTo.setup.wg.keepalive')} icon={Workflow} />
                </div>
              </SetupStep>
              <SetupStep
                number="04"
                icon={Globe}
                title={t('superAdminHowTo.setup.step4.title')}
                purpose={t('superAdminHowTo.setup.step4.purpose')}
              >
                <CheckList items={publishChecks} />
              </SetupStep>
              <SetupStep
                number="05"
                icon={Archive}
                title={t('superAdminHowTo.setup.step5.title')}
                purpose={t('superAdminHowTo.setup.step5.purpose')}
              >
                <CheckList items={backupChecks} />
              </SetupStep>
              <SetupStep
                number="06"
                icon={Check}
                title={t('superAdminHowTo.setup.step6.title')}
                purpose={t('superAdminHowTo.setup.step6.purpose')}
              >
                <CheckList items={verifyChecks} />
              </SetupStep>
            </div>
          </section>

          <section id="addresses" className="scroll-mt-24 rounded-3xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-5 sm:p-6">
            <SectionHeading
              eyebrow={t('superAdminHowTo.addresses.eyebrow')}
              title={t('superAdminHowTo.addresses.title')}
              text={t('superAdminHowTo.addresses.text')}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <AddressCard icon={Globe} label={t('superAdminHowTo.addresses.public.label')} value="65.21.203.69" text={t('superAdminHowTo.addresses.public.text')} />
              <AddressCard icon={Shield} label={t('superAdminHowTo.addresses.tunnel.label')} value="10.88.0.x" text={t('superAdminHowTo.addresses.tunnel.text')} />
              <AddressCard icon={Router} label={t('superAdminHowTo.addresses.lan.label')} value="192.168.x.0/24" text={t('superAdminHowTo.addresses.lan.text')} />
              <AddressCard icon={Cpu} label={t('superAdminHowTo.addresses.ha.label')} value="192.168.x.120:8123" text={t('superAdminHowTo.addresses.ha.text')} />
            </div>

            <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--glass-border)]">
              <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                <thead className="bg-[color-mix(in_srgb,var(--bg-primary)_58%,transparent)] text-[var(--text-muted)]">
                  <tr>
                    <th className="px-4 py-3 font-bold uppercase tracking-[0.15em]">{t('superAdminHowTo.examples.site')}</th>
                    <th className="px-4 py-3 font-bold uppercase tracking-[0.15em]">{t('superAdminHowTo.examples.tunnel')}</th>
                    <th className="px-4 py-3 font-bold uppercase tracking-[0.15em]">LAN</th>
                    <th className="px-4 py-3 font-bold uppercase tracking-[0.15em]">Home Assistant</th>
                    <th className="px-4 py-3 font-bold uppercase tracking-[0.15em]">{t('superAdminHowTo.examples.domain')}</th>
                  </tr>
                </thead>
                <tbody className="text-[var(--text-secondary)]">
                  <tr className="border-t border-[var(--glass-border)]">
                    <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">OBF Sofienborg</td>
                    <td className="px-4 py-3 font-mono">10.88.0.5</td>
                    <td className="px-4 py-3 font-mono">192.168.107.0/24</td>
                    <td className="px-4 py-3 font-mono">192.168.107.120:8123</td>
                    <td className="px-4 py-3 font-mono">obf1.smarti.dev</td>
                  </tr>
                  <tr className="border-t border-[var(--glass-border)]">
                    <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">KAR Karistranda</td>
                    <td className="px-4 py-3 font-mono">10.88.0.2</td>
                    <td className="px-4 py-3 font-mono">192.168.105.0/24</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{t('superAdminHowTo.examples.notRegistered')}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{t('superAdminHowTo.examples.notRegistered')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section id="backups" className="scroll-mt-24 rounded-3xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-5 sm:p-6">
            <SectionHeading
              eyebrow={t('superAdminHowTo.backups.eyebrow')}
              title={t('superAdminHowTo.backups.title')}
              text={t('superAdminHowTo.backups.text')}
            />
            <div className="grid gap-3 md:grid-cols-[0.8fr_0.6fr_0.8fr_1.4fr]">
              <AddressCard icon={Server} label="Host" value="10.88.0.1" text={t('superAdminHowTo.backups.host')} />
              <AddressCard icon={Lock} label="Port" value="22" text="SFTP / SSH" />
              <AddressCard icon={Key} label={t('superAdminHowTo.backups.userLabel')} value="ha-backup" text={t('superAdminHowTo.backups.user')} />
              <AddressCard icon={Archive} label={t('superAdminHowTo.backups.pathLabel')} value="/srv/ha-backups/{client}/{location}" text={t('superAdminHowTo.backups.path')} />
            </div>
            <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                <div>
                  <p className="text-sm font-semibold text-amber-100">{t('superAdminHowTo.backups.exactTitle')}</p>
                  <p className="mt-1 text-xs leading-5 text-amber-100/80">{t('superAdminHowTo.backups.exactText')}</p>
                  <code className="mt-3 block break-all rounded-xl border border-amber-400/15 bg-black/10 px-3 py-2 text-xs text-amber-50">
                    /srv/ha-backups/obf/sofienborg
                  </code>
                </div>
              </div>
            </div>
          </section>

          <section id="troubleshooting" className="scroll-mt-24 rounded-3xl border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--card-bg)_76%,transparent)] p-5 sm:p-6">
            <SectionHeading
              eyebrow={t('superAdminHowTo.trouble.eyebrow')}
              title={t('superAdminHowTo.trouble.title')}
              text={t('superAdminHowTo.trouble.text')}
            />
            <div className="space-y-2.5">
              <TroubleItem
                defaultOpen
                title={t('superAdminHowTo.trouble.vpn.title')}
                symptom={t('superAdminHowTo.trouble.vpn.symptom')}
                checks={[
                  t('superAdminHowTo.trouble.vpn.check1'),
                  t('superAdminHowTo.trouble.vpn.check2'),
                  t('superAdminHowTo.trouble.vpn.check3'),
                ]}
                result={t('superAdminHowTo.trouble.vpn.result')}
              />
              <TroubleItem
                title={t('superAdminHowTo.trouble.gateway.title')}
                symptom={t('superAdminHowTo.trouble.gateway.symptom')}
                checks={[
                  t('superAdminHowTo.trouble.gateway.check1'),
                  t('superAdminHowTo.trouble.gateway.check2'),
                  t('superAdminHowTo.trouble.gateway.check3'),
                ]}
                result={t('superAdminHowTo.trouble.gateway.result')}
              />
              <TroubleItem
                title={t('superAdminHowTo.trouble.sftp.title')}
                symptom={t('superAdminHowTo.trouble.sftp.symptom')}
                checks={[
                  t('superAdminHowTo.trouble.sftp.check1'),
                  t('superAdminHowTo.trouble.sftp.check2'),
                  t('superAdminHowTo.trouble.sftp.check3'),
                ]}
                result={t('superAdminHowTo.trouble.sftp.result')}
              />
              <TroubleItem
                title={t('superAdminHowTo.trouble.missing.title')}
                symptom={t('superAdminHowTo.trouble.missing.symptom')}
                checks={[
                  t('superAdminHowTo.trouble.missing.check1'),
                  t('superAdminHowTo.trouble.missing.check2'),
                  t('superAdminHowTo.trouble.missing.check3'),
                ]}
                result={t('superAdminHowTo.trouble.missing.result')}
              />
              <TroubleItem
                title={t('superAdminHowTo.trouble.mobility.title')}
                symptom={t('superAdminHowTo.trouble.mobility.symptom')}
                checks={[
                  t('superAdminHowTo.trouble.mobility.check1'),
                  t('superAdminHowTo.trouble.mobility.check2'),
                  t('superAdminHowTo.trouble.mobility.check3'),
                ]}
                result={t('superAdminHowTo.trouble.mobility.result')}
              />
            </div>
          </section>

          <section id="security" className="scroll-mt-24 rounded-3xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-5 sm:p-6">
            <SectionHeading
              eyebrow={t('superAdminHowTo.security.eyebrow')}
              title={t('superAdminHowTo.security.title')}
              text={t('superAdminHowTo.security.text')}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4">
                <p className="text-sm font-semibold text-emerald-100">{t('superAdminHowTo.security.automaticTitle')}</p>
                <div className="mt-3">
                  <CheckList items={[
                    t('superAdminHowTo.security.auto1'),
                    t('superAdminHowTo.security.auto2'),
                    t('superAdminHowTo.security.auto3'),
                    t('superAdminHowTo.security.auto4'),
                  ]} />
                </div>
              </div>
              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
                <p className="text-sm font-semibold text-amber-100">{t('superAdminHowTo.security.manualTitle')}</p>
                <div className="mt-3">
                  <CheckList tone="warning" items={[
                    t('superAdminHowTo.security.manual1'),
                    t('superAdminHowTo.security.manual2'),
                    t('superAdminHowTo.security.manual3'),
                    t('superAdminHowTo.security.manual4'),
                  ]} />
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-start gap-3 rounded-2xl border border-red-400/20 bg-red-400/[0.06] p-4">
              <Key className="mt-0.5 h-4 w-4 shrink-0 text-red-200" />
              <p className="text-xs leading-5 text-red-100">{t('superAdminHowTo.security.secretRule')}</p>
            </div>
          </section>

          <section id="checklist" className="scroll-mt-24 overflow-hidden rounded-3xl border border-[color-mix(in_srgb,var(--accent-color)_42%,var(--glass-border))] bg-[color-mix(in_srgb,var(--accent-color)_9%,var(--glass-bg))]">
            <div className="grid gap-0 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
              <div className="p-5 sm:p-6">
                <SectionHeading
                  eyebrow={t('superAdminHowTo.checklist.eyebrow')}
                  title={t('superAdminHowTo.checklist.title')}
                  text={t('superAdminHowTo.checklist.text')}
                />
                <CheckList items={[
                  t('superAdminHowTo.checklist.item1'),
                  t('superAdminHowTo.checklist.item2'),
                  t('superAdminHowTo.checklist.item3'),
                  t('superAdminHowTo.checklist.item4'),
                  t('superAdminHowTo.checklist.item5'),
                  t('superAdminHowTo.checklist.item6'),
                  t('superAdminHowTo.checklist.item7'),
                ]} />
              </div>
              <div className="border-t border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--bg-primary)_38%,transparent)] p-5 lg:border-l lg:border-t-0 sm:p-6">
                <Wrench className="h-5 w-5 text-[var(--accent-color)]" />
                <p className="mt-4 text-sm font-semibold text-[var(--text-primary)]">{t('superAdminHowTo.checklist.doneTitle')}</p>
                <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{t('superAdminHowTo.checklist.doneText')}</p>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
