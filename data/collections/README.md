# Community collections

The "From the community" section of Collections (and the Community tab in Big Picture) reads `index.json` in this folder. It is read-only: a collection joins it through a pull request to this repository.

## Submitting a collection

Add an entry to `collections` in `index.json`:

```json
{
  "id": "heist-night",
  "handle": "your-name",
  "displayName": "Your Name",
  "name": "Heist night",
  "description": "One line shown on the page.",
  "coverImage": "https://image.tmdb.org/t/p/w1280/....jpg",
  "items": [
    { "id": "tt0120755", "type": "movie", "name": "Ocean's Eleven", "poster": "https://..." }
  ]
}
```

`id` and `handle` together must be unique. `type` is `movie`, `series` or `manga`; image fields take full `https://` URLs.
