// ...existing code...
import 'dotenv/config';
import sanityClient from '@sanity/client';

const client = sanityClient({
  projectId: process.env.SANITY_PROJECT_ID,
  dataset: process.env.SANITY_DATASET,
  apiVersion: '2023-10-01',
  useCdn: true,
  token: process.env.SANITY_READ_TOKEN
});

(async () => {
  const articles = await client.fetch(`*[_type=="post"] | order(publishedAt desc){title, "slug": slug.current}`);
  console.log('Fetched articles:', articles.length);
  // TODO: update publications.html and index.html here
})();