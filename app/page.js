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

  // Filters
  const [stateFilter, setStateFilter] = useState('')
  const [sexFilter, setSexFilter] = useState('')
  const [programFilter, setProgramFilter] = useState('')
  const [medFilter, setMedFilter] = useState('')
  const [pharmacyFilter, setPharmacyFilter] = useState('')
  const [search, setSearch] = useState('')

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
    if (stateFilter) f = f.filter(r => r.state === stateFilter)
    if (sexFilter) f = f.filter(r => r.sex === sexFilter)
    if (programFilter) f = f.filter(r => r.program === programFilter)
    if (medFilter) f = f.filter(r => r.medication === medFilter)
    if (pharmacyFilter) f = f.filter(r => r.pharmacy === pharmacyFilter)
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

  const pagedData = useMemo(() => {
    return filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  }, [filtered, page])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  // Get dynamic filter options based on current filters
  const filterOptions = useMemo(() => {
    let f = data
    const states = sorted(new Set(f.map(r => r.state)))
    const programs = sorted(new Set(f.map(r => r.program)))

    if (stateFilter) f = f.filter(r => r.state === stateFilter)
    if (sexFilter) f = f.filter(r => r.sex === sexFilter)
    if (programFilter) f = f.filter(r => r.program === programFilter)

    const meds = sorted(new Set(f.map(r => r.medication)))
    const pharmacies = sorted(new Set(f.map(r => r.pharmacy).filter(Boolean)))
    return { states, programs, meds, pharmacies }
  }, [data, stateFilter, sexFilter, programFilter])

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
    setStateFilter('')
    setSexFilter('')
    setProgramFilter('')
    setMedFilter('')
    setPharmacyFilter('')
    setSearch('')
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
          style={activeTab === 'disparities' ? styles.tabActive : styles.tab}
          onClick={() => { setActiveTab('disparities'); setPage(0) }}
        >
          Disparity Analysis ({disparities.length})
        </button>
      </div>

      {/* Filters */}
      <section style={styles.filterSection}>
        <div style={styles.filterGrid}>
          <FilterSelect label="State" value={stateFilter} onChange={v => { setStateFilter(v); setPage(0) }}
            options={filterOptions.states} />
          <FilterSelect label="Sex" value={sexFilter} onChange={v => { setSexFilter(v); setPage(0) }}
            options={['male', 'female']} />
          <FilterSelect label="Program" value={programFilter} onChange={v => { setProgramFilter(v); setPage(0); setMedFilter('') }}
            options={filterOptions.programs} labelMap={PROGRAM_LABELS} />
          <FilterSelect label="Medication" value={medFilter} onChange={v => { setMedFilter(v); setPage(0) }}
            options={filterOptions.meds} />
          <FilterSelect label="Pharmacy" value={pharmacyFilter} onChange={v => { setPharmacyFilter(v); setPage(0) }}
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
          <button style={styles.resetBtn} onClick={resetFilters}>Reset All</button>
        </div>
      </section>

      {/* Content */}
      {activeTab === 'catalog' ? (
        <section style={styles.tableSection}>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>State</th>
                  <th style={styles.th}>Sex</th>
                  <th style={styles.th}>Program</th>
                  <th style={styles.th}>Medication</th>
                  <th style={styles.th}>Drug</th>
                  <th style={styles.th}>Dosage</th>
                  <th style={styles.th}>Frequency</th>
                  <th style={styles.th}>Pharmacy</th>
                  <th style={styles.th}>Med Code</th>
                  <th style={styles.th}>Supply Code</th>
                  <th style={styles.th}>Plan</th>
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

function sorted(set) {
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
  // Table
  tableSection: { padding: '0 40px 40px' },
  tableWrap: { overflowX: 'auto', borderRadius: 10, border: '1px solid #e0e0e0', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { padding: '10px 14px', textAlign: 'left', background: '#f1f3f5', borderBottom: '2px solid #e0e0e0', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#555', whiteSpace: 'nowrap' },
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
  // Footer
  footer: { padding: '24px 40px', borderTop: '1px solid #e0e0e0', textAlign: 'center', color: '#888', fontSize: 13 },
  footerSub: { fontSize: 11, color: '#aaa', marginTop: 4 },
}

