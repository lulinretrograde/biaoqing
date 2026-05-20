# biaoqing

personal picker for chinese reaction images. runs on a macbook, reachable over tailscale.

initial set seeded from [atanet90/expression-pack](https://github.com/atanet90/expression-pack) (CC0).
local additions and scraped batches drift it from upstream over time.

## run

```
git clone git@github.com:<you>/biaoqing.git
cd biaoqing
tools/sync.sh                  # pull upstream images into site/img/
docker compose up -d --build
```

then from any tailnet device: `http://macbook:8080` (or the 100.x.y.z address).

## add your own

```
tools/add.sh ~/Downloads/whatever.png
docker compose restart web     # picks up volume mount
```

local ids start at 10000 so they don't collide with upstream additions.

## pull more from fabiaoqing

```
pip install -r tools/requirements.txt
tools/scrape.py --pages 30
```

dedupes by sha256 against existing files. `--start N` to resume from a later page.

## restrict to tailnet only

```
tailscale ip -4
# edit docker-compose.yml ports → "100.x.y.z:8080:80"
docker compose up -d
```

## https (needed for image-paste on phones)

clipboard image writes require https or localhost. over plain http you get the url instead.

```
sudo tailscale serve --bg --https=443 http://localhost:8080
```

site moves to `https://macbook.<tailnet>.ts.net`.

## updating

```
git pull
tools/sync.sh                  # if upstream gained images
docker compose up -d --build
```

bump the `VERSION` constant in `site/sw.js` when you ship breaking asset changes — forces PWA clients to drop cached shell.

## layout

```
site/             ui (html, js, sw, manifest, icon)
site/img/         images       (gitignored)
site/meta.json   id manifest  (gitignored — generated)
tools/            sync, add, regen-meta, scrape
nginx/            server config
```
