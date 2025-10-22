const crypto = require('crypto');
const nock = require('nock');
const { AppError } = require('../src/errors');

const HOST_SUCCESS = '8.8.8.8';
const HOST_BASE64 = '1.1.1.1';
const HOST_FAILURE = '93.184.216.34';
const HOST_TIMEOUT = '208.67.222.222';
const HOST_INVALID = '45.33.32.156';

const SAMPLE_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAoXxYfxOdWBzU1+tOQeRQNli21Jdibeu04J6gK3JsASKnPYBd
FPK96BSPtBnf3RQOw2KQECCa3lQD3N2sXmBQvkGAZYjLKZ1de56aNxTqBUQwsahY
XEYuwNBO/rIkC4snEL+iywU6yQ5+/dsV6Mz7NlNNwKD2DvjN71Uagarl+c/stOog
TcAocQks178mPOX9uqIdNlaSXimycAPiblqrJGsvb9P65seftl/RZhpB7tiJDKek
n9WNsdqaT03Yf6tdddpiptfPhl7ZN9gTiznlvhCYiK6lZarBFm7bFZWGk8RAAnNU
UbUVZXFNOZ36SjOxjPV081h+JQlvKe2x25YFoQIDAQABAoIBACvEyyuuQlBWiC35
vh1H56HDS9K1MV1/rGfRNrJv8ewg21llCFWcMXLM1+JFvRJr1FCKz2c/nxoxhVaA
0q5Fxry6fjWG7SHbYDIYW84gIgnJYLVWXpSsBRIHo9GOsQxb6/uzJUmHolZKUos1
rWuK22/vBjz2o5qNPyvmUifhDTI3BZoQX355Mqa7F6cvmV2zNjVewkyexobSUU8Z
d/NVPn1ZXF5UvldsF6hRYx+0jVAe7ndEO9IPSRfX2gOqrzql/iuualR945R54ZSE
0FYPSIHNkHVXwaFYF5vL/xcsZOwv6QoxPGDMisj0y5mmhCPC9DkoOPlFbuR6uwnj
0kD3V00CgYEA1wwJTVLT7aSCz4ICyYB0MWYrecSyHXAFmwsxn4Xd+/QrwkSAIpz1
MeHOSmXx2pCrB8BkPkh86iEPaWSs30ia9geQ9jSvUA/O2WaLAsVoBOKan3dvyoXB
jnomGCzlvwBOcd14Tj5+3d/gTFGQVKrlRUpkQLzNh641Zc/7Yb80/j8CgYEAwD0X
ZO64Y1ORnWRjnqb2XGI6MwoXXIH7N5WNK2tjZNQZhunaLwRsC5BE+py4Rz+QLOm0
PoulUqem46zdB5uc/tkHJIvALtZWfqMiP+bX2eUhV427rXJXNHxS+ygMk7LshyKZ
PqCNHNo2ynr7VRWKdqKSyZJbDhJ/W9J511O9xB8CgYEA1onVheTKNV1Ye3izGyAh
y16opPTM1X16ujEysnk0+zWfqlH4m4+HNtqVmbeWz3xghH02BMUAifutinG73Y5r
umPWBSqOdAsxS8Z3jK4wlh8UL19SkfNbJK9L7fZsxl6h5AsVCMpkeynsdXcxzKYp
0TTkS4mQanosH4Scv+moDrUCgYAmyKx9moPs1iFcpbJLgdfWT6L6RSDtcvPiBPQU
PHgzEW+M/oUcU0IRGywve4raJQLLbOMGc1oJUPWknW2CaWzFJbgBMYi2alvM9NCm
H8aQmV+esGOa3KSnXCXJsgzHh6Ocp+hO8ElH9uZy91jZk5z5zlbbAAIK1sSHG/Gk
9aoldQKBgQC1f0Jvbj2wYjmb+nFq+u/f/7Ueb7Ju+XGklAJMJkZp7YX/gFY56UEl
pfjKTniaqjCLwmlcZJXIIeexlaKzsuslq6BOcyNQ9WK1oCZwTnd8FhhiZ6kgDYTG
CakM43eUKm0gf8dJZLv4nN2h/uQHG/kaQFpFx1xrTLPoN/1SqF8PzQ==
-----END RSA PRIVATE KEY-----`;

const PUBLIC_KEY = crypto.createPublicKey(SAMPLE_PRIVATE_KEY);
const OAEP_CHUNK_SIZE = 214;
const PKCS1_CHUNK_SIZE = 245;

function rsaEncrypt(buffer, padding = crypto.constants.RSA_PKCS1_OAEP_PADDING) {
  const chunkSize = padding === crypto.constants.RSA_PKCS1_OAEP_PADDING ? OAEP_CHUNK_SIZE : PKCS1_CHUNK_SIZE;
  const chunks = [];

  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    const chunk = buffer.subarray(offset, offset + chunkSize);
    chunks.push(
      crypto.publicEncrypt(
        {
          key: PUBLIC_KEY,
          padding,
        },
        chunk
      )
    );
  }

  return Buffer.concat(chunks);
}

function buildPlainBuffer() {
  const seed = 'Encrypted image payload for regression tests.';
  return Buffer.from(seed.repeat(8));
}

function createMockResponse() {
  const headers = {};
  const chunks = [];

  return {
    statusCode: 200,
    headers,
    ended: false,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    write(chunk) {
      chunks.push(Buffer.from(chunk));
    },
    end(chunk) {
      if (chunk) {
        chunks.push(Buffer.from(chunk));
      }
      this.ended = true;
    },
    get body() {
      return Buffer.concat(chunks);
    },
  };
}

function clearModuleCache() {
  ['../src/config', '../src/controllers/decryptController', '../src/services/decryptService'].forEach(
    (relativePath) => {
      try {
        delete require.cache[require.resolve(relativePath)];
      } catch (error) {
        // ignore cache misses
      }
    }
  );
}

describe('decryptImage controller', () => {
  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    nock.cleanAll();

    process.env.VALIDME_PRIVATE_KEY = SAMPLE_PRIVATE_KEY;
    process.env.API_RATE_LIMIT = '1000';
    delete process.env.API_RATE_WINDOW_MS;

    clearModuleCache();
  });

  afterEach(() => {
    nock.cleanAll();
    jest.restoreAllMocks();
  });

  test('decrypts binary payload and streams decrypted data', async () => {
    const plainBuffer = buildPlainBuffer();
    const encrypted = rsaEncrypt(plainBuffer);

    nock(`https://${HOST_SUCCESS}`).get('/encrypted.bin').reply(200, encrypted, {
      'Content-Type': 'application/octet-stream',
    });

    const { decryptImage } = require('../src/controllers/decryptController');
    const res = createMockResponse();
    const req = { body: { imageURL: `https://${HOST_SUCCESS}/encrypted.bin` } };

    await decryptImage(req, res);

    expect(res.ended).toBe(true);
    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(res.body.equals(plainBuffer)).toBe(true);
  });

  test('decrypts base64 payload from remote source', async () => {
    const plainBuffer = buildPlainBuffer();
    const encrypted = rsaEncrypt(plainBuffer);

    nock(`https://${HOST_BASE64}`)
      .get('/image.txt')
      .reply(200, encrypted.toString('base64'), { 'Content-Type': 'text/plain' });

    const { decryptImage } = require('../src/controllers/decryptController');
    const res = createMockResponse();
    const req = { body: { imageURL: `https://${HOST_BASE64}/image.txt` } };

    await decryptImage(req, res);

    expect(res.ended).toBe(true);
    expect(res.body.equals(plainBuffer)).toBe(true);
  });

  test('rejects missing imageURL field', async () => {
    const { decryptImage } = require('../src/controllers/decryptController');
    const res = createMockResponse();
    const req = { body: {} };

    await expect(decryptImage(req, res)).rejects.toMatchObject({
      code: 'INVALID_PAYLOAD',
    });
  });

  test('rejects non-HTTPS URLs', async () => {
    const { decryptImage } = require('../src/controllers/decryptController');
    const res = createMockResponse();
    const req = { body: { imageURL: 'http://insecure.example.com/asset' } };

    await expect(decryptImage(req, res)).rejects.toMatchObject({
      code: 'INVALID_PAYLOAD',
    });
  });

  test('blocks URLs resolving to private addresses', async () => {
    const { decryptImage } = require('../src/controllers/decryptController');
    const res = createMockResponse();
    const req = { body: { imageURL: 'https://127.0.0.1/file' } };

    await expect(decryptImage(req, res)).rejects.toMatchObject({
      code: 'INVALID_PAYLOAD',
    });
  });

  test('surfaces download failures as structured errors', async () => {
    nock(`https://${HOST_FAILURE}`).get('/broken').reply(502);

    const { decryptImage } = require('../src/controllers/decryptController');
    const res = createMockResponse();
    const req = { body: { imageURL: `https://${HOST_FAILURE}/broken` } };

    await expect(decryptImage(req, res)).rejects.toMatchObject({
      code: 'DOWNLOAD_ERROR',
    });
  });

  test('propagates network failures during download', async () => {
    nock(`https://${HOST_TIMEOUT}`).get('/slow').replyWithError('socket hang up');

    const { decryptImage } = require('../src/controllers/decryptController');
    const res = createMockResponse();
    const req = { body: { imageURL: `https://${HOST_TIMEOUT}/slow` } };

    await expect(decryptImage(req, res)).rejects.toMatchObject({
      code: 'DOWNLOAD_ERROR',
    });
  });

  test('fails gracefully when decrypted data is invalid', async () => {
    const invalidPayload = crypto.randomBytes(300);

    nock(`https://${HOST_INVALID}`)
      .get('/invalid')
      .reply(200, invalidPayload, { 'Content-Type': 'application/octet-stream' });

    const { decryptImage } = require('../src/controllers/decryptController');
    const res = createMockResponse();
    const req = { body: { imageURL: `https://${HOST_INVALID}/invalid` } };

    await expect(decryptImage(req, res)).rejects.toBeInstanceOf(AppError);
  });
});
