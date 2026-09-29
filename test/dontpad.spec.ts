import { spec } from 'pactum';

jest.setTimeout(60000);

const API = 'https://api.dontpad.com';
const PAD = `integration-tests-${process.env.GITHUB_RUN_ID ?? Date.now()}`;

const HEADERS = {
  Origin: 'https://dontpad.com',
  Referer: 'https://dontpad.com/',
  'User-Agent': 'Mozilla/5.0',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Tenta de novo (com espera crescente) enquanto o servidor responder 429
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const withRetry = async (fn: () => Promise<any>, attempts = 4) => {
  let res = await fn();
  for (let i = 1; i < attempts && res.statusCode === 429; i++) {
    await sleep(3000 * i);
    res = await fn();
  }
  return res;
};

const readPad = () =>
  withRetry(() =>
    spec()
      .get(`${API}/${PAD}.body.json`)
      .withHeaders(HEADERS)
      .withQueryParams('lastModified', 0)
      .toss(),
  );

const writePad = (text: string) =>
  withRetry(() =>
    spec()
      .post(`${API}/${PAD}`)
      .withHeaders({
        ...HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      })
      .withBody(`text=${encodeURIComponent(text)}&lastModified=0&force=true`)
      .toss(),
  );

let escreveu = false;

describe('Dontpad', () => {
  it('escreve e lê o conteúdo', async () => {
    const texto = `Olá do Jest ${Date.now()}`;

    const w = await writePad(texto);
    expect(w.statusCode).toBe(200);
    escreveu = true;

    const r = await readPad();
    expect(r.statusCode).toBe(200);
    expect(r.body.body).toContain(texto);
  });

  it('sobrescreve o conteúdo anterior', async () => {
    const novo = `Novo conteúdo ${Date.now()}`;

    const w = await writePad(novo);
    expect(w.statusCode).toBe(200);

    const r = await readPad();
    expect(r.statusCode).toBe(200);
    expect(r.body.body).toContain(novo);
    expect(r.body.body).not.toContain('Olá do Jest');
  });

  afterAll(async () => {
    if (escreveu) await writePad('');
  });
});