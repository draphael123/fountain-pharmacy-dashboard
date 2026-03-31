'use client'
import { useState, useEffect, useMemo } from 'react'

const PROGRAM_LABELS = {
  TRT: 'TRT',
  HRT: 'HRT',
  'GLP/Other': 'GLP/Other',
}

const PLAN_OPTIONS = ['4wk', '8wk', '12wk', '48wk']
const SORT_KEYS = ['sex','program','medication','drug','dosage','frequency','pharmacy','med_code','supply_code','payment_plan']

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
  const [showInfo, setShowInfo] = useState(false)
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState(1)
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

  const sortedData = useMemo(() => {
    if (!sortCol) return filtered
    return [...filtered].sort((a, b) => {
      const av = (a[sortCol] || '').toLowerCase()
      const bv = (b[sortCol] || '').toLowerCase()
      return av < bv ? -sortDir : av > bv ? sortDir : 0
    })
  }, [filtered, sortCol, sortDir])

  const pagedData = useMemo(() => {
    return sortedData.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  }, [sortedData, page])

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

  const liveStats = useMemo(() => {
    if (!data.length) return { states: 0, programs: 0, medications: 0, pharmacies: 0 }
    const states = new Set()
    const programs = new Set()
    const medications = new Set()
    const pharmacies = new Set()
    for (const r of data) {
      if (r.state) states.add(r.state)
      if (r.program) programs.add(r.program)
      if (r.medication) medications.add(r.medication)
      if (r.pharmacy) pharmacies.add(r.pharmacy)
    }
    return { states: states.size, programs: programs.size, medications: medications.size, pharmacies: pharmacies.size }
  }, [data])

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
    const rawVariations = []
    for (const c of Object.values(combos)) {
      const pharmSets = {}
      for (const [st, pharms] of Object.entries(c.byState)) {
        const key = pharms.slice().sort().join(',')
        if (!pharmSets[key]) pharmSets[key] = []
        pharmSets[key].push(st)
      }
      if (Object.keys(pharmSets).length > 1) {
        rawVariations.push({
          medication: c.medication, drug: c.drug, dosage: c.dosage,
          frequency: c.frequency, sex: c.sex, payment_plan: c.payment_plan,
          routes: Object.entries(pharmSets).map(function(e) { return { pharmacies: e[0], states: e[1].sort(), count: e[1].length } })
        })
      }
    }
    // Consolidate variations that share the same medication+drug+sex and identical routing pattern
    const consolidated = {}
    for (const v of rawVariations) {
      const routeKey = v.routes.map(function(r) { return r.pharmacies + ':' + r.states.join(',') }).sort().join('|')
      const groupKey = [v.medication, v.drug, v.sex, routeKey].join('||')
      if (!consolidated[groupKey]) {
        consolidated[groupKey] = {
          medication: v.medication, drug: v.drug, sex: v.sex,
          routes: v.routes,
          combos: []
        }
      }
      consolidated[groupKey].combos.push({ dosage: v.dosage, frequency: v.frequency, payment_plan: v.payment_plan })
    }
    const variations = Object.values(consolidated).map(function(g) {
      const dosages = []; const freqs = []; const plans = []
      for (const c of g.combos) {
        if (dosages.indexOf(c.dosage) === -1) dosages.push(c.dosage)
        if (freqs.indexOf(c.frequency) === -1) freqs.push(c.frequency)
        if (plans.indexOf(c.payment_plan) === -1) plans.push(c.payment_plan)
      }
      return {
        medication: g.medication, drug: g.drug, sex: g.sex,
        dosage: dosages.join(', '), frequency: freqs.join(', '),
        payment_plan: plans.join(', '),
        routes: g.routes
      }
    })
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
      <style>{`
        .dash-row:hover { background: #eff6ff !important; }
        .dash-th { cursor: pointer; user-select: none; }
        .dash-th:hover { color: #1e40af; }
      `}</style>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={{display:'flex',alignItems:'center',gap:'16px'}}>
            <img src="https://framerusercontent.com/images/LE6M6GYbhCcJvlv3VhjTi7wIw.png" alt="Fountain" style={{height:28}} />
            <div>
            <h1 style={styles.title}>Pharmacy Dashboard</h1>
            <p style={styles.subtitle}>
              Medication catalog, pharmacy routing, and state-by-state variation analysis
            </p>
            {summary && summary.scrape_date && <p style={{fontSize:12,color:'#64748b',margin:'4px 0 0 0'}}>Data last updated: {summary.scrape_date}</p>}
          </div>
          </div>
          <div style={styles.headerMeta}>
          </div>
        </div>
      </header>

      <section style={styles.infoSection}>
        <div onClick={() => setShowInfo(!showInfo)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',padding:'12px 20px',background:'#ffffff',borderRadius:12,border:'1px solid #dbeafe'}}>
          <h2 style={{...styles.infoTitle, margin:0}}>How This Dashboard Works</h2>
          <span style={{fontSize:20,color:'#3b82f6',transition:'transform 0.2s',transform:showInfo?'rotate(180deg)':'rotate(0deg)'}}>▼</span>
        </div>
        {showInfo && <div style={{...styles.infoGrid, marginTop:12}}>
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
        </div>}
      </section>

      <section style={styles.statsRow}>
        <StatCard label="States" value={liveStats.states} />
        <StatCard label="Programs" value={liveStats.programs} />
        <StatCard label="Medications" value={liveStats.medications} />
        <StatCard label="Pharmacies" value={liveStats.pharmacies} />
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
                {['Sex','Program','Medication','Drug','Dosage','Freq','Pharmacy','Med Code','Supply Code','Plan'].map((h, idx) => {
                  const key = SORT_KEYS[idx]
                  const active = sortCol === key
                  return <th key={h} className="dash-th" style={{...styles.th, color: active ? '#1e40af' : undefined}} onClick={() => { if (active) { setSortDir(d => -d) } else { setSortCol(key); setSortDir(1) } }}>{h}{active ? (sortDir === 1 ? ' ▲' : ' ▼') : ''}</th>
                })}
              </tr>
            </thead>
            <tbody>
              {pagedData.map((r, i) => (
                <tr key={i} className="dash-row" style={i % 2 ? styles.rowAlt : styles.row}>
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
            {routingVariations.length === 0 && <p style={{ color: "#64748b", padding: 16 }}>All pharmacy assignments are consistent across states. No medications are routed differently by state.</p>}
            {routingVariations.map((v, i) => (
              <div key={i} style={{ background: "#ffffff", borderRadius: 12, padding: 20, marginBottom: 16, border: "1px solid #334155" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ color: "#1e293b", fontWeight: 600, fontSize: 16 }}>{v.medication}</span>
                  <span style={{ color: "#64748b", fontSize: 13 }}>{v.drug} | {v.dosage} | {v.frequency} | {v.sex} | {v.payment_plan || "no plan"}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {v.routes.map((route, j) => (
                    <div key={j} style={{ background: "#f8fafc", borderRadius: 8, padding: 14, border: "1px solid #e2e8f0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ background: j === 0 ? "#3b82f6" : "#f59e0b", color: "#fff", padding: "2px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600 }}>{route.pharmacies}</span>
                        <span style={{ color: "#64748b", fontSize: 13 }}>{route.count} state{route.count !== 1 ? "s" : ""}</span>
                      </div>
                      <div style={{ color: "#475569", fontSize: 13, lineHeight: 1.5 }}>{route.states.join(", ")}</div>
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
                <p style={{ color: "#64748b", fontSize: 15, marginBottom: 8 }}>No previous snapshots available yet.</p>
                <p style={{ color: "#94a3b8", fontSize: 13 }}>After the next EHR scrape, changes will be tracked automatically: new medications added, medications removed, pharmacy routing changes, and dosage updates.</p>
              </div>
            ) : (
              <div>
                {changelog.entries.map((entry, i) => (
                  <div key={i} style={{ background: "#ffffff", borderRadius: 10, padding: 16, marginBottom: 12, border: "1px solid #334155" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ color: "#1e293b", fontWeight: 600 }}>{entry.date}</span>
                      <span style={{ color: "#64748b", fontSize: 13 }}>{entry.summary}</span>
                    </div>
                    {entry.changes.map((c, j) => (
                      <div key={j} style={{ padding: "4px 0", borderTop: "1px solid #e2e8f0", display: "flex", gap: 10, alignItems: "center" }}>
                        <span style={{ background: c.type === "added" ? "#16a34a" : c.type === "removed" ? "#dc2626" : "#d97706", color: "#fff", padding: "1px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, minWidth: 60, textAlign: "center" }}>{c.type}</span>
                        <span style={{ color: "#1e293b", fontSize: 13 }}>{c.description}</span>
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
                <div key={p.name} style={{ background: "#f8fafc", borderRadius: 10, padding: 16, border: "1px solid #dbeafe" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#1e40af", marginBottom: 10 }}>{p.name}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                    <div style={{ color: "#64748b", fontSize: 13 }}>Medications: <strong style={{ color: "#1e293b" }}>{p.meds}</strong></div>
                    <div style={{ color: "#64748b", fontSize: 13 }}>States: <strong style={{ color: "#1e293b" }}>{p.states}</strong></div>
                    <div style={{ color: "#64748b", fontSize: 13 }}>Records: <strong style={{ color: "#1e293b" }}>{p.records.toLocaleString()}</strong></div>
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ color: "#64748b", fontSize: 12 }}>Programs: </span>
                    {p.programs.map(pr => <span key={pr} style={styles.tagBlue}>{pr}</span>)}
                  </div>
                  <div>
                    <span style={{ color: "#64748b", fontSize: 12 }}>Plans: </span>
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
  container: { minHeight: '100vh', background: '#f0f7ff', color: '#1e293b', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  header: { background: '#ffffff', borderBottom: '1px solid #dbeafe', padding: '20px 0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  headerInner: { maxWidth: 1400, margin: '0 auto', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  headerMeta: { display: 'flex', gap: 8, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 800, color: '#1e40af', margin: 0 },
  subtitle: { color: '#64748b', fontSize: 14, margin: '4px 0 0 0' },
  infoSection: { maxWidth: 1400, margin: '24px auto', padding: '0 24px' },
  infoTitle: { color: '#1e293b', fontSize: 18, fontWeight: 700, marginBottom: 16 },
  infoCards: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 },
  infoCard: { background: '#ffffff', borderRadius: 12, padding: 20, border: '1px solid #dbeafe', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  infoIcon: { fontSize: 22, fontWeight: 700, color: '#3b82f6', marginBottom: 8 },
  infoCardTitle: { fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 8 },
  infoCardText: { color: '#64748b', fontSize: 13, lineHeight: 1.5, margin: 0 },
  statsRow: { display: 'flex', gap: 16, maxWidth: 1400, margin: '24px auto', padding: '0 24px', flexWrap: 'wrap' },
  statCard: { flex: 1, minWidth: 120, background: '#ffffff', borderRadius: 12, padding: '16px 20px', textAlign: 'center', border: '1px solid #dbeafe', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  statCardAlert: { flex: 1, minWidth: 120, background: '#fef2f2', borderRadius: 12, padding: '16px 20px', textAlign: 'center', border: '1px solid #fecaca' },
  statValue: { fontSize: 28, fontWeight: 800, color: '#1e40af' },
  statLabel: { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, color: '#64748b', marginTop: 4 },
  tabRow: { display: 'flex', gap: 4, maxWidth: 1400, margin: '24px auto 0', padding: '0 24px' },
  tab: { padding: '10px 20px', borderRadius: '8px 8px 0 0', border: 'none', background: '#e0ecff', color: '#3b82f6', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  tabActive: { padding: '10px 20px', borderRadius: '8px 8px 0 0', border: 'none', background: '#ffffff', color: '#1e40af', cursor: 'pointer', fontSize: 14, fontWeight: 700, boxShadow: '0 -1px 3px rgba(0,0,0,0.05)' },
  filterBar: { display: 'flex', gap: 8, maxWidth: 1400, margin: '0 auto', padding: '16px 24px', background: '#ffffff', flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  searchInput: { padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#1e293b', fontSize: 13, width: '100%' },
  filterSelect: { padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#1e293b', fontSize: 13 },
  resetBtn: { padding: '6px 16px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  exportBtn: { padding: '6px 16px', borderRadius: 6, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#16a34a', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  tableWrap: { maxWidth: 1400, margin: '0 auto', padding: '16px 24px' },
  resultCount: { color: '#64748b', fontSize: 13, marginBottom: 12 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #dbeafe', color: '#1e40af', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, background: '#f0f7ff' },
  td: { padding: '8px 12px', borderBottom: '1px solid #e2e8f0', color: '#334155' },
  rowEven: { background: '#ffffff' },
  rowOdd: { background: '#f8fafc' },
  pageRow: { display: 'flex', justifyContent: 'center', gap: 8, padding: 16, alignItems: 'center' },
  pageBtn: { padding: '6px 12px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#ffffff', color: '#3b82f6', cursor: 'pointer', fontSize: 13 },
  pageInfo: { color: '#64748b', fontSize: 13 },
  loadingContainer: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' },
  spinner: { width: 40, height: 40, border: '4px solid #dbeafe', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' },
  loadingText: { color: '#64748b', marginTop: 16, fontSize: 15 },
  errorContainer: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: '#dc2626' },
  dispCard: { background: '#ffffff', borderRadius: 10, padding: 16, marginBottom: 12, border: '1px solid #dbeafe', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  dispHeader: { display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  dispDrug: { fontWeight: 700, color: '#1e293b', fontSize: 15 },
  dispMeta: { color: '#64748b', fontSize: 13 },
  dispTypes: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  dispBadge: { background: '#dbeafe', color: '#1e40af', padding: '2px 10px', borderRadius: 4, fontSize: 12, fontWeight: 600 },
  dispDetails: { display: 'flex', flexDirection: 'column', gap: 8 },
  dispGroup: { background: '#f8fafc', borderRadius: 6, padding: 10, border: '1px solid #e2e8f0' },
  dispGroupVals: { display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 4 },
  dispKV: { color: '#334155', fontSize: 13 },
  dispStates: { color: '#64748b', fontSize: 12, lineHeight: 1.4 },
  summaryWrap: { maxWidth: 1400, margin: '16px auto', padding: '0 24px' },
  summarySection: { background: '#ffffff', borderRadius: 12, padding: 20, marginBottom: 16, border: '1px solid #dbeafe', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  summaryTitle: { color: '#1e293b', fontSize: 16, fontWeight: 700, marginBottom: 12 },
  tagWrap: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  tag: { background: '#f0f7ff', color: '#3b82f6', padding: '4px 10px', borderRadius: 6, fontSize: 12, border: '1px solid #dbeafe' },
  tagBlue: { background: '#eff6ff', color: '#1d4ed8', padding: '4px 10px', borderRadius: 6, fontSize: 12, border: '1px solid #bfdbfe' },
  tagGreen: { background: '#f0fdf4', color: '#16a34a', padding: '4px 10px', borderRadius: 6, fontSize: 12, border: '1px solid #bbf7d0' },
  tagAmber: { background: '#fffbeb', color: '#d97706', padding: '4px 10px', borderRadius: 6, fontSize: 12, border: '1px solid #fde68a' },
  footer: { textAlign: 'center', padding: '32px 24px', color: '#94a3b8', fontSize: 13 },
  suggestBox: { position: 'absolute', top: '100%', left: 0, right: 0, background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 8, marginTop: 4, zIndex: 50, maxHeight: 240, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' },
  suggestItem: { padding: '8px 12px', color: '#1e293b', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid #f1f5f9' },
  badge: { background: '#f0f7ff', color: '#3b82f6', padding: '4px 12px', borderRadius: 6, fontSize: 13 },
  badgeGreen: { background: '#f0fdf4', color: '#16a34a', padding: '4px 12px', borderRadius: 6, fontSize: 13 },
  badgeAmber: { background: '#fffbeb', color: '#d97706', padding: '4px 12px', borderRadius: 6, fontSize: 13 },
}
