# Demo photos

The seed (`pnpm dev:seed` or `pnpm qa:seed`) gives each demo pet up to 5 photos from this folder.

## Naming rule

| File                       | Meaning                             |
| -------------------------- | ----------------------------------- |
| `max.jpg`                  | Max's first (main) photo            |
| `max-2.webp` … `max-5.png` | Max's further photos, in this order |

- **Pet names:** the pet's name in lowercase. The whole name must match: `maxi-2.jpg` belongs to Maxi, never to Max.
- **Formats:** JPEG (`.jpg`, `.jpeg`), PNG or WebP, at most 5 MB each. The server checks the actual content, as for any upload.
- **Same position, several formats:** if one position exists in more than one format, the first in this order is used: `.jpg`, `.jpeg`, `.png`, `.webp`.
- **No file, no photo:** a pet without matching files gets no photo.
- **Other names are ignored:** files that don't follow the rule (like the downloaded `cat.4001.jpg`) are ignored by the seed.

## Preparing downloaded images

You don't rename files by hand. [mapping.json](mapping.json) lists which downloaded file becomes which pet's photo, in order (the first is the main photo):

```json
"max": ["dog.4048.jpg", "dog.4161.jpg"]
```

```sh
pnpm demo:images --dry-run   # show what would be copied
pnpm demo:images             # copy, e.g. dog.4048.jpg → max.jpg, dog.4161.jpg → max-2.jpg
```

- **Originals are kept:** the script copies; it doesn't rename.
- **It never overwrites:** a target that already exists with the same content is skipped, so it's safe to rerun. One with different content is an error.
- **Everything is checked first:** pet names, at most 5 photos per pet, file type and size, and that `cat.*` images go to cats and `dog.*` images to dogs. If anything is wrong, nothing is copied.

**To change a photo:** edit `mapping.json`, delete the old prepared file (e.g. `max-2.jpg`), and run `pnpm demo:images` again.

## Seeding and reruns

The seed uploads all of a pet's photos in one request, through the normal authenticated API (`POST /api/pets/:id/images`). It only does so for pets that have **no** photos yet, so rerunning never duplicates or replaces photos.

**To refresh a demo pet's photos:** remove its photos in the edit form (as its owner, e.g. `ana@demo.example.com`), then seed again. To refresh all of them in QA, run `pnpm qa:reset --yes` (deletes all QA data) and `pnpm qa:seed`.

## Before adding your own photos

- Use your own photos or ones you're allowed to reuse, and check the licence before committing them.
- Remove the metadata: the app stores photos as uploaded, and phone photos often contain the GPS location where they were taken.
- Keep them small (about 1200 px wide, under 300 KB).
