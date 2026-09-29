import { spec } from 'pactum';

jest.setTimeout(120000);

const API = 'https://api.dontpad.com';
// Nome fixo: depois da execução, abra https://dontpad.com/teste-bettina-jest
const PAD = 'teste-bettina-jest';

const HEADERS = {
  Origin: 'https://dontpad.com',
  Referer: 'https://dontpad.com/',
  'User-Agent': 'Mozilla/5.0',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parse = (r: any) => (typeof r.body === 'string' ? JSON.parse(r.body) : r.body);

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

// Lê até o conteúdo esperado aparecer (ou desiste depois de ~8s)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readUntil = async (esperado: string): Promise<any> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ultimo: any;
  for (let i = 0; i < 8; i++) {
    const r = await readPad();
    expect(r.statusCode).toBe(200);
    ultimo = parse(r);
    if (ultimo?.body?.includes(esperado)) return ultimo;
    await sleep(1000);
  }
  throw new Error(`Conteúdo não apareceu. Última resposta: ${JSON.stringify(ultimo)}`);
};

describe('Dontpad', () => {
  it('1. leitura retorna a estrutura esperada', async () => {
    const r = await readPad();

    expect(r.statusCode).toBe(200);
    const json = parse(r);
    expect(json).toHaveProperty('body');
    expect(json).toHaveProperty('changed');
    expect(json).toHaveProperty('lastModified');
    expect(typeof json.body).toBe('string');
  });

  it('2. escreve e lê o conteúdo', async () => {
    const texto = `Olá do Jest ${Date.now()}`;

    const w = await writePad(texto);
    expect(w.statusCode).toBe(200);

    const lido = await readUntil(texto);
    expect(lido.body).toContain(texto);
  });

  it('3. sobrescreve o conteúdo anterior', async () => {
    const primeiro = `Primeiro ${Date.now()}`;
    const segundo = `Segundo ${Date.now()}`;

    expect((await writePad(primeiro)).statusCode).toBe(200);
    await readUntil(primeiro);

    expect((await writePad(segundo)).statusCode).toBe(200);
    const lido = await readUntil(segundo);

    expect(lido.body).toContain(segundo);
    expect(lido.body).not.toContain(primeiro);
  });

  it('4. preserva acentos e caracteres especiais', async () => {
    const texto = `ação, coração, ñ, ü, & = ? # ${Date.now()}`;

    const w = await writePad(texto);
    expect(w.statusCode).toBe(200);

    const lido = await readUntil(texto);
    expect(lido.body).toContain(texto);
  });

  it('5. deixa uma mensagem final com várias linhas no pad', async () => {
    const data = new Date().toISOString();
    const linhas = [
      'Teste automatizado (Jest + PactumJS)',
      `Última execução: ${data}`,
      `Executado no GitHub Actions: ${process.env.GITHUB_ACTIONS ? 'sim' : 'não'}`,
    ];

    const w = await writePad(linhas.join('\n'));
    expect(w.statusCode).toBe(200);

    const lido = await readUntil(linhas[1]);
    linhas.forEach((l) => expect(lido.body).toContain(l));
  });
});