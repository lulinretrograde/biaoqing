# biaoqing

(self)host(ed/able) picker for chinese reaction images. runs anywhere docker runs.

initial image set seeded from [atanet90/expression-pack](https://github.com/atanet90/expression-pack) (CC0).
local additions and scraped batches drift it from upstream over time.

## run

```
git clone https://github.com/lulinretrograde/biaoqing.git
cd biaoqing
tools/sync.sh                  # pull upstream images into site/img/
docker compose up -d --build
```

open `http://localhost:8080` or replace localhost with your host's IP/hostname.

## add your own images

```
tools/add.sh ~/Downloads/whatever.png
docker compose restart web
```

local ids start at 10000 so they don't collide with upstream additions.

## pull more from fabiaoqing

```
pip install -r tools/requirements.txt
tools/scrape.py --pages 30
```

dedupes by sha256 against existing files. `--start N` to resume from a later page.

## https

clipboard image copy requires https or localhost. over plain http the url is copied instead.

reverse proxy with your preferred tool (caddy, traefik, nginx proxy manager) or:

```
sudo tailscale serve --bg --https=443 http://localhost:8080
```

## updating

```
git pull
tools/sync.sh                  # if upstream gained images
docker compose up -d --build
```

bump `VERSION` in `site/sw.js` when shipping breaking asset changes. forces PWA clients to drop cached shell.

## layout

```
site/             ui (html, js, sw, manifest, icon)
site/img/         images       (gitignored)
site/meta.json    id manifest  (gitignored, generated)
tools/            sync, add, regen-meta, scrape
nginx/            server config
```
