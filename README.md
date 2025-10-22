# Ovopay Utility Server

This project exposes utility APIs for OvoPay applications. The current release provides RSA-based decryption utilities for binary images and structured JSON payloads, plus a lightweight health probe endpoint.

## Prerequisites

- Node.js 18 or later
- npm 9+

## Configuration

1. Copy `.env.example` to `.env` and fill in secrets:
   ```bash
   cp .env.example .env
   ```
2. Populate `VALIDME_PRIVATE_KEY` with the PEM that matches the public key used to encrypt assets.
3. Adjust `API_RATE_LIMIT` and `API_RATE_WINDOW_MS` as needed for your deployment.

## Scripts

From the `server` directory:

- `npm install` — install dependencies
- `npm start` — start the HTTP server on the configured port (default 3000)
- `npm test` — run the automated test suite

## API

### `POST /api/decrypt-image`

Request body:

```json
{ "imageURL": "https://domainexample.com/encrypted.jpg" }
```

Behaviour:

1. Validates payload and rejects non-HTTPS or private network targets.
2. Streams the encrypted file, attempting RSA OAEP decryption per 256-byte block (fallback to PKCS#1 v1.5).
3. Responds with decrypted binary data and best-effort content type detection.
4. Returns structured errors with `{ code, message }` on validation, download, or decryption failures.

### `POST /api/decrypt-data`

Request body:

```json
{ "data": "BASE64_ENCRYPTED_STRING" }
```

Behaviour:

1. Validates the encrypted string, expecting base64 text whose RSA blocks are 256 bytes.
2. Decrypts each block with RSA OAEP padding (fallback to PKCS#1 v1.5).
3. Returns JSON containing the decrypted UTF-8 string: `{ "data": "<decrypted-json-string>" }`.
4. Produces structured errors on validation or decryption failures (`INVALID_PAYLOAD`, `INVALID_BASE64`, `INVALID_ENCRYPTED_SIZE`, `DECRYPTION_FAILED`).

### `GET /healthz`

Simple health-check endpoint returning `{ "status": "ok" }`.

## Local Ubuntu Deployment (Docker + nginx)

The backend is designed to run inside Docker on an Ubuntu host, fronted by nginx. The outline below assumes you already have the nginx snippets you shared earlier and want to replace any existing PM2-managed Node services.

### 1. Prepare the host

```bash
sudo apt update
sudo apt install docker.io docker-compose-plugin nginx certbot python3-certbot-nginx
```

Add your user to the Docker group so you can run containers without `sudo` (log out/in afterwards):

```bash
sudo usermod -aG docker $USER
```

### 2. Stop and remove PM2 services

If the old app is still running under PM2, stop and delete it so the port is free:

```bash
pm2 ls          # inspect running processes
pm2 stop all    # stop every PM2 process
pm2 delete all  # remove the definitions
pm2 unstartup   # remove any startup hooks
```

Verify nothing is listening on port 3000 (`sudo lsof -i :3000`) before moving on.

### 3. Build and run the Docker image

From the project root:

```bash
cd server
docker build -t ovopay-utils .
```

Copy `.env.example` to `.env` at the repository root and fill in the secrets if you have not already:

```bash
cp ../.env.example ../.env
# edit ../.env with your values
```

Run the container with the env file and expose it on port 3000 (matching the nginx config):

```bash
docker run \
  --name ovopay-utils \
  --restart unless-stopped \
  --env-file ../.env \
  -p 3000:3000 \
  -d ovopay-utils
```

### 4. Configure nginx

Ensure the nginx blocks include the proxy configuration you supplied. Replace the upstream target with `http://127.0.0.1:3000` (or keep `localhost`) so it forwards traffic to the container:

```nginx
location / {
    proxy_http_version 1.1;
    proxy_cache_bypass $http_upgrade;

    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_pass http://127.0.0.1:3000;
}
```

Reload nginx once the container is running:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 5. SSL certificates (optional)

For `utils.ovopay.digital`, use Certbot as per your existing configuration:

```bash
sudo certbot --nginx -d utils.ovopay.digital
```

Certbot will place the certificates in `/etc/letsencrypt/live/...` and update the `server` block as in your snippet.

### 6. Verify

```bash
curl -I http://localhost:3000/healthz
curl -I https://utils.ovopay.digital/healthz
```

You should receive `200 OK` responses with JSON `{"status":"ok"}`. Rotate the container with `docker restart ovopay-utils` whenever you deploy an update.
