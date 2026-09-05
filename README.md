# MusicBrainz Automation

Docker-based automation for staging MusicBrainz releases from Deezer metadata, with Harmony handling MusicBrainz metadata preparation and browser automation handling post-submission cover art.

The system is designed so that **MusicBrainz release submission remains a manual user action**.

## Workflow

```text
Dashboard
    |
    v
Auto Stage
    |
    v
Harmony metadata
    |
    v
MusicBrainz Release Editor
    |
    v
USER REVIEWS RELEASE
    |
    v
USER MANUALLY SUBMITS RELEASE
    |
    v
MusicBrainz redirects to Harmony
    |
    v
Automation detects release MBID
    |
    v
Artwork retrieved from Harmony
    |
    v
MusicBrainz Add Cover Art
    |
    v
Automation uploads front cover
```

## Components

| Component | Purpose | Port |
|---|---|---:|
| Dashboard | Auto-stage console and automation API | 8088 |
| Harmony | MusicBrainz metadata preparation and artwork source | 8001 |
| Browser | Chromium + Playwright controller | internal |
| VNC | noVNC access to the Chromium desktop | 6080 |

The containers communicate over a Docker bridge network named `mb-automation`.

## Requirements

- Proxmox or another Linux host capable of running Docker
- Docker Engine
- Docker Compose / Portainer
- A GitHub account
- GitHub Container Registry access
- Harmony TIDAL API credentials
- MusicBrainz account
- A persistent directory for application data

The production deployment is intended to be managed through the **Portainer Stack Editor**.

## Configuration

Copy the example configuration:

```bash
cp config/.env.example .env
```

Edit `.env` and set the values for your environment:

```text
HARMONY_BROWSER_URL=http://YOUR_DOCKER_LXC_IP:8001
DASHBOARD_URL=http://dashboard:8080
DASHBOARD_BROWSER_URL=http://YOUR_DOCKER_LXC_IP:8088
MB_USER_AGENT=MBAutomationScript/1.2 (https://github.com/YOUR_USERNAME/musicbrainz-automation)
HARMONY_TIDAL_CLIENT_ID=
HARMONY_TIDAL_CLIENT_SECRET=
```

### URL meanings

`HARMONY_BROWSER_URL` is the URL your normal web browser uses to access Harmony.

`DASHBOARD_URL` is the internal Docker URL used by the browser controller to communicate with the dashboard. Normally this remains `http://dashboard:8080`.

`DASHBOARD_BROWSER_URL` is the URL Chromium uses to open the dashboard.

`MB_USER_AGENT` identifies the automation when making MusicBrainz API requests.

`HARMONY_TIDAL_CLIENT_ID` and `HARMONY_TIDAL_CLIENT_SECRET` are the credentials used by Harmony.

**Never commit `.env` or API credentials to Git.**

## Portainer deployment

Create a new Stack in Portainer using the contents of `docker/portainer-stack.yml`.

Configure the stack environment variables using the values from `.env`.

The stack uses pre-built GitHub Container Registry images, so the deployment host does not need the source repository or local Docker build context.

The production deployment exposes:

```text
Dashboard: http://YOUR_DOCKER_LXC_IP:8088
Harmony:   http://YOUR_DOCKER_LXC_IP:8001
VNC:       http://YOUR_DOCKER_LXC_IP:6080/vnc.html
```

## Persistent data

Application state is stored outside the container images so containers can be recreated without losing state.

### Browser profile

```text
/root/mb-automation-docker/musicbrainz-browser -> /ms-playwright-profile
```

This contains the persistent Chromium profile and must not be committed to Git.

### X11 socket

```text
/root/mb-automation-docker/musicbrainz-browser/x11 -> /tmp/.X11-unix
```

This allows the VNC container to display the Chromium desktop.

### Harmony data

```text
/root/mb-automation-docker/harmony-data -> /data
```

### Dashboard data

```text
/root/mb-automation-docker/dashboard-data -> /data
```

Dashboard import statistics are stored at `/data/import_stats.json`.

## Harmony

Harmony is not copied into this repository. The Harmony image builds from the upstream repository:

```text
https://github.com/kellnerd/harmony
```

The Docker build checks out this pinned upstream commit:

```text
094d904c3cbc15392d8042d8e6924e2478e8669d
```

The automation-specific changes are stored in `harmony/automation.patch` and applied during the Docker build.

The corresponding Harmony version is `v2026.8.30`.

This keeps the repository small while making the Harmony build reproducible.

## Browser automation

The browser image contains Chromium, Playwright, the MusicBrainz browser controller, the cover-art uploader, and the Chromium startup/supervision script.

The persistent Chromium profile is stored outside the image so MusicBrainz login/session state survives container recreation.

The browser controller:

1. Polls the dashboard for completed Harmony release jobs.
2. Claims a job.
3. Retrieves the artwork.
4. Opens the MusicBrainz cover-art page.
5. Uploads the front cover.
6. Submits the cover-art edit.
7. Reports the job result back to the dashboard.

The release itself is never submitted by the browser controller.

## VNC

The VNC container provides browser visibility through noVNC.

Open:

```text
http://YOUR_DOCKER_LXC_IP:6080/vnc.html
```

The VNC container connects to the X11 display created by the browser container.

## Security

Do not commit:

- `.env`
- TIDAL credentials
- MusicBrainz credentials
- Chromium profile data
- Cookies
- Runtime logs
- Persistent application data

The repository `.gitignore` excludes these categories.

If a credential has previously been exposed outside the repository, rotate it before treating the deployment as fully secured.

## Updating

The normal update process is:

```text
Edit source
    |
    v
git commit
    |
    v
git push
    |
    v
GitHub Actions builds images
    |
    v
GHCR receives new :latest images
    |
    v
Portainer pulls updated images
```

After pushing changes to `main`, verify the GitHub Actions workflow completes successfully before updating the production stack.

## Operational behavior

### MusicBrainz release submission is manual

The workflow deliberately stops at the MusicBrainz Release Editor.

Review the release completely and submit it manually.

After MusicBrainz redirects back to Harmony, the automation uses the returned release MBID to continue with cover-art processing.

This separation is intentional: metadata changes are reviewed by a human before the MusicBrainz release is created.

### Front cover

The automated cover-art workflow currently uploads the front cover only.

### Job recovery

Release-completion jobs are persisted by the dashboard. The browser controller claims and processes pending artwork jobs rather than requiring the user to manually enter the MusicBrainz release MBID.

## Troubleshooting

### Check containers

```bash
docker ps
```

### Dashboard logs

```bash
docker logs --tail 100 mb-dashboard
```

### Harmony logs

```bash
docker logs --tail 100 mb-harmony
```

### Browser logs

```bash
docker logs --tail 100 musicbrainz-browser
```

### VNC logs

```bash
docker logs --tail 100 musicbrainz-vnc
```

### Test dashboard

```bash
curl -I http://localhost:8088
```

### Test Harmony

```bash
curl -I http://localhost:8001
```

### Test noVNC

```bash
curl -I http://localhost:6080/vnc.html
```

## Development validation

Before publishing changes, validate the repository:

```bash
git diff --check
```

Build the four images locally:

```bash
docker build -t mb-dashboard:test ./dashboard
docker build -t mb-browser:test ./browser
docker build -t mb-browser-vnc:test ./vnc
docker build -t mb-harmony:test ./harmony
```

The Harmony build also verifies that the automation patch applies cleanly.

## Repository layout

```text
musicbrainz-automation/
├── README.md
├── .gitignore
├── .github/
│   └── workflows/
│       └── build-images.yml
├── dashboard/
│   ├── Dockerfile
│   └── auto_stage_dashboard.py
├── browser/
│   ├── Dockerfile
│   ├── browser-controller.js
│   ├── upload-cover-art.js
│   ├── start-browser.sh
│   ├── package.json
│   └── package-lock.json
├── harmony/
│   ├── Dockerfile
│   ├── automation.patch
│   └── VERSION
├── vnc/
│   ├── Dockerfile
│   └── start-vnc.sh
├── docker/
│   └── portainer-stack.yml
└── config/
    └── .env.example
```
