'use client'
import { useState, useEffect, useMemo } from 'react'

const PROGRAM_LABELS = {
  TRT: 'Testosterone (TRT)',
  'HRT-P': 'HRT - Progesterone',
  'HRT-F': 'HRT - Female',
  'HRT-T': 'HRT - Testosterone',
  'HRT-S': 'HRT - Skin',
  'HRT-A': 'HRT - Arousal',
  'HRT-THY': 'HRT - Thyroid',
  GLP: 'GLP-1 / Semaglutide',
  'ED-T': 'ED - Tadalafil',
  'ED-S': 'ED - Sildenafil',
  HCG: 'HCG',
  THY: 'Thyroid',
  AI: 'Aromatase Inhibitor',
  ENC: 'Enclomiphene',
  'HAIR-M': 'Hair Loss - Male',
  'HAIR-F': 'Hair Loss - Female',
  Async: 'Async / Add-on',
}

const CHANGELOG = [
  { date: '2026-04-27', notes: 'Added CSV export, column sorting, multi-select filters, and pharmacy comparison view' },
  { date: '2026-04-21', notes: 'Initial launch with medication catalog, disparity analysis, and quick lookup' },
]

export default function Dashboard() {
  const [data, setData] = useState([])
  const [disparities, setDisparities] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  // Filters (multi-select: arrays; single-select: string)
  const [stateFilter, setStateFilter] = useState([])
  const [sexFilter, setSexFilter] = useState('')
  const [programFilter, setProgramFilter] = useState([])
  const [medFilter, setMedFilter] = useState([])
  const [pharmacyFilter, setPharmacyFilter] = useState([])
  const [search, setSearch] = useState('')

  // Sorting
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  // View
  const [activeTab, setActiveTab] = useState('catalog')
  const [page, setPage] = useState(0)
  const [showChangelog, setShowChangelog] = useState(false)
  const PAGE_SIZE = 50

  useEffect(() => {
    Promise.all([
      fetch('/pharmacy_data.json').then(r => r.json()),
      fetch('/disparities.json').then(r => r.json()),
      fetch('/summary.json').then(r => r.json()),
    ]).then(([d, disp, s]) => {
      setData(d)
      setDisparities(disp)
      setSummary(s)
      setLoading(false)
    })
  }, [])

  const filtered = useMemo(() => {
    let f = data
    if (stateFilter.length) f = f.filter(r => stateFilter.includes(r.state))
    if (sexFilter) f = f.filter(r => r.sex === sexFilter)
    if (programFilter.length) f = f.filter(r => programFilter.includes(r.program))
    if (medFilter.length) f = f.filter(r => medFilter.includes(r.medication))
    if (pharmacyFilter.length) f = f.filter(r => pharmacyFilter.includes(r.pharmacy))
    if (search) {
      const s = search.toLowerCase()
      f = f.filter(r =>
        r.drug.toLowerCase().includes(s) ||
        r.medication.toLowerCase().includes(s) ||
        r.med_code.toLowerCase().includes(s) ||
        r.dosage.toLowerCase().includes(s)
      )
    }
    return f
  }, [data, stateFilter, sexFilter, programFilter, medFilter, pharmacyFilter, search])

  const sorted_filtered = useMemo(() => {
    if (!sortCol) return filtered
    const arr = [...filtered]
    arr.sort((a, b) => {
      const va = (a[sortCol] || '').toString().toLowerCase()
      const vb = (b[sortCol] || '').toString().toLowerCase()
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return arr
  }, [filtered, sortCol, sortDir])

  const pagedData = useMemo(() => {
    return sorted_filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  }, [sorted_filtered, page])

  function handleSort(col) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
    setPage(0)
  }

  function exportCSV() {
    const headers = ['State','Sex','Program','Medication','Drug','Dosage','Frequency','Pharmacy','Med Code','Supply Code','Plan']
    const keys = ['state','sex','program','medication','drug','dosage','frequency','pharmacy','med_code','supply_code','payment_plan']
    const csvRows = [headers.join(',')]
    sorted_filtered.forEach(r => {
      csvRows.push(keys.map(k => '"' + (r[k] || '').replace(/"/g, '""') + '"').join(','))
    })
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'fountain_pharmacy_export.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  // Get dynamic filter options based on current filters
  const filterOptions = useMemo(() => {
    let f = data
    const states = sortedSet(new Set(f.map(r => r.state)))
    const programs = sortedSet(new Set(f.map(r => r.program)))

    if (stateFilter.length) f = f.filter(r => stateFilter.includes(r.state))
    if (sexFilter) f = f.filter(r => r.sex === sexFilter)
    if (programFilter.length) f = f.filter(r => programFilter.includes(r.program))

    const meds = sortedSet(new Set(f.map(r => r.medication)))
    const pharmacies = sortedSet(new Set(f.map(r => r.pharmacy).filter(Boolean)))
    return { states, programs, meds, pharmacies }
  }, [data, stateFilter, sexFilter, programFilter])

  // Pharmacy comparison data
  const comparisonData = useMemo(() => {
    if (activeTab !== 'comparison') return []
    let f = data
    if (stateFilter.length) f = f.filter(r => stateFilter.includes(r.state))
    if (sexFilter) f = f.filter(r => r.sex === sexFilter)
    if (programFilter.length) f = f.filter(r => programFilter.includes(r.program))
    if (medFilter.length) f = f.filter(r => medFilter.includes(r.medication))
    if (search) {
      const s = search.toLowerCase()
      f = f.filter(r => r.drug.toLowerCase().includes(s) || r.medication.toLowerCase().includes(s))
    }

    // Group by drug+dosage+payment_plan
    const groups = {}
    f.forEach(r => {
      const key = `${r.drug}|${r.dosage}|${r.payment_plan}`
      if (!groups[key]) groups[key] = { drug: r.drug, dosage: r.dosage, payment_plan: r.payment_plan, pharmacies: {} }
      const ph = r.pharmacy || 'Unknown'
      if (!groups[key].pharmacies[ph]) groups[key].pharmacies[ph] = { states: new Set(), med_codes: new Set(), supply_codes: new Set() }
      groups[key].pharmacies[ph].states.add(r.state)
      groups[key].pharmacies[ph].med_codes.add(r.med_code)
      groups[key].pharmacies[ph].supply_codes.add(r.supply_code)
    })

    return Object.values(groups)
      .filter(g => Object.keys(g.pharmacies).length > 1)
      .sort((a, b) => a.drug.localeCompare(b.drug))
  }, [data, activeTab, stateFilter, sexFilter, programFilter, medFilter, search])

  // Disparity filtering
  const filteredDisparities = useMemo(() => {
    let d = disparities
    if (sexFilter) d = d.filter(r => r.sex === sexFilter)
    if (search) {
      const s = search.toLowerCase()
      d = d.filter(r => r.drug.toLowerCase().includes(s) || r.dosage.toLowerCase().includes(s))
    }
    return d
  }, [disparities, sexFilter, search])

  function resetFilters() {
    setStateFilter([])
    setSexFilter('')
    setProgramFilter([])
    setMedFilter([])
    setPharmacyFilter([])
    setSearch('')
    setSortCol(null)
    setSortDir('asc')
    setPage(0)
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
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div>
            <h1 style={styles.title}>Fountain Pharmacy Dashboard</h1>
            <p style={styles.subtitle}>
              Medication catalog, pharmacy routing, and state-by-state disparity analysis
            </p>
          </div>
          <div style={styles.headerMeta}>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <span style={{ ...styles.badge, cursor: 'pointer' }} onClick={() => setShowChangelog(!showChangelog)}>
                Updated {summary?.scrape_date ? new Date(summary.scrape_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '\u2014'} {showChangelog ? '\u25B2' : '\u25BC'}
              </span>
              {showChangelog && (
                <div style={styles.changelogDropdown}>
                  <div style={styles.changelogTitle}>What&apos;s New</div>
                  {CHANGELOG.map((entry, i) => (
                    <div key={i} style={styles.changelogEntry}>
                      <div style={styles.changelogDate}>{new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                      <div style={styles.changelogNotes}>{entry.notes}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <span style={styles.badgeGreen}>{data.length.toLocaleString()} records</span>
            <span style={styles.badgeAmber}>{disparities.length} disparities</span>
          </div>
        </div>
      </header>

      {/* How it works */}
      <section style={styles.infoSection}>
        <h2 style={styles.infoTitle}>How This Dashboard Works</h2>
        <div style={styles.infoGrid}>
          <div style={styles.infoCard}>
            <div style={styles.infoIcon}>{'\u{1F4CB}'}</div>
            <h3 style={styles.infoCardTitle}>Medication Catalog</h3>
            <p style={styles.infoCardText}>
              Browse every medication, dosage, and pharmacy combination available in the Fountain EHR portal.
              Filter by state, sex, program, medication, or pharmacy. Each row shows the drug name, dosage,
              frequency, dispensing pharmacy, med code, supply code, and payment plan.
            </p>
          </div>
          <div style={styles.infoCard}>
            <div style={styles.infoIcon}>{'\u26A0\uFE0F'}</div>
            <h3 style={styles.infoCardTitle}>Disparity Analysis</h3>
            <p style={styles.infoCardText}>
              Identifies medications where the pharmacy, med code, or supply code differs across states
              for the same drug + dosage + plan. This helps catch inconsistencies in routing, billing codes,
              or pharmacy assignments that could affect patient care or billing accuracy.
            </p>
          </div>
          <div style={styles.infoCard}>
            <div style={styles.infoIcon}>{'\u{1F50D}'}</div>
            <h3 style={styles.infoCardTitle}>Filters &amp; Search</h3>
            <p style={styles.infoCardText}>
              Use the dropdowns to narrow by state, sex, program type, specific medication, or pharmacy.
              The search box does a free-text search across drug names, medication names, med codes,
              and dosages. All filters combine (AND logic). Click &ldquo;Reset All&rdquo; to clear.
            </p>
          </div>
        </div>
      </section>

      {/* Summary stats */}
      <section style={styles.statsRow}>
        <StatCard label="States" value={summary?.states?.length || 0} />
        <StatCard label="Programs" value={summary?.programs?.length || 0} />
        <StatCard label="Medications" value={summary?.medications?.length || 0} />
        <StatCard label="Pharmacies" value={summary?.pharmacies?.length || 0} />
        <StatCard label="Disparities" value={disparities.length} alert />
      </section>

      {/* Tab switcher */}
      <div style={styles.tabRow}>
        <button
          style={activeTab === 'catalog' ? styles.tabActive : styles.tab}
          onClick={() => { setActiveTab('catalog'); setPage(0) }}
        >
          Medication Catalog
        </button>
        <button
          style={activeTab === 'comparison' ? styles.tabActive : styles.tab}
          onClick={() => { setActiveTab('comparison'); setPage(0) }}
        >
          Pharmacy Comparison
        </button>
        <button
          style={activeTab === 'disparities' ? styles.tabActive : styles.tab}
          onClick={() => { setActiveTab('disparities'); setPage(0) }}
        >
          Disparity Analysis ({disparities.length})
        </button>
      </div>

      {/* Filters */}
      <section style={styles.filterSection}>
        <div style={styles.filterGrid}>
          <MultiSelect label="State" selected={stateFilter} onChange={v => { setStateFilter(v); setPage(0) }}
            options={filterOptions.states} />
          <FilterSelect label="Sex" value={sexFilter} onChange={v => { setSexFilter(v); setPage(0) }}
            options={['male', 'female']} />
          <MultiSelect label="Program" selected={programFilter} onChange={v => { setProgramFilter(v); setPage(0); setMedFilter([]) }}
            options={filterOptions.programs} labelMap={PROGRAM_LABELS} />
          <MultiSelect label="Medication" selected={medFilter} onChange={v => { setMedFilter(v); setPage(0) }}
            options={filterOptions.meds} />
          <MultiSelect label="Pharmacy" selected={pharmacyFilter} onChange={v => { setPharmacyFilter(v); setPage(0) }}
            options={filterOptions.pharmacies} />
          <div style={styles.filterItem}>
            <label style={styles.filterLabel}>Search</label>
            <input
              style={styles.input}
              type="text"
              placeholder="Drug, med code, dosage..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0) }}
            />
          </div>
        </div>
        <div style={styles.filterActions}>
          <span style={styles.resultCount}>{filtered.length.toLocaleString()} results</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {activeTab === 'catalog' && (
              <button style={styles.exportBtn} onClick={exportCSV}>Export CSV</button>
            )}
            <button style={styles.resetBtn} onClick={resetFilters}>Reset All</button>
          </div>
        </div>
      </section>

      {/* Content */}
      {activeTab === 'catalog' ? (
        <section style={styles.tableSection}>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {[
                    ['state','State'],['sex','Sex'],['program','Program'],['medication','Medication'],
                    ['drug','Drug'],['dosage','Dosage'],['frequency','Frequency'],['pharmacy','Pharmacy'],
                    ['med_code','Med Code'],['supply_code','Supply Code'],['payment_plan','Plan']
                  ].map(([key, label]) => (
                    <th key={key} style={styles.thSort} onClick={() => handleSort(key)}>
                      {label} {sortCol === key ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedData.map((r, i) => (
                  <tr key={i} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
                    <td style={styles.td}>{r.state}</td>
                    <td style={styles.td}>
                      <span style={r.sex === 'male' ? styles.badgeMale : styles.badgeFemale}>{r.sex}</span>
                    </td>
                    <td style={styles.td}><span style={styles.programBadge}>{r.program}</span></td>
                    <td style={styles.tdMed}>{r.medication}</td>
                    <td style={styles.td}>{r.drug}</td>
                    <td style={styles.td}>{r.dosage}</td>
                    <td style={styles.td}>{r.frequency}</td>
                    <td style={styles.td}><span style={styles.pharmacyBadge}>{r.pharmacy}</span></td>
                    <td style={styles.tdMono}>{r.med_code}</td>
                    <td style={styles.tdMono}>{r.supply_code}</td>
                    <td style={styles.td}>{r.payment_plan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={styles.pagination}>
              <button style={styles.pageBtn} onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                {'\u2190'} Prev
              </button>
              <span style={styles.pageInfo}>
                Page {page + 1} of {totalPages}
              </span>
              <button style={styles.pageBtn} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                Next {'\u2192'}
              </button>
            </div>
          )}
        </section>
      ) : activeTab === 'comparison' ? (
        <section style={styles.compSection}>
          <p style={styles.dispIntro}>
            Medications dispensed by multiple pharmacies. Use filters above to narrow results.
            {comparisonData.length === 0 && ' No multi-pharmacy medications match current filters.'}
          </p>
          {comparisonData.map((g, i) => (
            <ComparisonCard key={i} g={g} />
          ))}
        </section>
      ) : (
        <section style={styles.dispSection}>
          <p style={styles.dispIntro}>
            Each card below represents a drug + dosage + payment plan combination where at least one attribute
            (pharmacy, med code, or supply code) differs across states. The state groups show which states
            share the same configuration.
          </p>
          {filteredDisparities.map((d, i) => (
            <DisparityCard key={i} d={d} />
          ))}
          {filteredDisparities.length === 0 && (
            <p style={styles.empty}>No disparities match current filters.</p>
          )}
        </section>
      )}

      {/* Footer */}
      <footer style={styles.footer}>
        <p>Fountain Vitality {'\u2014'} Provider Portal Data Scrape {'\u00B7'} {summary?.scrape_date}</p>
        <p style={styles.footerSub}>
          Data sourced from api.fountain.net/v1/portal/provider {'\u00B7'} {data.length.toLocaleString()} records across {summary?.states?.length} states
        </p>
      </footer>
    </div>
  )
}

function StatCard({ label, value, alert }) {
  return (
    <div style={{ ...styles.statCard, ...(alert ? styles.statCardAlert : {}) }}>
      <div style={alert ? styles.statValueAlert : styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  )
}

function FilterSelect({ label, value, onChange, options, labelMap }) {
  return (
    <div style={styles.filterItem}>
      <label style={styles.filterLabel}>{label}</label>
      <select style={styles.select} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">All {label}s</option>
        {options.map(o => (
          <option key={o} value={o}>{labelMap?.[o] || o}</option>
        ))}
      </select>
    </div>
  )
}

function DisparityCard({ d }) {
  const [expanded, setExpanded] = useState(false)
  const typeColors = { pharmacy: '#e74c3c', med_code: '#e67e22', supply_code: '#8e44ad' }

  return (
    <div style={styles.dispCard}>
      <div style={styles.dispHeader} onClick={() => setExpanded(!expanded)}>
        <div>
          <span style={styles.dispDrug}>{d.drug}</span>
          <span style={styles.dispDosage}>{d.dosage}</span>
          <span style={d.sex === 'male' ? styles.badgeMale : styles.badgeFemale}>{d.sex}</span>
          <span style={styles.dispPlan}>{d.payment_plan}</span>
        </div>
        <div style={styles.dispTypes}>
          {d.disparity_types.map(t => (
            <span key={t} style={{ ...styles.dispTypeBadge, backgroundColor: typeColors[t] || '#555' }}>
              {t.replace('_', ' ')}
            </span>
          ))}
          <span style={styles.expandIcon}>{expanded ? '\u25BC' : '\u25B6'}</span>
        </div>
      </div>

      <div style={styles.dispSummary}>
        {d.unique_pharmacies.length > 1 && (
          <div style={styles.dispDetail}>
            <strong>Pharmacies:</strong> {d.unique_pharmacies.join(' vs ')}
          </div>
        )}
        {d.unique_med_codes.length > 1 && (
          <div style={styles.dispDetail}>
            <strong>Med Codes:</strong> {d.unique_med_codes.join(', ')}
          </div>
        )}
        {d.unique_supply_codes.length > 1 && (
          <div style={styles.dispDetail}>
            <strong>Supply Codes:</strong> {d.unique_supply_codes.join(', ')}
          </div>
        )}
        <div style={styles.dispDetail}>
          <strong>Affected states:</strong> {d.state_count}
        </div>
      </div>

      {expanded && d.state_groups && (
        <div style={styles.stateGroups}>
          <p style={styles.stateGroupTitle}>State groupings:</p>
          {d.state_groups.map((g, i) => (
            <div key={i} style={styles.stateGroup}>
              <div style={styles.stateGroupVals}>
                {g.values.pharmacy && <span><strong>Pharmacy:</strong> {g.values.pharmacy}</span>}
                {g.values.med_code && <span style={{ marginLeft: 12 }}><strong>Med Code:</strong> {g.values.med_code}</span>}
                {g.values.supply_code && <span style={{ marginLeft: 12 }}><strong>Supply:</strong> {g.values.supply_code}</span>}
              </div>
              <div style={styles.stateList}>
                {g.states.map(s => (
                  <span key={s} style={styles.stateChip}>{s}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MultiSelect({ label, selected, onChange, options, labelMap }) {
  const [open, setOpen] = useState(false)
  const ref = { current: null }

  function toggle(val) {
    if (selected.includes(val)) {
      onChange(selected.filter(v => v !== val))
    } else {
      onChange([...selected, val])
    }
  }

  return (
    <div style={styles.filterItem}>
      <label style={styles.filterLabel}>{label}</label>
      <div style={styles.msContainer}>
        <div style={styles.msInput} onClick={() => setOpen(!open)}>
          {selected.length === 0
            ? <span style={styles.msPlaceholder}>All {label}s</span>
            : <span style={styles.msChips}>{selected.map(v => (
                <span key={v} style={styles.msChip}>
                  {labelMap?.[v] || v}
                  <span style={styles.msChipX} onClick={e => { e.stopPropagation(); toggle(v) }}>&times;</span>
                </span>
              ))}</span>
          }
          <span style={styles.msArrow}>{open ? '\u25B2' : '\u25BC'}</span>
        </div>
        {open && (
          <div style={styles.msDropdown}>
            {selected.length > 0 && (
              <div style={styles.msOption} onClick={() => { onChange([]); setOpen(false) }}>
                <em>Clear all</em>
              </div>
            )}
            {options.map(o => (
              <div key={o} style={{
                ...styles.msOption,
                ...(selected.includes(o) ? styles.msOptionSelected : {})
              }} onClick={() => toggle(o)}>
                <span style={styles.msCheck}>{selected.includes(o) ? '\u2713' : ''}</span>
                {labelMap?.[o] || o}
              </div>
            ))}
          </div>
        )}
        {open && <div style={styles.msOverlay} onClick={() => setOpen(false)} />}
      </div>
    </div>
  )
}

function ComparisonCard({ g }) {
  const pharmacyNames = Object.keys(g.pharmacies).sort()
  return (
    <div style={styles.compCard}>
      <div style={styles.compHeader}>
        <span style={styles.dispDrug}>{g.drug}</span>
        <span style={styles.dispDosage}>{g.dosage}</span>
        <span style={styles.dispPlan}>{g.payment_plan}</span>
        <span style={styles.compCount}>{pharmacyNames.length} pharmacies</span>
      </div>
      <div style={styles.compGrid}>
        {pharmacyNames.map(ph => {
          const info = g.pharmacies[ph]
          return (
            <div key={ph} style={styles.compPharmacy}>
              <div style={styles.compPhName}>{ph}</div>
              <div style={styles.compPhDetail}>
                <strong>{info.states.size}</strong> states: {[...info.states].sort().join(', ')}
              </div>
              <div style={styles.compPhDetail}>
                Med codes: {[...info.med_codes].join(', ')}
              </div>
              <div style={styles.compPhDetail}>
                Supply codes: {[...info.supply_codes].join(', ')}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function sortedSet(set) {
  return [...set].sort()
}

const styles = {
  container: { fontFamily: "'Inter', -apple-system, sans-serif", maxWidth: 1440, margin: '0 auto', background: '#f8f9fa', minHeight: '100vh' },
  // Loading
  loadingContainer: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' },
  spinner: { width: 40, height: 40, border: '4px solid #e0e0e0', borderTop: '4px solid #c0392b', borderRadius: '50%', animation: 'spin 1s linear infinite' },
  loadingText: { marginTop: 16, color: '#666', fontSize: 14 },
  // Header
  header: { background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', color: '#fff', padding: '32px 40px' },
  headerInner: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 },
  title: { fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: '#94a3b8', marginTop: 6 },
  headerMeta: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  badge: { padding: '4px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.1)', fontSize: 13, fontWeight: 500 },
  badgeGreen: { padding: '4px 12px', borderRadius: 6, background: 'rgba(39,174,96,0.2)', color: '#27ae60', fontSize: 13, fontWeight: 500 },
  badgeAmber: { padding: '4px 12px', borderRadius: 6, background: 'rgba(230,126,34,0.2)', color: '#e67e22', fontSize: 13, fontWeight: 500 },
  // Changelog
  changelogDropdown: { position: 'absolute', top: '110%', right: 0, background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: 16, minWidth: 320, zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' },
  changelogTitle: { fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 8 },
  changelogEntry: { marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.05)' },
  changelogDate: { fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  changelogNotes: { fontSize: 13, color: '#e2e8f0', lineHeight: 1.5 },
  // Info
  infoSection: { padding: '24px 40px' },
  infoTitle: { fontSize: 18, fontWeight: 600, color: '#1a1a2e', margin: '0 0 16px' },
  infoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 },
  infoCard: { background: '#fff', borderRadius: 10, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e8ecf0' },
  infoIcon: { fontSize: 24, marginBottom: 8 },
  infoCardTitle: { fontSize: 15, fontWeight: 600, margin: '0 0 8px', color: '#1a1a2e' },
  infoCardText: { fontSize: 13, color: '#555', lineHeight: 1.6, margin: 0 },
  // Stats
  statsRow: { display: 'flex', gap: 16, padding: '0 40px 24px', flexWrap: 'wrap' },
  statCard: { flex: '1 1 120px', background: '#fff', borderRadius: 10, padding: '16px 20px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e8ecf0' },
  statCardAlert: { border: '1px solid #e67e22', background: '#fef9f3' },
  statValue: { fontSize: 28, fontWeight: 700, color: '#1a1a2e' },
  statValueAlert: { fontSize: 28, fontWeight: 700, color: '#e67e22' },
  statLabel: { fontSize: 12, color: '#888', fontWeight: 500, textTransform: 'uppercase', marginTop: 4, letterSpacing: 0.5 },
  // Tabs
  tabRow: { display: 'flex', gap: 0, padding: '0 40px', borderBottom: '2px solid #e0e0e0' },
  tab: { padding: '12px 24px', background: 'none', border: 'none', fontSize: 14, fontWeight: 500, color: '#888', cursor: 'pointer', borderBottom: '2px solid transparent', marginBottom: -2 },
  tabActive: { padding: '12px 24px', background: 'none', border: 'none', fontSize: 14, fontWeight: 600, color: '#c0392b', cursor: 'pointer', borderBottom: '2px solid #c0392b', marginBottom: -2 },
  // Filters
  filterSection: { padding: '20px 40px' },
  filterGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 },
  filterItem: { display: 'flex', flexDirection: 'column', gap: 4 },
  filterLabel: { fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 },
  select: { padding: '8px 12px', borderRadius: 6, border: '1px solid #d0d5dd', fontSize: 13, background: '#fff', color: '#333', cursor: 'pointer' },
  input: { padding: '8px 12px', borderRadius: 6, border: '1px solid #d0d5dd', fontSize: 13, background: '#fff', color: '#333' },
  filterActions: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  resultCount: { fontSize: 13, color: '#666', fontWeight: 500 },
  resetBtn: { padding: '6px 16px', borderRadius: 6, border: '1px solid #d0d5dd', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#555' },
  exportBtn: { padding: '6px 16px', borderRadius: 6, border: '1px solid #27ae60', background: '#27ae60', fontSize: 13, cursor: 'pointer', color: '#fff', fontWeight: 500 },
  // Table
  tableSection: { padding: '0 40px 40px' },
  tableWrap: { overflowX: 'auto', borderRadius: 10, border: '1px solid #e0e0e0', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { padding: '10px 14px', textAlign: 'left', background: '#f1f3f5', borderBottom: '2px solid #e0e0e0', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#555', whiteSpace: 'nowrap' },
  thSort: { padding: '10px 14px', textAlign: 'left', background: '#f1f3f5', borderBottom: '2px solid #e0e0e0', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#555', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' },
  td: { padding: '8px 14px', borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap' },
  tdMed: { padding: '8px 14px', borderBottom: '1px solid #f0f0f0', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  tdMono: { padding: '8px 14px', borderBottom: '1px solid #f0f0f0', fontFamily: "'SF Mono', 'Consolas', monospace", fontSize: 12, color: '#c0392b', whiteSpace: 'nowrap' },
  trEven: { background: '#fff' },
  trOdd: { background: '#fafbfc' },
  // Badges
  badgeMale: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, background: '#eef2ff', color: '#4338ca', fontSize: 12, fontWeight: 500 },
  badgeFemale: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, background: '#fdf2f8', color: '#be185d', fontSize: 12, fontWeight: 500 },
  programBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, background: '#f0fdf4', color: '#166534', fontSize: 12, fontWeight: 500 },
  pharmacyBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, background: '#fff7ed', color: '#9a3412', fontSize: 12, fontWeight: 500 },
  // Pagination
  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '16px 0' },
  pageBtn: { padding: '6px 16px', borderRadius: 6, border: '1px solid #d0d5dd', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#333' },
  pageInfo: { fontSize: 13, color: '#666' },
  // Disparities
  dispSection: { padding: '0 40px 40px' },
  dispIntro: { fontSize: 14, color: '#555', lineHeight: 1.6, margin: '0 0 20px', maxWidth: 800 },
  dispCard: { background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', marginBottom: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  dispHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', cursor: 'pointer', flexWrap: 'wrap', gap: 8 },
  dispDrug: { fontSize: 15, fontWeight: 600, color: '#1a1a2e', marginRight: 8 },
  dispDosage: { fontSize: 14, color: '#555', marginRight: 8 },
  dispPlan: { fontSize: 12, color: '#888', padding: '2px 8px', background: '#f1f3f5', borderRadius: 4, marginLeft: 4 },
  dispTypes: { display: 'flex', gap: 6, alignItems: 'center' },
  dispTypeBadge: { display: 'inline-block', padding: '2px 10px', borderRadius: 4, color: '#fff', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 },
  expandIcon: { fontSize: 12, color: '#888', marginLeft: 8 },
  dispSummary: { padding: '0 20px 14px', display: 'flex', gap: 20, flexWrap: 'wrap' },
  dispDetail: { fontSize: 13, color: '#555' },
  stateGroups: { padding: '12px 20px', borderTop: '1px solid #f0f0f0', background: '#fafbfc' },
  stateGroupTitle: { fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', marginBottom: 12, marginTop: 0 },
  stateGroup: { marginBottom: 12 },
  stateGroupVals: { fontSize: 13, color: '#333', marginBottom: 6 },
  stateList: { display: 'flex', flexWrap: 'wrap', gap: 4 },
  stateChip: { padding: '2px 8px', borderRadius: 4, background: '#e8ecf0', fontSize: 12, color: '#555' },
  empty: { textAlign: 'center', color: '#888', padding: 40, fontSize: 14 },
  // MultiSelect
  msContainer: { position: 'relative' },
  msInput: { padding: '6px 10px', borderRadius: 6, border: '1px solid #d0d5dd', fontSize: 13, background: '#fff', color: '#333', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 34, gap: 4, flexWrap: 'wrap' },
  msPlaceholder: { color: '#999' },
  msChips: { display: 'flex', gap: 3, flexWrap: 'wrap', flex: 1 },
  msChip: { display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 7px', borderRadius: 4, background: '#e8ecf0', fontSize: 11, fontWeight: 500, color: '#333', whiteSpace: 'nowrap' },
  msChipX: { cursor: 'pointer', fontWeight: 700, fontSize: 13, lineHeight: 1, color: '#888', marginLeft: 2 },
  msArrow: { fontSize: 9, color: '#888', flexShrink: 0, marginLeft: 4 },
  msDropdown: { position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #d0d5dd', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: 240, overflowY: 'auto', marginTop: 4 },
  msOption: { padding: '7px 12px', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 },
  msOptionSelected: { background: '#f0f7ff', color: '#1a56db' },
  msCheck: { width: 16, fontSize: 12, color: '#1a56db' },
  msOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 },
  // Comparison
  compSection: { padding: '0 40px 40px' },
  compCard: { background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', marginBottom: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  compHeader: { display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px', borderBottom: '1px solid #f0f0f0', flexWrap: 'wrap' },
  compCount: { fontSize: 12, color: '#fff', padding: '2px 10px', borderRadius: 4, background: '#3498db', fontWeight: 600 },
  compGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 0 },
  compPharmacy: { padding: '14px 20px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0' },
  compPhName: { fontSize: 14, fontWeight: 600, color: '#9a3412', marginBottom: 6 },
  compPhDetail: { fontSize: 12, color: '#555', lineHeight: 1.8 },
  // Footer
  footer: { padding: '24px 40px', borderTop: '1px solid #e0e0e0', textAlign: 'center', color: '#888', fontSize: 13 },
  footerSub: { fontSize: 11, color: '#aaa', marginTop: 4 },
}
