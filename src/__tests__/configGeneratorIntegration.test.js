import { describe, expect, it } from 'vitest';
import generatorHtml from '../configGenerator/legacy/index.html?raw';
import generatorTemplates from '../configGenerator/legacy/templates.generated.js?raw';
import generatorApp from '../configGenerator/legacy/app.js?raw';

const nextRender = () => new Promise((resolve) => {
  globalThis.requestAnimationFrame(() => resolve());
});

describe('Smart Sauna config generator integration', () => {
  it('generates the demo package and keeps derived identities aligned with sauna name', async () => {
    const body = generatorHtml.match(/<body>([\s\S]*?)<\/body>/i)?.[1] || '';
    document.body.innerHTML = body;

    window.eval(generatorTemplates);
    window.eval(generatorApp);

    expect(document.querySelector('#file-overview')?.textContent).toContain('12 filer');
    expect(document.querySelector('#summary-chips')?.textContent).toContain('Åpne hull');
    expect(document.querySelector('#summary-chips')?.textContent).toContain('0');
    expect(document.querySelector('#autofill-grid')?.textContent).toContain('switch.badstu_hovedrele');
    expect(document.querySelector('#autofill-grid')?.textContent).not.toContain('switch.rele_hoveddor');

    const saunaName = document.querySelector('[data-path="saunaName"]');
    saunaName.value = 'Sofienborg QA';
    saunaName.dispatchEvent(new Event('input', { bubbles: true }));
    await nextRender();

    expect(document.querySelector('#autofill-grid')?.textContent).toContain('periode_sauna_sofienborg_qa');
    expect(document.querySelector('#preview-content')?.textContent).toContain('KUR Saunas – Sofienborg QA');

    document.querySelector('#load-blank')?.click();
    expect(document.querySelector('#readiness-list')?.textContent).toContain('0 av 6');
    expect(document.querySelector('#readiness-list')?.textContent).toContain('7 punkt');
    expect(document.querySelector('#notes-list')?.textContent).toContain('Badstunavn mangler.');
    expect(document.querySelector('#notes-list')?.textContent).toContain('KNX-filen er ikke importert enda.');
  });
});
