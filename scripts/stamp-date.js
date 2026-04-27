/**
 * Prebuild script: stamps today's date into summary.json
 * Runs automatically before every build via the "prebuild" npm hook.
 */
const fs = require('fs')
const path = require('path')

const summaryPath = path.join(__dirname, '..', 'public', 'summary.json')
const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'))
const today = new Date().toISOString().split('T')[0]

summary.scrape_date = today
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n')
console.log('[stamp-date] Updated scrape_date to ' + today)
