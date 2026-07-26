import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  BookOpen,
  Check,
  Cpu,
  Shield,
  Workflow,
} from '../../icons';
import generatorHtml from '../../configGenerator/legacy/index.html?raw';
import generatorStyles from '../../configGenerator/legacy/styles.css?raw';
import generatorTemplates from '../../configGenerator/legacy/templates.generated.js?raw';
import generatorApp from '../../configGenerator/legacy/app.js?raw';

const FRAME_MESSAGE_TYPE = 'smart-sauna-config-generator:height';
const DOWNLOAD_MESSAGE_TYPE = 'smart-sauna-config-generator:download';
const COPY_MESSAGE_TYPE = 'smart-sauna-config-generator:copy';
const MIN_FRAME_HEIGHT = 1200;
const MAX_FRAME_HEIGHT = 20000;
const MAX_DOWNLOAD_SIZE = 2_000_000;

const frameOverrides = `
  html {
    background: transparent;
    scrollbar-color: color-mix(in srgb, var(--ember) 48%, transparent) transparent;
  }

  body {
    min-height: 0;
  }

  .shell {
    padding-top: 0.75rem;
  }

  .hero {
    margin-top: 0;
  }

  @media (max-width: 760px) {
    .shell {
      padding-top: 0.4rem;
    }
  }
`;

const frameBridge = `
  (() => {
    const sendHeight = () => {
      const height = Math.max(
        document.documentElement.scrollHeight || 0,
        document.body?.scrollHeight || 0
      );
      window.parent.postMessage({
        type: "${FRAME_MESSAGE_TYPE}",
        height
      }, "*");
    };

    const observer = new ResizeObserver(sendHeight);
    if (document.body) observer.observe(document.body);
    window.addEventListener("load", sendHeight);
    window.addEventListener("resize", sendHeight);
    document.addEventListener("click", () => window.setTimeout(sendHeight, 0));
    document.addEventListener("change", () => window.setTimeout(sendHeight, 0));
    window.setTimeout(sendHeight, 50);
  })();
`;

const escapeInlineScript = (source) => String(source || '').replaceAll('</script', '<\\/script');

const triggerTextDownload = (filename, content) => {
  const safeFilename = String(filename || '').trim();
  const safeContent = String(content || '');
  if (!/^[a-zA-Z0-9._-]+$/.test(safeFilename) || safeContent.length > MAX_DOWNLOAD_SIZE) return false;
  const blob = new globalThis.Blob([safeContent], { type: 'text/plain;charset=utf-8' });
  const url = globalThis.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeFilename;
  document.body.append(link);
  link.click();
  link.remove();
  globalThis.setTimeout(() => globalThis.URL.revokeObjectURL(url), 1000);
  return true;
};

const copyText = (content) => {
  const safeContent = String(content || '');
  if (!safeContent || safeContent.length > MAX_DOWNLOAD_SIZE) return;
  const fallback = () => {
    const textarea = document.createElement('textarea');
    textarea.value = safeContent;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(safeContent).catch(fallback);
    return;
  }
  fallback();
};

const buildGeneratorDocument = () => {
  const combinedStyles = `${generatorStyles}\n${frameOverrides}`;
  const scripts = `
    <script>${escapeInlineScript(generatorTemplates)}</script>
    <script>${escapeInlineScript(generatorApp)}</script>
    <script>${escapeInlineScript(frameBridge)}</script>
  `;

  return generatorHtml
    .replace('<link rel="stylesheet" href="./styles.css" />', () => `<style>${combinedStyles}</style>`)
    .replace('<script src="./src/templates.generated.js" defer></script>', '')
    .replace('<script src="./src/app.js" defer></script>', () => scripts);
};

function TrustPoint({ icon: Icon, label, value }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-color)]" />
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[var(--text-muted)]">{label}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{value}</p>
      </div>
    </div>
  );
}

export default function SuperAdminConfigGeneratorPage({ t }) {
  const iframeRef = useRef(null);
  const [frameHeight, setFrameHeight] = useState(MIN_FRAME_HEIGHT);
  const [ready, setReady] = useState(false);
  const [lastDownloadName, setLastDownloadName] = useState('');
  const srcDoc = useMemo(buildGeneratorDocument, []);

  useEffect(() => {
    const onMessage = (event) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type === FRAME_MESSAGE_TYPE) {
        const nextHeight = Math.round(Number(event.data.height || 0));
        if (!Number.isFinite(nextHeight) || nextHeight <= 0) return;
        setFrameHeight(Math.min(MAX_FRAME_HEIGHT, Math.max(MIN_FRAME_HEIGHT, nextHeight)));
        setReady(true);
        return;
      }
      if (event.data?.type === DOWNLOAD_MESSAGE_TYPE) {
        if (triggerTextDownload(event.data.filename, event.data.content)) {
          setLastDownloadName(String(event.data.filename || ''));
        }
        return;
      }
      if (event.data?.type === COPY_MESSAGE_TYPE) {
        copyText(event.data.content);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1600px] pb-16">
      <header className="overflow-hidden rounded-[2rem] border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--card-bg)_84%,transparent)]">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.82fr)] lg:p-8">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-[var(--accent-color)]" />
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--accent-color)]">
                {t('superAdminConfigGenerator.eyebrow')}
              </p>
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">
              {t('superAdminConfigGenerator.title')}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              {t('superAdminConfigGenerator.subtitle')}
            </p>
          </div>

          <div className="grid gap-4 border-t border-[var(--glass-border)] pt-5 sm:grid-cols-3 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <TrustPoint
              icon={Shield}
              label={t('superAdminConfigGenerator.trust.local.label')}
              value={t('superAdminConfigGenerator.trust.local.value')}
            />
            <TrustPoint
              icon={Archive}
              label={t('superAdminConfigGenerator.trust.output.label')}
              value={t('superAdminConfigGenerator.trust.output.value')}
            />
            <TrustPoint
              icon={Workflow}
              label={t('superAdminConfigGenerator.trust.logic.label')}
              value={t('superAdminConfigGenerator.trust.logic.value')}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--bg-primary)_42%,transparent)] px-5 py-3 sm:px-7">
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <Cpu className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <span>
              {lastDownloadName
                ? `${t('superAdminConfigGenerator.downloadStarted')}: ${lastDownloadName}`
                : t('superAdminConfigGenerator.runtime')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${ready ? 'bg-emerald-400' : 'animate-pulse bg-amber-300'}`} />
            <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              {ready ? t('superAdminConfigGenerator.ready') : t('superAdminConfigGenerator.loading')}
            </span>
          </div>
        </div>
      </header>

      <section className="mt-5 overflow-hidden rounded-[2rem] border border-[var(--glass-border)] bg-[color-mix(in_srgb,var(--card-bg)_70%,transparent)]">
        <div className="flex items-start gap-3 border-b border-[var(--glass-border)] px-5 py-4 sm:px-7">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
          <p className="text-xs leading-5 text-[var(--text-secondary)]">
            {t('superAdminConfigGenerator.instructions')}
          </p>
        </div>
        <iframe
          ref={iframeRef}
          title={t('superAdminConfigGenerator.frameTitle')}
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-downloads"
          onLoad={() => setReady(true)}
          className="block w-full border-0 bg-transparent transition-opacity duration-300"
          style={{ height: `${frameHeight}px`, opacity: ready ? 1 : 0.35 }}
        />
      </section>
    </div>
  );
}
