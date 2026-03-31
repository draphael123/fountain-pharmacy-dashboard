'use client'
import React, { useState, useEffect, useMemo } from 'react'

const PROGRAM_LABELS = {
  TRT: 'TRT',
  HRT: 'HRT',
  'GLP/Other': 'GLP/Other',
}

const PLAN_OPTIONS = ['4wk', '8wk', '12wk', '48wk']
function sortPlans(arr) { return arr.slice().sort(function(a, b) { var ai = PLAN_OPTIONS.indexOf(a), bi = PLAN_OPTIONS.indexOf(b); return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) }) }
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
  const [stateFilter, setStateFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState(1)
  const [filterPlan, setFilterPlan] = useState('')

  const [activeTab, setActiveTab] = useState('catalog')
  const [page, setPage] = useState(0)
  const [groupPlans, setGroupPlans] = useState(true)
  const [expandedRow, setExpandedRow] = useState(null)
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [medCodeFilter, setMedCodeFilter] = useState('')
  const [lookupQuery, setLookupQuery] = useState('')
  const [pageSize, setPageSize] = useState(50)
  const [darkMode, setDarkMode] = useState(false)
  const [hiddenCols, setHiddenCols] = useState(new Set())
  const searchRef = React.useRef(null)

  // Sync filters FROM URL on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const p = new URLSearchParams(window.location.search)
    if (p.get('tab')) setActiveTab(p.get('tab'))
    if (p.get('sex')) setSexFilter(p.get('sex'))
    if (p.get('program')) setProgramFilter(p.get('program'))
    if (p.get('med')) setMedFilter(p.get('med'))
    if (p.get('pharmacy')) setPharmacyFilter(p.get('pharmacy'))
    if (p.get('state')) setStateFilter(p.get('state'))
    if (p.get('plan')) setFilterPlan(p.get('plan'))
    if (p.get('medcode')) setMedCodeFilter(p.get('medcode'))
    if (p.get('q')) setSearch(p.get('q'))
  }, [])

  // Sync filters TO URL on change
  useEffect(() => {
    if (typeof window === 'undefined') return
    const p = new URLSearchParams()
    if (activeTab !== 'catalog') p.set('tab', activeTab)
    if (sexFilter) p.set('sex', sexFilter)
    if (programFilter) p.set('program', programFilter)
    if (medFilter) p.set('med', medFilter)
    if (pharmacyFilter) p.set('pharmacy', pharmacyFilter)
    if (stateFilter) p.set('state', stateFilter)
    if (filterPlan) p.set('plan', filterPlan)
    if (medCodeFilter) p.set('medcode', medCodeFilter)
    if (search) p.set('q', search)
    const qs = p.toString()
    const newUrl = window.location.pathname + (qs ? '?' + qs : '')
    window.history.replaceState(null, '', newUrl)
  }, [activeTab, sexFilter, programFilter, medFilter, pharmacyFilter, stateFilter, filterPlan, medCodeFilter, search])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e) {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault()
        if (searchRef.current) searchRef.current.focus()
      }
      if (e.key === 'Escape') {
        resetFilters()
        if (document.activeElement) document.activeElement.blur()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  useEffect(() => {
    Promise.allSettled([
      fetch('/pharmacy_data.json').then(r => r.json()),
      Promise.resolve([]),
      fetch('/changelog.json').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/summary.json').then(r => r.json()),
    ]).then(([dRes, dispRes, clRes, sRes]) => {
      if (dRes.status === 'fulfilled') setData(decodePharmacyData(dRes.value))
      // routing variations computed below
      if (clRes && clRes.status === 'fulfilled' && clRes.value) setChangelog(clRes.value)
      if (sRes && sRes.status === 'fulfilled') setSummary(sRes.value)
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
    if (stateFilter) f = f.filter(r => r.state === stateFilter)
    if (medCodeFilter) f = f.filter(r => r.med_code === medCodeFilter)
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
    if (groupPlans && !filterPlan) {
      // Collapse rows that differ only by payment_plan
      const planGroups = {}
      for (const r of f) {
        const key = [r.sex, r.program, r.medication, r.drug, r.dosage, r.frequency, r.pharmacy, r.med_code, r.supply_code].join('|')
        if (!planGroups[key]) planGroups[key] = { ...r, _plans: [] }
        if (!planGroups[key]._plans.includes(r.payment_plan)) planGroups[key]._plans.push(r.payment_plan)
      }
      return Object.values(planGroups)
    }
    for (const r of f) {
      const key = [r.sex, r.program, r.medication, r.drug, r.dosage, r.frequency, r.pharmacy, r.med_code, r.supply_code, r.payment_plan].join('|')
      if (!seen.has(key)) { seen.add(key); unique.push(r) }
    }
    return unique
  }, [data, sexFilter, programFilter, medFilter, pharmacyFilter, stateFilter, medCodeFilter, search, filterPlan, groupPlans])

  const sortedData = useMemo(() => {
    if (!sortCol) return filtered
    return [...filtered].sort((a, b) => {
      const av = (a[sortCol] || '').toLowerCase()
      const bv = (b[sortCol] || '').toLowerCase()
      return av < bv ? -sortDir : av > bv ? sortDir : 0
    })
  }, [filtered, sortCol, sortDir])

  const pagedData = useMemo(() => {
    if (pageSize === 'all') return sortedData
    return sortedData.slice(page * pageSize, (page + 1) * pageSize)
  }, [sortedData, page, pageSize])

  const totalPages = pageSize === 'all' ? 1 : Math.ceil(filtered.length / pageSize)

  // Build index: for each unique row key → list of states
  const stateIndex = useMemo(() => {
    const idx = {}
    for (const r of data) {
      const key = [r.sex, r.program, r.medication, r.drug, r.dosage, r.frequency, r.pharmacy, r.med_code, r.supply_code].join('|')
      if (!idx[key]) idx[key] = new Set()
      if (r.state) idx[key].add(r.state)
    }
    return idx
  }, [data])

  function getStatesForRow(r) {
    const key = [r.sex, r.program, r.medication, r.drug, r.dosage, r.frequency, r.pharmacy, r.med_code, r.supply_code].join('|')
    const states = stateIndex[key]
    return states ? Array.from(states).sort() : []
  }

  const filterOptions = useMemo(() => {
    let f = data
    const programs = sorted(new Set(f.map(r => r.program)))
    const states = sorted(new Set(f.map(r => r.state).filter(Boolean)))
    if (sexFilter) f = f.filter(r => r.sex === sexFilter)
    if (programFilter) f = f.filter(r => r.program === programFilter)
    const meds = sorted(new Set(f.map(r => r.medication)))
    const pharmacies = sorted(new Set(f.map(r => r.pharmacy).filter(Boolean)))
    const medCodes = sorted(new Set(f.map(r => r.med_code).filter(Boolean)))
    return { programs, meds, pharmacies, states, medCodes }
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
      return { name: s.name, meds: s.meds.size, programs: Array.from(s.programs).sort(), plans: sortPlans(Array.from(s.plans).filter(Boolean)), records: s.records, states: s.states.size }
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

  function relativeTime(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    if (isNaN(d)) return dateStr
    const now = new Date()
    const diff = Math.floor((now - d) / 86400000)
    if (diff === 0) return 'today'
    if (diff === 1) return 'yesterday'
    if (diff < 7) return diff + ' days ago'
    if (diff < 30) return Math.floor(diff / 7) + ' week' + (Math.floor(diff / 7) > 1 ? 's' : '') + ' ago'
    return Math.floor(diff / 30) + ' month' + (Math.floor(diff / 30) > 1 ? 's' : '') + ' ago'
  }

  const activeFilters = useMemo(() => {
    const chips = []
    if (sexFilter) chips.push({ label: 'Sex: ' + sexFilter, clear: () => setSexFilter('') })
    if (programFilter) chips.push({ label: 'Program: ' + (PROGRAM_LABELS[programFilter] || programFilter), clear: () => setProgramFilter('') })
    if (medFilter) chips.push({ label: 'Med: ' + medFilter, clear: () => setMedFilter('') })
    if (pharmacyFilter) chips.push({ label: 'Pharmacy: ' + pharmacyFilter, clear: () => setPharmacyFilter('') })
    if (stateFilter) chips.push({ label: 'State: ' + stateFilter, clear: () => setStateFilter('') })
    if (medCodeFilter) chips.push({ label: 'Code: ' + medCodeFilter, clear: () => setMedCodeFilter('') })
    if (filterPlan) chips.push({ label: 'Plan: ' + filterPlan, clear: () => setFilterPlan('') })
    if (search) chips.push({ label: 'Search: "' + search + '"', clear: () => setSearch('') })
    return chips
  }, [sexFilter, programFilter, medFilter, pharmacyFilter, stateFilter, medCodeFilter, filterPlan, search])

  const COL_NAMES = ['Sex','Program','Medication','Drug','Dosage','Freq','Pharmacy','Med Code','Supply Code','Plan']

  function toggleCol(idx) {
    setHiddenCols(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
  }

  function resetFilters() {
    setSexFilter('')
    setProgramFilter('')
    setMedFilter('')
    setPharmacyFilter('')
    setStateFilter('')
    setMedCodeFilter('')
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

  // Build lookup results: group by medication → show all dosages/pharmacies/codes
  const lookupResults = useMemo(() => {
    if (!lookupQuery || lookupQuery.length < 2) return []
    const q = lookupQuery.toLowerCase()
    const matches = data.filter(r =>
      (r.medication || '').toLowerCase().includes(q) ||
      (r.drug || '').toLowerCase().includes(q) ||
      (r.med_code || '').toLowerCase().includes(q)
    )
    // Group by medication + drug
    const groups = {}
    for (const r of matches) {
      const gk = r.medication + '|' + r.drug
      if (!groups[gk]) groups[gk] = { medication: r.medication, drug: r.drug, sex: r.sex, program: r.program, entries: {} }
      const ek = [r.dosage, r.frequency, r.pharmacy, r.med_code, r.supply_code].join('|')
      if (!groups[gk].entries[ek]) groups[gk].entries[ek] = { dosage: r.dosage, frequency: r.frequency, pharmacy: r.pharmacy, med_code: r.med_code, supply_code: r.supply_code, plans: new Set(), states: new Set() }
      if (r.payment_plan) groups[gk].entries[ek].plans.add(r.payment_plan)
      if (r.state) groups[gk].entries[ek].states.add(r.state)
    }
    return Object.values(groups).map(g => ({
      ...g,
      entries: Object.values(g.entries).map(e => ({ ...e, plans: sortPlans(Array.from(e.plans)), states: Array.from(e.states).sort() }))
    }))
  }, [data, lookupQuery])

  function exportRoutingReference() {
    // Build a concise routing cheat sheet
    const routeMap = {}
    for (const r of data) {
      const key = [r.sex, r.program, r.medication, r.drug, r.dosage, r.frequency].join('|')
      if (!routeMap[key]) routeMap[key] = { sex: r.sex, program: r.program, medication: r.medication, drug: r.drug, dosage: r.dosage, frequency: r.frequency, pharmacies: {}, med_codes: new Set(), supply_codes: new Set() }
      const pkey = r.pharmacy
      if (!routeMap[key].pharmacies[pkey]) routeMap[key].pharmacies[pkey] = new Set()
      if (r.state) routeMap[key].pharmacies[pkey].add(r.state)
      if (r.med_code) routeMap[key].med_codes.add(r.med_code)
      if (r.supply_code) routeMap[key].supply_codes.add(r.supply_code)
    }
    const lines = ['FOUNTAIN VITALITY - PHARMACY ROUTING REFERENCE', 'Generated: ' + new Date().toLocaleDateString(), '']
    const entries = Object.values(routeMap).sort((a, b) => a.program.localeCompare(b.program) || a.medication.localeCompare(b.medication) || a.dosage.localeCompare(b.dosage))
    let lastProgram = ''
    for (const e of entries) {
      if (e.program !== lastProgram) { lines.push('', '=== ' + (PROGRAM_LABELS[e.program] || e.program) + ' (' + e.sex + ') ===', ''); lastProgram = e.program }
      const pharmList = Object.entries(e.pharmacies).map(([p, states]) => p + ' (' + states.size + ' states' + (states.size < 5 ? ': ' + Array.from(states).sort().join(', ') : '') + ')').join(' | ')
      lines.push(e.medication + ' - ' + e.dosage + ' ' + e.frequency)
      lines.push('  Pharmacy: ' + pharmList)
      lines.push('  Med codes: ' + Array.from(e.med_codes).join(', ') + (e.supply_codes.size ? '  Supply: ' + Array.from(e.supply_codes).join(', ') : ''))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'fountain_routing_reference.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Dark mode palette
  const dm = darkMode ? {
    bg: '#0f172a', card: '#1e293b', border: '#334155', text: '#e2e8f0', muted: '#94a3b8', accent: '#60a5fa', accentDark: '#1e3a5f', headerBg: '#1e293b', rowAlt: '#162032', hover: '#1e3a5f', inputBg: '#0f172a', inputBorder: '#475569'
  } : {
    bg: '#f0f7ff', card: '#ffffff', border: '#dbeafe', text: '#1e293b', muted: '#64748b', accent: '#1e40af', accentDark: '#dbeafe', headerBg: '#ffffff', rowAlt: '#f8fafc', hover: '#eff6ff', inputBg: '#f8fafc', inputBorder: '#cbd5e1'
  }

  if (loading) {
    return (
      <div style={{ ...styles.loadingContainer, background: dm.bg }}>
        <div style={{ maxWidth: 1400, width: '100%', padding: '0 24px' }}>
          <div style={{ height: 60, background: dm.card, borderRadius: 12, marginBottom: 24, animation: 'pulse 1.5s ease-in-out infinite' }} />
          <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>{[1,2,3,4,5].map(i => <div key={i} style={{ flex: 1, height: 72, background: dm.card, borderRadius: 12, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: i * 100 + 'ms' }} />)}</div>
          <div style={{ height: 48, background: dm.card, borderRadius: 8, marginBottom: 12, animation: 'pulse 1.5s ease-in-out infinite' }} />
          {[1,2,3,4,5,6,7,8].map(i => <div key={i} style={{ height: 36, background: dm.card, borderRadius: 4, marginBottom: 4, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: i * 50 + 'ms' }} />)}
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...styles.container, background: dm.bg, color: dm.text }}>
      <style>{`
        .dash-row:hover { background: ${dm.hover} !important; }
        .dash-th { cursor: pointer; user-select: none; }
        .dash-th:hover { color: ${dm.accent}; }
        @keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 0.8; } }
        @media print { .no-print { display: none !important; } .dash-row:hover { background: transparent !important; } body { background: #fff !important; color: #000 !important; } }
        @media (max-width: 768px) { .hide-mobile { display: none !important; } .mobile-card { display: block !important; } }
      `}</style>
      <header style={{ ...styles.header, background: dm.headerBg, borderColor: dm.border }} className="no-print">
        <div style={styles.headerInner}>
          <div style={{display:'flex',alignItems:'center',gap:'16px'}}>
            <img src="https://framerusercontent.com/images/LE6M6GYbhCcJvlv3VhjTi7wIw.png" alt="Fountain" style={{height:28}} />
            <div>
            <h1 style={{ ...styles.title, color: dm.accent }}>Pharmacy Dashboard</h1>
            <p style={{ ...styles.subtitle, color: dm.muted }}>
              Medication catalog, pharmacy routing, and state-by-state variation analysis
            </p>
            {summary && summary.scrape_date && <p style={{fontSize:12,color:darkMode?'#94a3b8':'#64748b',margin:'4px 0 0 0'}}>Data last updated: {summary.scrape_date} ({relativeTime(summary.scrape_date)})</p>}
          </div>
          </div>
          <div style={styles.headerMeta}>
            <button onClick={() => setDarkMode(d => !d)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid ' + (darkMode ? '#475569' : '#cbd5e1'), background: darkMode ? '#1e293b' : '#f8fafc', color: darkMode ? '#e2e8f0' : '#334155', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{darkMode ? '☀ Light' : '● Dark'}</button>
          </div>
        </div>
      </header>

      <section style={styles.infoSection} className="no-print">
        <div onClick={() => setShowInfo(!showInfo)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',padding:'12px 20px',background:dm.card,borderRadius:12,border:'1px solid ' + dm.border}}>
          <h2 style={{...styles.infoTitle, margin:0, color: dm.text}}>How This Dashboard Works</h2>
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

      <section style={styles.statsRow} className="no-print">
        <StatCard label="States" value={liveStats.states} dm={dm} />
        <StatCard label="Programs" value={liveStats.programs} dm={dm} />
        <StatCard label="Medications" value={liveStats.medications} dm={dm} />
        <StatCard label="Pharmacies" value={liveStats.pharmacies} dm={dm} />
        <StatCard label="Variations" value={routingVariations.length} alert dm={dm} />
      </section>

      <div style={styles.tabRow} className="no-print">
        {[['lookup','Quick Lookup'],['catalog','Medication Catalog'],['variations','Routing Variations (' + routingVariations.length + ')'],['summary','Summary'],['formulary','Formulary']].map(([key,label]) => (
          <button key={key} style={activeTab === key ? { ...styles.tabActive, background: dm.card, color: dm.accent } : { ...styles.tab, background: darkMode ? '#162032' : '#e0ecff', color: dm.accent }} onClick={() => { setActiveTab(key); if (key !== 'lookup') setPage(0); setSearch('') }}>{label}</button>
        ))}
        {changelog && <button style={activeTab === 'changelog' ? { ...styles.tabActive, background: dm.card, color: dm.accent } : { ...styles.tab, background: darkMode ? '#162032' : '#e0ecff', color: dm.accent }} onClick={() => { setActiveTab('changelog'); setSearch('') }}>Change Log</button>}
      </div>

      {activeTab !== 'lookup' && activeTab !== 'summary' && <div style={{ ...styles.filterBar, background: dm.card, borderColor: dm.border }} className="no-print">
        <div style={{ position: "relative", flex: 1 }}>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search by drug name, med code, or dosage... (press / to focus)"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); setShowSuggestions(true) }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            style={{ ...styles.searchInput, background: dm.inputBg, borderColor: dm.inputBorder, color: dm.text }}
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
        <select value={programFilter} onChange={e => { setProgramFilter(e.target.value); setPage(0) }} style={styles.select}>
          <option value="">All Programs</option>
          {(filterOptions.programs || []).map(p => <option key={p} value={p}>{PROGRAM_LABELS[p] || p}</option>)}
        </select>
        {activeTab === 'catalog' && (
          <button onClick={() => setShowAdvancedFilters(v => !v)} style={{ ...styles.pageBtn, fontSize: 12, padding: '6px 12px' }}>
            {showAdvancedFilters ? 'Less Filters ▲' : 'More Filters ▼'}
          </button>
        )}
        <button onClick={resetFilters} style={styles.resetBtn}>Reset All</button>
        <button onClick={exportCSV} style={styles.exportBtn}>Export CSV</button>
      </div>}
      {activeTab === 'catalog' && showAdvancedFilters && (
        <div style={{ ...styles.filterBar, borderTop: 'none', paddingTop: 0, boxShadow: 'none' }}>
          <select value={medFilter} onChange={e => { setMedFilter(e.target.value); setPage(0) }} style={styles.select}>
            <option value="">All Medications</option>
            {(filterOptions.meds || []).map(m => <option key={m}>{m}</option>)}
          </select>
          <select value={pharmacyFilter} onChange={e => { setPharmacyFilter(e.target.value); setPage(0) }} style={styles.select}>
            <option value="">All Pharmacies</option>
            {(filterOptions.pharmacies || []).map(p => <option key={p}>{p}</option>)}
          </select>
          <select value={stateFilter} onChange={e => { setStateFilter(e.target.value); setPage(0) }} style={styles.select}>
            <option value="">All States</option>
            {(filterOptions.states || []).map(s => <option key={s}>{s}</option>)}
          </select>
          <select value={medCodeFilter} onChange={e => { setMedCodeFilter(e.target.value); setPage(0) }} style={styles.select}>
            <option value="">All Med Codes</option>
            {(filterOptions.medCodes || []).map(c => <option key={c}>{c}</option>)}
          </select>
          <select style={styles.select} value={filterPlan} onChange={e => { setFilterPlan(e.target.value); setPage(0) }}>
            <option value="">All Plans</option>
            {PLAN_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button onClick={() => { setGroupPlans(g => !g); setPage(0) }} style={groupPlans ? styles.exportBtn : styles.resetBtn}>{groupPlans ? 'Plans Grouped' : 'Plans Expanded'}</button>
          <button onClick={exportRoutingReference} style={{ ...styles.exportBtn, borderColor: '#bfdbfe', background: '#eff6ff', color: '#1e40af' }}>Routing Reference</button>
        </div>
      )}

      {activeFilters.length > 0 && activeTab !== 'lookup' && activeTab !== 'summary' && (
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '8px 24px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: dm.muted, fontWeight: 600 }}>Active:</span>
          {activeFilters.map((f, i) => (
            <span key={i} onClick={f.clear} style={{ background: darkMode ? '#1e3a5f' : '#dbeafe', color: darkMode ? '#93c5fd' : '#1e40af', padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>{f.label} <span style={{ fontSize: 14, lineHeight: 1 }}>&times;</span></span>
          ))}
        </div>
      )}

      {activeTab === 'catalog' && (
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '4px 24px', display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: dm.muted, marginRight: 4 }}>Columns:</span>
          {COL_NAMES.map((c, i) => (
            <button key={c} onClick={() => toggleCol(i)} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid ' + (hiddenCols.has(i) ? (darkMode ? '#334155' : '#e2e8f0') : (darkMode ? '#1e3a5f' : '#bfdbfe')), background: hiddenCols.has(i) ? 'transparent' : (darkMode ? '#1e3a5f' : '#eff6ff'), color: hiddenCols.has(i) ? dm.muted : dm.accent, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>{c}</button>
          ))}
        </div>
      )}

      {activeTab === 'lookup' && (
        <div style={styles.tableWrap}>
          <div style={{ maxWidth: 600, margin: '0 auto' }}>
            <input
              type="text"
              placeholder="Type a medication name, drug, or med code..."
              value={lookupQuery}
              onChange={e => setLookupQuery(e.target.value)}
              autoFocus
              style={{ ...styles.searchInput, fontSize: 16, padding: '14px 16px', marginBottom: 20 }}
            />
            {lookupQuery.length >= 2 && lookupResults.length === 0 && (
              <p style={{ color: '#64748b', textAlign: 'center', padding: 24 }}>No results for &ldquo;{lookupQuery}&rdquo;</p>
            )}
          </div>
          {lookupResults.map((g, gi) => (
            <div key={gi} style={{ background: '#ffffff', borderRadius: 12, padding: 20, marginBottom: 16, border: '1px solid #dbeafe', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <span style={{ color: '#1e293b', fontWeight: 700, fontSize: 18 }}>{g.medication}</span>
                  <span style={{ color: '#64748b', fontSize: 13, marginLeft: 12 }}>{g.drug}</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={styles.tagBlue}>{PROGRAM_LABELS[g.program] || g.program}</span>
                  <span style={styles.tag}>{g.sex}</span>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {g.entries.map((e, ei) => (
                  <div key={ei} style={{ background: '#f8fafc', borderRadius: 8, padding: 14, border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', alignItems: 'center' }}>
                    <span style={{ color: '#64748b', fontSize: 12, fontWeight: 600 }}>Dosage</span>
                    <span style={{ color: '#1e293b', fontSize: 14, fontWeight: 600 }}>{e.dosage} &middot; {e.frequency}</span>
                    <span style={{ color: '#64748b', fontSize: 12, fontWeight: 600 }}>Pharmacy</span>
                    <span style={{ color: '#1e40af', fontSize: 14, fontWeight: 700 }}>{e.pharmacy}</span>
                    <span style={{ color: '#64748b', fontSize: 12, fontWeight: 600 }}>Med Code</span>
                    <span style={{ fontFamily: 'monospace', color: '#1e293b', fontSize: 14 }}>{e.med_code}{e.supply_code ? ' / ' + e.supply_code : ''}</span>
                    <span style={{ color: '#64748b', fontSize: 12, fontWeight: 600 }}>Plans</span>
                    <div style={styles.tagWrap}>{e.plans.map(p => <span key={p} style={styles.tag}>{p}</span>)}</div>
                    <span style={{ color: '#64748b', fontSize: 12, fontWeight: 600 }}>States</span>
                    <span style={{ color: '#475569', fontSize: 12 }}>{e.states.length} states{e.states.length <= 5 ? ': ' + e.states.join(', ') : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!lookupQuery && (
            <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
              <p style={{ fontSize: 18, marginBottom: 8 }}>Search for a medication above</p>
              <p style={{ fontSize: 13 }}>Type a drug name, medication, or med code to see pharmacy routing, codes, and state availability at a glance.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'catalog' && (
        <div style={styles.tableWrap}>
          <div style={{ ...styles.resultCount, color: dm.muted, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{filtered.length.toLocaleString()} results {pageSize !== 'all' && '(page ' + (page + 1) + '/' + (totalPages || 1) + ')'}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} className="no-print">
              <span style={{ fontSize: 12 }}>Rows:</span>
              <select value={pageSize} onChange={e => { setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value)); setPage(0) }} style={{ ...styles.select, background: dm.inputBg, borderColor: dm.inputBorder, color: dm.text, padding: '4px 8px', fontSize: 12 }}>
                {[25,50,100].map(n => <option key={n} value={n}>{n}</option>)}
                <option value="all">All</option>
              </select>
            </div>
          </div>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: dm.muted }}>
              <p style={{ fontSize: 20, marginBottom: 8 }}>No medications match these filters</p>
              <p style={{ fontSize: 13 }}>Try removing some filters or broadening your search. <span onClick={resetFilters} style={{ color: dm.accent, cursor: 'pointer', textDecoration: 'underline' }}>Reset all filters</span></p>
            </div>
          ) : (
          <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                {COL_NAMES.map((h, idx) => {
                  if (hiddenCols.has(idx)) return null
                  const key = SORT_KEYS[idx]
                  const active = sortCol === key
                  const isFirst = !hiddenCols.has(idx) && Array.from({length: idx}, (_, j) => j).every(j => hiddenCols.has(j))
                  return <th key={h} className="dash-th" style={{...styles.th, background: darkMode ? '#162032' : '#f0f7ff', color: active ? dm.accent : dm.muted, borderColor: dm.border, ...(isFirst ? { position: 'sticky', left: 0, zIndex: 2, background: darkMode ? '#162032' : '#f0f7ff' } : {})}} onClick={() => { if (active) { setSortDir(d => -d) } else { setSortCol(key); setSortDir(1) } }}>{h}{active ? (sortDir === 1 ? ' ▲' : ' ▼') : ''}</th>
                })}
              </tr>
            </thead>
            <tbody>
              {pagedData.map((r, i) => {
                const isExpanded = expandedRow === page + '_' + i
                const vals = [r.sex, PROGRAM_LABELS[r.program] || r.program, r.medication, r.drug, r.dosage, r.frequency, r.pharmacy, r.med_code, r.supply_code, r._plans ? sortPlans(r._plans).join(', ') : r.payment_plan]
                return (
                  <React.Fragment key={i}>
                    <tr className="dash-row" style={{ background: i % 2 ? dm.rowAlt : dm.card, cursor: 'pointer' }} onClick={() => setExpandedRow(isExpanded ? null : page + '_' + i)}>
                      {vals.map((v, idx) => {
                        if (hiddenCols.has(idx)) return null
                        const isFirst = !hiddenCols.has(idx) && Array.from({length: idx}, (_, j) => j).every(j => hiddenCols.has(j))
                        return <td key={idx} style={{...styles.td, color: dm.text, borderColor: dm.border, ...(idx >= 7 && idx <= 8 ? { fontFamily: 'monospace' } : {}), ...(isFirst ? { position: 'sticky', left: 0, zIndex: 1, background: i % 2 ? dm.rowAlt : dm.card } : {})}}>{v}</td>
                      })}
                    </tr>
                    {isExpanded && (
                      <tr style={{ background: darkMode ? '#162032' : '#f0f7ff' }}>
                        <td colSpan={10 - hiddenCols.size} style={{ padding: '12px 16px', borderBottom: '1px solid ' + dm.border }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <span style={{ color: dm.accent, fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>Available in {getStatesForRow(r).length} states:</span>
                            <div style={styles.tagWrap}>
                              {getStatesForRow(r).map(s => <span key={s} style={{ ...styles.tag, background: darkMode ? '#1e3a5f' : '#f0f7ff', color: dm.accent, borderColor: dm.border }}>{s}</span>)}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
          </div>
          )}
          {totalPages > 1 && pageSize !== 'all' && (
            <div style={styles.pagination} className="no-print">
              <button style={{ ...styles.pageBtn, background: dm.card, borderColor: dm.inputBorder, color: dm.accent }} disabled={page === 0} onClick={() => setPage(0)}>&laquo; First</button>
              <button style={{ ...styles.pageBtn, background: dm.card, borderColor: dm.inputBorder, color: dm.accent }} disabled={page === 0} onClick={() => setPage(p => p - 1)}>&lsaquo; Prev</button>
              <span style={{ ...styles.pageInfo, color: dm.muted }}>Page {page + 1} of {totalPages}</span>
              <button style={{ ...styles.pageBtn, background: dm.card, borderColor: dm.inputBorder, color: dm.accent }} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next &rsaquo;</button>
              <button style={{ ...styles.pageBtn, background: dm.card, borderColor: dm.inputBorder, color: dm.accent }} disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>Last &raquo;</button>
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
          <div style={{ ...styles.summarySection, background: dm.card, borderColor: dm.border }}>
            <h3 style={{ ...styles.summaryTitle, color: dm.text }}>States ({summary.states?.length})</h3>
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

      <footer style={{ ...styles.footer, color: dm.muted }}>
        <p>Fountain Pharmacy Dashboard &middot; Data scraped from EHR portal &middot; {summary?.scrape_date} &middot; Press <kbd style={{ background: dm.card, border: '1px solid ' + dm.border, borderRadius: 3, padding: '1px 5px', fontSize: 11 }}>/</kbd> to search, <kbd style={{ background: dm.card, border: '1px solid ' + dm.border, borderRadius: 3, padding: '1px 5px', fontSize: 11 }}>Esc</kbd> to clear</p>
      </footer>
    </div>
  )
}

function StatCard({ label, value, alert, dm }) {
  return (
    <div style={{...styles.statCard, background: dm.card, borderColor: dm.border, ...(alert ? { background: dm.card, borderColor: '#fecaca' } : {})}}>
      <div style={{ ...styles.statValue, color: alert ? '#ef4444' : dm.accent }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
      <div style={{ ...styles.statLabel, color: dm.muted }}>{label}</div>
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
  select: { padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#1e293b', fontSize: 13 },
  filterSelect: { padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#1e293b', fontSize: 13 },
  resetBtn: { padding: '6px 16px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  exportBtn: { padding: '6px 16px', borderRadius: 6, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#16a34a', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  tableWrap: { maxWidth: 1400, margin: '0 auto', padding: '16px 24px' },
  resultCount: { color: '#64748b', fontSize: 13, marginBottom: 12 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #dbeafe', color: '#1e40af', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, background: '#f0f7ff' },
  td: { padding: '8px 12px', borderBottom: '1px solid #e2e8f0', color: '#334155' },
  row: { background: '#ffffff' },
  rowAlt: { background: '#f8fafc' },
  rowEven: { background: '#ffffff' },
  rowOdd: { background: '#f8fafc' },
  pagination: { display: 'flex', justifyContent: 'center', gap: 8, padding: 16, alignItems: 'center' },
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
