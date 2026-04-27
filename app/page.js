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
            <span style={styles.badge}>{summary?.scrape_date}</span>
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
            <div style={styles.infoIcon}>ð</div>
            <h3 style={styles.infoCardTitle}>Medication Catalog</h3>
            <p style={styles.infoCardText}>
              Browse every medication, dosage, and pharmacy combination available in the Fountain EHR portal.
              Filter by state, sex, program, medication, or pharmacy. Each row shows the drug name, dosage,
              frequency, dispensing pharmacy, med code, supply code, and payment plan.
            </p>
          </div>
          <div style={styles.infoCard}>
            <div style={styles.infoIcon}>â ï¸</div>
            <h3 style={styles.infoCardTitle}>Disparity Analysis</h3>
            <p style={styles.infoCardText}>
              Identifies medications where the pharmacy, med code, or supply code differs across states
              for the same drug + dosage + plan. This helps catch inconsistencies in routing, billing codes,
              or pharmacy assignments that could affect patient care or billing accuracy.
            </p>
          </div>
          <div style={styles.infoCard}>
            <div style={styles.infoIcon}>ð</div>
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
                      {label} {sortCol === key ? (sortDir === 'asc' ? 'â²' : 'â¼') : ''}
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
                â Prev
              </button>
              <span style={styles.pageInfo}>
                Page {page + 1} of {totalPages}
              </span>
              <button style={styles.pageBtn} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                Next â
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
        <p>Fountain Vitality â Provider Portal Data Scrape Â· {summary?.scrape_date}</p>
        <p style={styles.footerSub}>
          Data sourced from api.fountain.net/v1/portal/provider Â· {data.length.toLocaleString()} records across {summary?.states?.length} states
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
          <span style={styles.expandIcon}>{expanded ? 'â¼' : 'â¶'}</span>
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
          <span style={styles.msArrow}>{open ? 'â²' : 'â¼'}</span>
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
                <span style={styles.msCheck}>{selected.includes(o) ? 'â' : ''}</span>
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
  subt
