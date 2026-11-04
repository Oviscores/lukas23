#!/usr/bin/env node
/**
 * generate-sitemap.js — Zone US
 * Usage : node generate-sitemap.js
 * Génère sitemap.xml à la racine du repo depuis Sanity.
 */

const https = require('https')
const fs = require('fs')
const path = require('path')

const SANITY_PROJECT = '3p2qmw8s'
const SANITY_DATASET = 'production'
const BASE_URL = 'https://zoneus.fr'
const TODAY = new Date().toISOString().slice(0, 10)

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch(e) { reject(new Error('JSON parse error: ' + data.slice(0, 200))) }
      })
    }).on('error', reject)
  })
}

function slugify(title) {
  return title
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function main() {
  const query = encodeURIComponent(
    `*[_type == "article"] | order(_createdAt desc) { _id, title, slug, _createdAt }`
  )
  const url = `https://${SANITY_PROJECT}.api.sanity.io/v2021-10-21/data/query/${SANITY_DATASET}?query=${query}`

  console.log('Fetching articles from Sanity…')
  const data = await fetch(url)
  const articles = data.result || []
  console.log(`${articles.length} articles trouvés`)

  // Pages fixes
  const staticPages = [
    { loc: `${BASE_URL}/`,             lastmod: TODAY,        changefreq: 'daily',  priority: '1.0' },
    { loc: `${BASE_URL}/?page=nhl`,    lastmod: TODAY,        changefreq: 'daily',  priority: '0.8' },
    { loc: `${BASE_URL}/?page=nfl`,    lastmod: TODAY,        changefreq: 'daily',  priority: '0.8' },
    { loc: `${BASE_URL}/?page=nba`,    lastmod: TODAY,        changefreq: 'daily',  priority: '0.8' },
    { loc: `${BASE_URL}/?page=mlb`,    lastmod: TODAY,        changefreq: 'daily',  priority: '0.8' },
  ]

  // Articles
  const articlePages = articles.map(a => {
    let slug = ''
    if (a.slug && typeof a.slug === 'object') slug = a.slug.current || ''
    else if (typeof a.slug === 'string') slug = a.slug
    if (!slug && a.title) slug = slugify(a.title)
    const lastmod = (a._createdAt || TODAY).slice(0, 10)
    return { loc: `${BASE_URL}/?article=${slug}`, lastmod, changefreq: 'weekly', priority: '0.9' }
  }).filter(p => p.loc.includes('=') && !p.loc.endsWith('='))

  const allPages = [...staticPages, ...articlePages]

  const urls = allPages.map(p => `  <url>
    <loc>${p.loc}</loc>
    <lastmod>${p.lastmod}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`

  const outPath = path.join(__dirname, '..', '..', '..', '..', '..', 'home', 'claude', 'oviscores', 'lukas23', 'sitemap.xml')
  // Si lancé depuis la racine du repo, écrire à la racine
  const repoRoot = process.argv[2] || path.join(process.cwd())
  const dest = path.join(repoRoot, 'sitemap.xml')

  fs.writeFileSync(dest, xml, 'utf8')
  console.log(`✓ sitemap.xml écrit → ${dest} (${allPages.length} URLs)`)
}

main().catch(err => { console.error('Erreur:', err.message); process.exit(1) })
