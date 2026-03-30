'use client'
import { useState, useEffect, useMemo } from 'react'

const PROGRAM_LABELS = {
  TRT: 'TRT',
  HRT: 'HRT',
  'GLP/Other': 'GLP/Other',
}

const PLAN_OPTIONS = ['4wk', '8wk', '12wk', '48wk']

function decodePharmacyData(raw) {
  if (Array.isArray(raw)) return raw
  const { keys, lookups, groups } = raw
  const records = []
  const stateKey = keys.indexOf('state')
  const otherKeys = keys.filter((_, i) => i !== stateKey)
  for (const g of groups) {
    const stateIndices = g[g.length - 1]
    const vals = g.slice(0, g.length - 1)
    for (const si of stateIndices) {
      const record = { state: lookups.state[si] }
      for (let i = 0; i < vals.length; i++) {
        const k = otherKeys[i]
        record[k] = lookups[k] ? lookups[k][vals[i]] : vals[i]
      }
      records.push(record)
    }
  }
  return records
}

export default function Dashboard() {
  const [data, setData] = useState([])
  // routing variations computed from data
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [changelog, setChangelog] = useState(null)

    const [sexFilter, setSexFilter] = useState('')
  const [programFilter, setProgramFilter] = useState('')
  const [medFilter, setMedFilter] = useState('')
  const [pharmacyFilter, setPharmacyFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [filterPlan, setFilterPlan] = useState('')

  const [activeTab, setActiveTab] = useState('catalog')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  useEffect(() => {
    Promise.allSettled([
      fetch('/pharmacy_data.json').then(r => r.json()),
      Promise.resolve([]),
      fetch('/changelog.json').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/summary.json').then(r => r.json()),
    ]).then(([dRes, dispRes, sRes]) => {
      if (dRes.status === 'fulfilled') setData(decodePharmacyData(dRes.value))
      // routing variations computed below
      if (clRes && clRes.status === 'fulfilled' && clRes.value) setChangelog(clRes.value)
      if (sRes.status === 'fulfilled') setSummary(sRes.value)
      setLoading(false)
    }).catch(e => {
      setLoadError(e.message)
      setLoading(false)
    })
  }, [])

  const filtered = useMemo(() => {
    let f = data
    if (sexFilter) f = f.filter(r => r.sex === sexFilter)
    if (programFilter) f = f.filter(r => r.program === programFilter)
    if (medFilter) f = f.filter(r => r.medication === medFilter)
    if (pharmacyFilter) f = f.filter(r => r.pharmacy === pharmacyFilter)
    if (filterPlan) f = f.filter(r => r.payment_plan === filterPlan)
    if (search) {
      const s = search.toLowerCase()
      f = f.filter(r =>
        (r.drug || '').toLowerCase().includes(s) ||
        (r.medication || '').toLowerCase().includes(s) ||
        (r.med_code || '').toLowerCase().includes(s) ||
        (r.dosage || '').toLowerCase().includes(s)
      )
    }
    // Deduplicate: without state column, collapse identical rows
    const seen = new Set()
    const unique = []
    for (const r of f) {
      const key = [r.sex, r.program, r.medication, r.drug, r.dosage, r.frequency, r.pharmacy, r.med_code, r.supply_code, r.payment_plan].join('|')
      if (!seen.has(key)) { seen.add(key); unique.push(r) }
    }
    return unique
  }, [data, sexFilter, programFilter, medFilter, pharmacyFilter, search, filterPlan])

  const pagedData = useMemo(() => {
    return filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  }, [filtered, page])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  const filterOptions = useMemo(() => {
    let f = data
    const programs = sorted(new Set(f.map(r => r.program)))
    if (sexFilter) f = f.filter(r => r.sex === sexFilter)
    if (programFilter) f = f.filter(r => r.program === programFilter)
    const meds = sorted(new Set(f.map(r => r.medication)))
    const pharmacies = sorted(new Set(f.map(r => r.pharmacy).filter(Boolean)))
    return { programs, meds, pharmacies }
  }, [data, sexFilter, programFilter])

  const searchSuggestions = useMemo(() => {
    if (!search || search.length < 2) return []
    const s = search.toLowerCase()
    const seen = new Set()
    const results = []
    for (const r of data) {
      for (const val of [r.medication, r.drug, r.med_code, r.dosage]) {
        if (val && val.toLowerCase().includes(s) && !seen.has(val)) {
          seen.add(val)
          results.push(val)
          if (results.length >= 8) return results
        }
      }
    }
    return results
  }, [data, search])

  const formularyCompare = useMemo(() => {
    if (!data.length) return []
    const medMap = {}
    for (const r of data) {
      const key = r.medication + '|' + r.drug + '|' + r.dosage
      if (!medMap[key]) medMap[key] = { medication: r.medication, drug: r.drug, dosage: r.dosage, frequency: r.frequency, pharmacies: {} }
      medMap[key].pharmacies[r.pharmacy] = true
    }
    const allPharms = Array.from(new Set(data.map(function(r) { return r.pharmacy }).filter(Boolean))).sort()
    return { meds: Object.values(medMap).sort(function(a,b) { return a.medication.localeCompare(b.medication) }), pharmacies: allPharms }
  }, [data])

  const pharmacyStats = useMemo(() => {
    if (!data.length) return []
    const stats = {}
    for (const r of data) {
      const p = r.pharmacy
      if (!p) continue
      if (!stats[p]) stats[p] = { name: p, meds: new Set(), programs: new Set(), plans: new Set(), records: 0, states: new Set() }
      stats[p].meds.add(r.medication)
      stats[p].programs.add(r.program)
      stats[p].plans.add(r.payment_plan)
      stats[p].states.add(r.state)
      stats[p].records++
    }
    return Object.values(stats).map(function(s) {
      return { name: s.name, meds: s.meds.size, programs: Array.from(s.programs).sort(), plans: Array.from(s.plans).filter(Boolean).sort(), records: s.records, states: s.states.size }
    }).sort(function(a, b) { return b.records - a.records })
  }, [data])

  const routingVariations = useMemo(() => {
    if (!data.length) return []
    const combos = {}
    for (const r of data) {
      const key = [r.medication, r.drug, r.dosage, r.frequency, r.sex, r.payment_plan].join('|')
      if (!combos[key]) combos[key] = { medication: r.medication, drug: r.drug, dosage: r.dosage, frequency: r.frequency, sex: r.sex, payment_plan: r.payment_plan, byState: {} }
      const stPharms = combos[key].byState[r.state]
      if (!stPharms) combos[key].byState[r.state] = [r.pharmacy]
      else if (!stPharms.includes(r.pharmacy)) stPharms.push(r.pharmacy)
    }
    const variations = []
    for (const c of Object.values(combos)) {
      const pharmSets = {}
      for (const [st, pharms] of Object.entries(c.byState)) {
        const key = pharms.slice().sort().join(',')
        if (!pharmSets[key]) pharmSets[key] = []
        pharmSets[key].push(st)
      }
      if (Object.keys(pharmSets).length > 1) {
        variations.push({
          medication: c.medication, drug: c.drug, dosage: c.dosage,
          frequency: c.frequency, sex: c.sex, payment_plan: c.payment_plan,
          routes: Object.entries(pharmSets).map(function(e) { return { pharmacies: e[0], states: e[1].sort(), count: e[1].length } })
        })
      }
    }
    let v = variations
    if (search) {
      const s = search.toLowerCase()
      v = v.filter(function(r) { return r.drug.toLowerCase().includes(s) || r.medication.toLowerCase().includes(s) || r.dosage.toLowerCase().includes(s) })
    }
    return v
  }, [data, search])

  function resetFilters() {
    setSexFilter('')
    setProgramFilter('')
    setMedFilter('')
    setPharmacyFilter('')
    setFilterPlan('')
    setSearch('')
    setPage(0)
  }

  function exportCSV() {
    const headers = ['Sex','Program','Medication','Drug','Dosage','Freq','Pharmacy','Med Code','Supply Code','Plan']
    const rows = filtered.map(r => [r.sex, r.program, r.medication, r.drug, r.dosage, r.frequency, r.pharmacy, r.med_code, r.supply_code, r.payment_plan].map(v => '"' + (v || '').replace(/"/g, '""') + '"').join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'fountain_pharmacy_catalog.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner} />
        <p style={styles.loadingText}>Loading pharmacy data...</p>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div>
            <h1 style={styles.title}>Fountain Pharmacy Dashboard</h1>
            <p style={styles.subtitle}>
              Medication catalog, pharmacy routing, and state-by-state variation analysis
            </p>
          </div>
          <div style={styles.headerMeta}>
            <span style={styles.badge}>{summary?.scrape_date}</span>
            <span style={styles.badgeGreen}>{data.length.toLocaleString()} records</span>
            <span style={styles.badgeAmber}>{routingVariations.length} variations</span>
          </div>
        </div>
      </header>

      <section style={styles.infoSection}>
        <h2 style={styles.infoTitle}>How This Dashboard Works</h2>
        <div style={styles.infoGrid}>
          <div style={styles.infoCard}>
            <div style={styles.infoIcon}>[1]</div>
            <h3 style={styles.infoCardTitle}>Medication Catalog</h3>
            <p style={styles.infoCardText}>
              Browse every medication, dosage, and pharmacy combination available in the Fountain EHR portal.
              Filter by state, sex, program, medication, or pharmacy. Each row shows the drug name, dosage,
              frequency, dispensing pharmacy, med code, supply code, and payment plan.
            </p>
          </div>
          <div style={styles.infoCard}>
            <div style={styles.infoIcon}>[2]</div>
            <h3 style={styles.infoCardTitle}>Routing Variations</h3>
            <p style={styles.infoCardText}>
              Identifies medications where the pharmacy, med code, or supply code differs across states
              for the same drug + dosage + plan. This helps catch inconsistencies in routing, billing codes,
              or pharmacy assignments that could affect patient care or billing accuracy.
            </p>
          </div>
          <div style={styles.infoCard}>
            <div style={styles.infoIcon}>[3]</div>
            <h3 style={styles.infoCardTitle}>Filters &amp; Search</h3>
            <p style={styles.infoCardText}>
              Use the dropdowns to narrow by state, sex, program type, specific medication, or pharmacy.
              The search box does a free-text search across drug names, medication names, med codes,
              and dosages. All filters combine (AND logic). Click &ldquo;Reset All&rdquo; to clear.
            </p>
          </div>
        </div>
      </section>

      <section style={styles.statsRow}>
        <StatCard label="States" value={summary?.states?.length || 0} />
        <StatCard label="Programs" value={summary?.programs?.length || 0} />
        <StatCard label="Medications" value={summary?.medications?.length || 0} />
        <StatCard label="Pharmacies" value={summary?.pharmacies?.length || 0} />
        <StatCard label="Variations" value={routingVariations.length} alert />
      </section>

      <div style={styles.tabRow}>
        <button
          style={activeTab === 'catalog' ? styles.tabActive : styles.tab}
          onClick={() => { setActiveTab('catalog'); setPage(0) }}
        >
          Medication Catalog
        </button>
        <button
          style={activeTab === 'variations' ? styles.tabActive : styles.tab}
          onClick={() => { setActiveTab('variations'); setPage(0) }}
        >
          Routing Variations ({routingVariations.length})
        </button>
        <button
          style={activeTab === 'summary' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('summary')}
        >
          Summary
        </button>
        <button
          style={activeTab === 'formulary' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('formulary')}
        >
          Formulary
        </button>
        <button
          style={activeTab === 'changelog' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('changelog')}
        >
          Change Log
        </button>
      </div>

      <div style={styles.filterBar}>
        <div style={{ position: "relative", flex: 1 }}>
          <input
            type="text"
            placeholder="Search drugs, meds, codes, dosages..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); setShowSuggestions(true) }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            style={styles.searchInput}
          />
          {showSuggestions && searchSuggestions.length > 0 && (
            <div style={styles.suggestBox}>
              {searchSuggestions.map((s, i) => (
                <div key={i} style={styles.suggestItem} onMouseDown={() => { setSearch(s); setShowSuggestions(false); setPage(0) }}>{s}</div>
              ))}
            </div>
          )}
        </div>
        
        <select value={sexFilter} onChange={e => { setSexFilter(e.target.value); setPage(0) }} style={styles.select}>
          <option value="">All Sexes</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
        {activeTab === 'catalog' && (
          <>
            <select value={programFilter} onChange={e => { setProgramFilter(e.target.value); setPage(0) }} style={styles.select}>
              <option value="">All Programs</option>
              {(filterOptions.programs || []).map(p => <option key={p} value={p}>{PROGRAM_LABELS[p] || p}</option>)}
            </select>
            <select value={medFilter} onChange={e => { setMedFilter(e.target.value); setPage(0) }} style={styles.select}>
              <option value="">All Medications</option>
              {(filterOptions.meds || []).map(m => <option key={m}>{m}</option>)}
            </select>
            <select value={pharmacyFilter} onChange={e => { setPharmacyFilter(e.target.value); setPage(0) }} style={styles.select}>
              <option value="">All Pharmacies</option>
              {(filterOptions.pharmacies || []).map(p => <option key={p}>{p}</option>)}
            </select>
          <select style={styles.filterSelect} value={filterPlan} onChange={e => { setFilterPlan(e.target.value); setPage(0) }}>
            <option value="">All Plans</option>
            {PLAN_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          </>
        )}
        <button onClick={resetFilters} style={styles.resetBtn}>Reset All</button>
          <button onClick={exportCSV} style={styles.exportBtn}>Export CSV</button>
      </div>

      {activeTab === 'catalog' && (
        <div style={styles.tableWrap}>
          <div style={styles.resultCount}>{filtered.length.toLocaleString()} results (page {page + 1}/{totalPages || 1})</div>
          <table style={styles.table}>
            <thead>
              <tr>
                {['Sex','Program','Medication','Drug','Dosage','Freq','Pharmacy','Med Code','Supply Code','Plan'].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedData.map((r, i) => (
                <tr key={i} style={i % 2 ? styles.rowAlt : styles.row}>
                                    <td style={styles.td}>{r.sex}</td>
                  <td style={styles.td}>{PROGRAM_LABELS[r.program] || r.program}</td>
                  <td style={styles.td}>{r.medication}</td>
                  <td style={styles.td}>{r.drug}</td>
                  <td style={styles.td}>{r.dosage}</td>
                  <td style={styles.td}>{r.frequency}</td>
                  <td style={styles.td}>{r.pharmacy}</td>
                  <td style={{...styles.td, fontFamily: 'monospace'}}>{r.med_code}</td>
                  <td style={{...styles.td, fontFamily: 'monospace'}}>{r.supply_code}</td>
                  <td style={styles.td}>{r.payment_plan}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div style={styles.pagination}>
              <button style={styles.pageBtn} disabled={page === 0} onClick={() => setPage(0)}>&laquo; First</button>
              <button style={styles.pageBtn} disabled={page === 0} onClick={() => setPage(p => p - 1)}>&lsaquo; Prev</button>
              <span style={styles.pageInfo}>Page {page + 1} of {totalPages}</span>
              <button style={styles.pageBtn} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next &rsaquo;</button>
              <button style={styles.pageBtn} disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>Last &raquo;</button>
            </div>
          )}
        </div>
      )}

        {activeTab === 'variations' && (
          <div style={styles.tableWrap}>
            <div style={styles.resultCount}>{routingVariations.length} routing variation{routingVariations.length !== 1 ? "s" : ""} found</div>
            {routingVariations.length === 0 && <p style={{ color: "#94a3b8", padding: 16 }}>All pharmacy assignments are consistent across states. No medications are routed differently by state.</p>}
            {routingVariations.map((v, i) => (
              <div key={i} style={{ background: "#1e293b", borderRadius: 12, padding: 20, marginBottom: 16, border: "1px solid #334155" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ color: "#f1f5f9", fontWeight: 600, fontSize: 16 }}>{v.medication}</span>
                  <span style={{ color: "#94a3b8", fontSize: 13 }}>{v.drug} | {v.dosage} | {v.frequency} | {v.sex} | {v.payment_plan || "no plan"}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {v.routes.map((route, j) => (
                    <div key={j} style={{ background: "#0f172a", borderRadius: 8, padding: 14, border: "1px solid #1e293b" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ background: j === 0 ? "#166534" : "#92400e", color: "#fff", padding: "2px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600 }}>{route.pharmacies}</span>
                        <span style={{ color: "#94a3b8", fontSize: 13 }}>{route.count} state{route.count !== 1 ? "s" : ""}</span>
                      </div>
                      <div style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.5 }}>{route.states.join(", ")}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'formulary' && (
          <div style={styles.tableWrap}>
            <div style={styles.resultCount}>{formularyCompare.meds.length} unique medication/dosage combinations</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Medication</th>
                    <th style={styles.th}>Drug</th>
                    <th style={styles.th}>Dosage</th>
                    <th style={styles.th}>Freq</th>
                    {formularyCompare.pharmacies.map(p => <th key={p} style={styles.th}>{p}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {formularyCompare.meds.map((m, i) => (
                    <tr key={i} style={i % 2 === 0 ? styles.rowEven : styles.rowOdd}>
                      <td style={styles.td}>{m.medication}</td>
                      <td style={styles.td}>{m.drug}</td>
                      <td style={styles.td}>{m.dosage}</td>
                      <td style={styles.td}>{m.frequency}</td>
                      {formularyCompare.pharmacies.map(p => (
                        <td key={p} style={{ ...styles.td, textAlign: "center", fontSize: 16 }}>
                          {m.pharmacies[p] ? <span style={{ color: "#22c55e" }}>Yes</span> : <span style={{ color: "#475569" }}>&mdash;</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'changelog' && (
          <div style={styles.tableWrap}>
            <div style={styles.resultCount}>Formulary Change Log</div>
            {!changelog ? (
              <div style={{ padding: 32, textAlign: "center" }}>
                <p style={{ color: "#94a3b8", fontSize: 15, marginBottom: 8 }}>No previous snapshots available yet.</p>
                <p style={{ color: "#64748b", fontSize: 13 }}>After the next EHR scrape, changes will be tracked automatically: new medications added, medications removed, pharmacy routing changes, and dosage updates.</p>
              </div>
            ) : (
              <div>
                {changelog.entries.map((entry, i) => (
                  <div key={i} style={{ background: "#1e293b", borderRadius: 10, padding: 16, marginBottom: 12, border: "1px solid #334155" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ color: "#f1f5f9", fontWeight: 600 }}>{entry.date}</span>
                      <span style={{ color: "#94a3b8", fontSize: 13 }}>{entry.summary}</span>
                    </div>
                    {entry.changes.map((c, j) => (
                      <div key={j} style={{ padding: "4px 0", borderTop: "1px solid #0f172a", display: "flex", gap: 10, alignItems: "center" }}>
                        <span style={{ background: c.type === "added" ? "#166534" : c.type === "removed" ? "#991b1b" : "#92400e", color: "#fff", padding: "1px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, minWidth: 60, textAlign: "center" }}>{c.type}</span>
                        <span style={{ color: "#e2e8f0", fontSize: 13 }}>{c.description}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      {activeTab === 'summary' && summary && (
        <div style={styles.summaryWrap}>
          <div style={styles.summarySection}>
            <h3 style={styles.summaryTitle}>States ({summary.states?.length})</h3>
            <div style={styles.tagWrap}>
              {(summary.states || []).map(s => <span key={s} style={styles.tag}>{s}</span>)}
            </div>
          </div>
          <div style={styles.summarySection}>
            <h3 style={styles.summaryTitle}>Programs ({summary.programs?.length})</h3>
            <div style={styles.tagWrap}>
              {(summary.programs || []).map(p => <span key={p} style={styles.tagBlue}>{PROGRAM_LABELS[p] || p}</span>)}
            </div>
          </div>
          <div style={styles.summarySection}>
            <h3 style={styles.summaryTitle}>Medications ({summary.medications?.length})</h3>
            <div style={styles.tagWrap}>
              {(summary.medications || []).map(m => <span key={m} style={styles.tagGreen}>{m}</span>)}
            </div>
          </div>
          <div style={styles.summarySection}>
            <h3 style={styles.summaryTitle}>Pharmacies ({summary.pharmacies?.length})</h3>
            <div style={styles.tagWrap}>
              {(summary.pharmacies || []).map(p => <span key={p} style={styles.tagAmber}>{p}</span>)}
            </div>
          </div>
          <div style={{ marginTop: 24 }}>
            <h3 style={styles.summaryTitle}>Pharmacy Details</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
              {pharmacyStats.map(p => (
                <div key={p.name} style={{ background: "#0f172a", borderRadius: 10, padding: 16, border: "1px solid #1e293b" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9", marginBottom: 10 }}>{p.name}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                    <div style={{ color: "#94a3b8", fontSize: 13 }}>Medications: <strong style={{ color: "#e2e8f0" }}>{p.meds}</strong></div>
                    <div style={{ color: "#94a3b8", fontSize: 13 }}>States: <strong style={{ color: "#e2e8f0" }}>{p.states}</strong></div>
                    <div style={{ color: "#94a3b8", fontSize: 13 }}>Records: <strong style={{ color: "#e2e8f0" }}>{p.records.toLocaleString()}</strong></div>
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ color: "#94a3b8", fontSize: 12 }}>Programs: </span>
                    {p.programs.map(pr => <span key={pr} style={styles.tagBlue}>{pr}</span>)}
                  </div>
                  <div>
                    <span style={{ color: "#94a3b8", fontSize: 12 }}>Plans: </span>
                    {p.plans.map(pl => <span key={pl} style={styles.tag}>{pl}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <footer style={styles.footer}>
        <p>Fountain Pharmacy Dashboard Â· Data scraped from EHR portal Â· {summary?.scrape_date}</p>
      </footer>
    </div>
  )
}

function StatCard({ label, value, alert }) {
  return (
    <div style={{...styles.statCard, ...(alert ? styles.statCardAlert : {})}}>
      <div style={styles.statValue}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  )
}

function sorted(s) {
  return [...s].sort((a, b) => String(a).localeCompare(String(b)))
}

const styles = {
  container: { minHeight: '100vh', background: '#0f172a', color: '#e2e8f0', fontFamily: "'Inter', -apple-system, sans-serif" },
  loadingContainer: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f172a' },
  spinner: { width: 48, height: 48, border: '4px solid #1e293b', borderTop: '4px solid #38bdf8', borderRadius: '50%', animation: 'spin 1s linear infinite' },
  loadingText: { marginTop: 16, color: '#94a3b8', fontSize: 16 },
  header: { background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', borderBottom: '1px solid #1e293b', padding: '24px 0' },
  headerInner: { maxWidth: 1400, margin: '0 auto', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 },
  title: { fontSize: 28, fontWeight: 700, color: '#f1f5f9', margin: 0 },
  subtitle: { fontSize: 14, color: '#94a3b8', marginTop: 4 },
  headerMeta: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  badge: { background: '#1e293b', color: '#94a3b8', padding: '4px 12px', borderRadius: 6, fontSize: 13 },
  badgeGreen: { background: '#064e3b', color: '#6ee7b7', padding: '4px 12px', borderRadius: 6, fontSize: 13 },
  badgeAmber: { background: '#78350f', color: '#fbbf24', padding: '4px 12px', borderRadius: 6, fontSize: 13 },
  infoSection: { maxWidth: 1400, margin: '24px auto', padding: '0 24px' },
  infoTitle: { fontSize: 18, fontWeight: 600, color: '#cbd5e1', marginBottom: 16 },
  infoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 },
  infoCard: { background: '#1e293b', borderRadius: 12, padding: 20, border: '1px solid #334155' },
  infoIcon: { fontSize: 28, marginBottom: 8 },
  infoCardTitle: { fontSize: 16, fontWeight: 600, color: '#e2e8f0', margin: '0 0 8px' },
  infoCardText: { fontSize: 13, color: '#94a3b8', lineHeight: 1.6, margin: 0 },
  statsRow: { display: 'flex', gap: 16, maxWidth: 1400, margin: '24px auto', padding: '0 24px', flexWrap: 'wrap' },
  statCard: { flex: '1 1 140px', background: '#1e293b', borderRadius: 12, padding: '16px 20px', textAlign: 'center', border: '1px solid #334155' },
  statCardAlert: { border: '1px solid #f59e0b', background: '#1c1917' },
  statValue: { fontSize: 28, fontWeight: 700, color: '#f1f5f9' },
  statLabel: { fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
  tabRow: { display: 'flex', gap: 4, maxWidth: 1400, margin: '24px auto 0', padding: '0 24px' },
  tab: { padding: '10px 20px', background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', borderBottom: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontSize: 14 },
  tabActive: { padding: '10px 20px', background: '#0f172a', color: '#38bdf8', border: '1px solid #334155', borderBottom: '2px solid #38bdf8', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  filterBar: { display: 'flex', gap: 8, maxWidth: 1400, margin: '0 auto', padding: '16px 24px', flexWrap: 'wrap', alignItems: 'center', background: '#1e293b', borderRadius: '0 0 12px 12px', border: '1px solid #334155', borderTop: 'none' },
  searchInput: { padding: '8px 12px', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6, fontSize: 14, minWidth: 220 },
  select: { padding: '8px 12px', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6, fontSize: 13 },
  resetBtn: { padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  tableWrap: { maxWidth: 1400, margin: '16px auto', padding: '0 24px' },
  resultCount: { fontSize: 13, color: '#94a3b8', marginBottom: 8 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#1e293b', borderRadius: 8, overflow: 'hidden' },
  th: { padding: '10px 12px', background: '#334155', color: '#cbd5e1', textAlign: 'left', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, position: 'sticky', top: 0 },
  td: { padding: '8px 12px', borderBottom: '1px solid #1e293b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  row: { background: '#0f172a' },
  rowAlt: { background: '#1e293b' },
  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, padding: '12px 0' },
  pageBtn: { padding: '6px 12px', background: '#334155', color: '#e2e8f0', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 },
  pageInfo: { color: '#94a3b8', fontSize: 13, minWidth: 120, textAlign: 'center' },
  dispCard: { background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 12, border: '1px solid #334155' },
  dispHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 },
  dispDrug: { fontSize: 16, fontWeight: 600, color: '#f1f5f9' },
  dispMeta: { fontSize: 13, color: '#94a3b8' },
  dispTypes: { display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
  dispBadge: { background: '#78350f', color: '#fbbf24', padding: '3px 10px', borderRadius: 4, fontSize: 12, fontWeight: 600 },
  dispDetails: { display: 'flex', flexDirection: 'column', gap: 8 },
  dispGroup: { background: '#0f172a', borderRadius: 8, padding: 12 },
  dispGroupVals: { display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' },
  dispKV: { fontSize: 13, color: '#cbd5e1' },
  dispStates: { fontSize: 12, color: '#64748b', lineHeight: 1.6 },
  summaryWrap: { maxWidth: 1400, margin: '16px auto', padding: '0 24px' },
  summarySection: { background: '#1e293b', borderRadius: 12, padding: 20, marginBottom: 16, border: '1px solid #334155' },
  summaryTitle: { fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 12 },
  tagWrap: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  tag: { background: '#334155', color: '#cbd5e1', padding: '4px 10px', borderRadius: 4, fontSize: 12 },
  tagBlue: { background: '#1e3a5f', color: '#7dd3fc', padding: '4px 10px', borderRadius: 4, fontSize: 12 },
  tagGreen: { background: '#064e3b', color: '#6ee7b7', padding: '4px 10px', borderRadius: 4, fontSize: 12 },
  tagAmber: { background: '#78350f', color: '#fbbf24', padding: '4px 10px', borderRadius: 4, fontSize: 12 },
  footer: { textAlign: 'center', padding: '32px 24px', color: '#475569', fontSize: 13, borderTop: '1px solid #1e293b', marginTop: 32 },
}
