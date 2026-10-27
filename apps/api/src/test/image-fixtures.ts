import { crc32 } from 'node:zlib';
import sharp from 'sharp';

/**
 * Real, tiny images generated in memory, so upload tests need no fixture
 * files and the decoder sees valid data.
 */
export const createTestImage = (
  format: 'png' | 'jpeg' | 'webp',
  { width = 8, height = 6, alpha = false } = {},
): Promise<Buffer> =>
  sharp({
    create: {
      width,
      height,
      channels: alpha ? 4 : 3,
      background: alpha
        ? { r: 255, g: 0, b: 0, alpha: 0 }
        : { r: 40, g: 160, b: 90 },
    },
  })
    [format]()
    .toBuffer();

/** Marker text embedded in the metadata fixtures; must never be served. */
export const METADATA_MARKER = 'private-metadata-marker';

/**
 * A 40×20 JPEG, red on the left half and blue on the right, as a phone would
 * store it: EXIF orientation 6 ("rotate 90° clockwise to display"), GPS
 * coordinates, camera and artist tags, and an XMP packet.
 */
export const createPhoneJpeg = async (): Promise<Buffer> => {
  const width = 40;
  const height = 20;
  const pixels = Buffer.alloc(width * height * 3);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3;
      pixels[offset + (x < width / 2 ? 0 : 2)] = 255;
    }
  }

  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .withMetadata({ orientation: 6 })
    .withExif({
      IFD0: { Make: 'PhoneMaker', Model: 'Phone 1', Artist: METADATA_MARKER },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '44/1 49/1 0/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '20/1 27/1 0/1',
      },
    })
    .withXmp(
      `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>${METADATA_MARKER}</dc:creator></rdf:Description></rdf:RDF></x:xmpmeta>`,
    )
    .jpeg({ quality: 95 })
    .toBuffer();
};

/** True if the buffer contains an EXIF GPS IFD pointer tag (0x8825). */
export const hasGpsTag = (data: Buffer): boolean =>
  data.includes(Buffer.from([0x88, 0x25])) ||
  data.includes(Buffer.from([0x25, 0x88]));

/**
 * A valid 1×1 PNG whose header claims `width`×`height`: a few bytes that
 * would decode to a huge bitmap (a "decompression bomb").
 */
export const createPngClaimingSize = async (
  width: number,
  height: number,
): Promise<Buffer> => {
  const png = Buffer.from(
    await createTestImage('png', { width: 1, height: 1 }),
  );

  // IHDR data starts at byte 16 (signature 8, length 4, type 4).
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  png.writeUInt32BE(crc32(png.subarray(12, 29)), 29);

  return png;
};

/** A two-frame animated WebP. */
export const createAnimatedWebp = async (): Promise<Buffer> => {
  const frame = (background: string) =>
    sharp({ create: { width: 4, height: 4, channels: 3, background } })
      .png()
      .toBuffer();

  return sharp([await frame('#ff0000'), await frame('#0000ff')], {
    join: { animated: true },
  })
    .webp()
    .toBuffer();
};
