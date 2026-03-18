import * as cheerio from 'cheerio';

function getMetaContent($, selector) {
  return String($(selector).attr('content') || '').trim();
}

function resolveUrl(targetUrl, maybeRelativeUrl) {
  try {
    return new URL(maybeRelativeUrl, targetUrl).toString();
  } catch {
    return '';
  }
}

function printLine(label, value) {
  console.log(`${label}: ${value || '(missing)'}`);
}

const targetUrl = process.argv[2];

if (!targetUrl) {
  console.error('Usage: npm run preview:check -- <url>');
  process.exit(1);
}

const requestOptions = {
  redirect: 'follow',
  signal: AbortSignal.timeout(15000),
  headers: {
    'user-agent': 'Pump-Shinsa-Preview-Check/1.0',
  },
};

const pageResponse = await fetch(targetUrl, requestOptions);

const pageHtml = await pageResponse.text();
const $ = cheerio.load(pageHtml);

const ogTitle = getMetaContent($, 'meta[property="og:title"]');
const ogDescription = getMetaContent($, 'meta[property="og:description"]');
const ogImage = getMetaContent($, 'meta[property="og:image"]');
const ogUrl = getMetaContent($, 'meta[property="og:url"]');
const twitterCard = getMetaContent($, 'meta[name="twitter:card"]');
const title = $('title').first().text().trim();

const imageUrl = resolveUrl(targetUrl, ogImage);
let imageStatus = '(not checked)';
let imageType = '(not checked)';

if (imageUrl) {
  try {
    const imageResponse = await fetch(imageUrl, {
      ...requestOptions,
    });
    imageStatus = String(imageResponse.status);
    imageType = String(imageResponse.headers.get('content-type') || '').trim() || '(missing)';
    await imageResponse.arrayBuffer();
  } catch (error) {
    imageStatus = 'fetch failed';
    imageType = error instanceof Error ? error.message : String(error);
  }
}

printLine('page_url', targetUrl);
printLine('page_status', String(pageResponse.status));
printLine('title', title);
printLine('og:title', ogTitle);
printLine('og:description', ogDescription);
printLine('og:url', ogUrl);
printLine('og:image', imageUrl || ogImage);
printLine('twitter:card', twitterCard);
printLine('image_status', imageStatus);
printLine('image_content_type', imageType);

const failures = [];

if (!pageResponse.ok) failures.push(`Page returned ${pageResponse.status}`);
if (!ogTitle) failures.push('Missing og:title');
if (!ogDescription) failures.push('Missing og:description');
if (!ogImage) failures.push('Missing og:image');
if (!twitterCard) failures.push('Missing twitter:card');

if (ogTitle === 'PUMP SHINSA') {
  failures.push('og:title is still the generic app title');
}

if (ogDescription === 'Pump up your socials!') {
  failures.push('og:description is still the generic app description');
}

if (imageUrl.endsWith('/icons/app-icon-1024.png')) {
  failures.push('og:image still points at the generic app icon');
}

if (imageUrl && imageStatus !== '200') {
  failures.push(`Preview image returned ${imageStatus}`);
}

if (imageUrl && !imageType.startsWith('image/')) {
  failures.push(`Preview image content type is ${imageType}`);
}

if (failures.length > 0) {
  console.error('\nPreview check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('\nPreview check passed.');
