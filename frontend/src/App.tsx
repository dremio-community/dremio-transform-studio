import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { v4 as uuidv4 } from 'uuid'
import { Save, Zap, Code2, Loader2, Layers, CalendarClock, Upload, Power, BarChart2, Clock, User, LogOut, Users, Bell, GitBranch, GitMerge, FlaskConical, Sprout, FileText, Activity, GitPullRequest, SlidersHorizontal, Link, Radio, ShieldCheck, Share2, KeyRound, Package, LayoutTemplate, ScrollText, Bot } from 'lucide-react'
import { IconAdd, IconCheckCircle, IconClose, IconCopy, IconDatasetDownload, IconDatasetRun, IconDelete, IconEdit, IconEntityNamespace, IconErrorCircle, IconRefresh, IconSearch, IconSettings } from './components/icons'
import clsx from 'clsx'
import { Button } from './components/ui/button'
import { Badge } from './components/ui/badge'

import type { Pipeline, TransformStep, TransformType, PreviewResult, ExecuteResult, IcebergCatalog, PipelineParameter, PipelineTest } from './types'
import {
  fetchPipelines,
  createPipeline,
  savePipeline,
  deletePipeline,
  previewPipeline,
  executePipeline,
  fetchTableSchema,
  generateSql,
  fetchIcebergCatalogs,
  deleteIcebergCatalog,
  testIcebergCatalog,
  duplicatePipeline,
  exportPipeline,
  importPipeline,
  fetchIsDesktop,
  quitApp,
  fetchPipelineRuns,
  fetchAuthStatus,
  fetchCurrentUser,
  logout,
  fetchUsers,
  createUser,
  updateUserRole,
  deleteUser,
  getToken,
  clearToken,
  exportDocs,
  exportDbt,
  setApprovalRequired,
  submitPipelineReview,
  fetchNamespaces,
  globalSearch,
  fetchPipelineFolders,
} from './api/client'
import type { PipelineRun, AuthUser, SearchResult } from './api/client'


import CatalogBrowser from './components/CatalogBrowser'
import CustomSqlEditor from './components/CustomSqlEditor'
import AlertsPage from './components/AlertsPage'
import AuditLogPage from './components/AuditLogPage'
import DataQualityHub from './components/DataQualityHub'
import IngestionHub from './components/IngestionHub'
import AgentPanel from './components/AgentPanel'
import DataProfilePanel from './components/DataProfilePanel'
import IcebergCatalogBrowser from './components/IcebergCatalogBrowser'
import PipelineBuilder from './components/PipelineBuilder'
import LineageView from './components/LineageView'
import TransformLibrary from './components/TransformLibrary'
import TransformConfig from './components/TransformConfig'
import PreviewTable from './components/PreviewTable'
import SqlPreview from './components/SqlPreview'
import AddCatalogModal from './components/AddCatalogModal'
import ConnectionSettingsModal from './components/ConnectionSettingsModal'
import VersionHistory from './components/VersionHistory'
import ScheduleModal from './components/ScheduleModal'
import LoginModal from './components/LoginModal'
import ParametersPanel from './components/ParametersPanel'
import RunWithParamsModal from './components/RunWithParamsModal'
import ShareModal from './components/ShareModal'
import MyCredentialsModal from './components/MyCredentialsModal'
import DbtImportModal from './components/DbtImportModal'
import TemplatesModal from './components/TemplatesModal'
import WebhookPanel from './components/WebhookPanel'
import TestsPanel from './components/TestsPanel'
import DependencyPanel from './components/DependencyPanel'
import ExposuresPanel from './components/ExposuresPanel'
import PipelineDagView from './components/PipelineDagView'
import DagRunModal from './components/DagRunModal'
import SeedModal from './components/SeedModal'
import EnvironmentSwitcher from './components/EnvironmentSwitcher'
import Tooltip from './components/Tooltip'
import DashboardView from './components/DashboardView'
import ApprovalPanel, { SubmitReviewButton } from './components/ApprovalPanel'

type RightPanelMode = 'library' | 'config' | 'history' | 'runs' | 'params' | 'webhook' | 'tests' | 'deps' | 'hooks' | 'exposures' | 'approvals'
type SidebarTab = 'dremio' | 'iceberg'
type CenterView = 'pipeline' | 'lineage'

export default function App() {
  const qc = useQueryClient()

  // ── Auth state ────────────────────────────────────────────────────────────
  const [authEnabled, setAuthEnabled] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [showLogin, setShowLogin] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showManageUsers, setShowManageUsers] = useState(false)
  const [showMyCredentials, setShowMyCredentials] = useState(false)
  const [showDbtImport, setShowDbtImport] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [shareModalPipelineId, setShareModalPipelineId] = useState<string | null>(null)

  // ── State ─────────────────────────────────────────────────────────────────
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null)
  const [localSteps, setLocalSteps] = useState<TransformStep[]>([])
  const [localName, setLocalName] = useState('Untitled Pipeline')
  const [localDescription, setLocalDescription] = useState('')
  const [localSourceTable, setLocalSourceTable] = useState('')
  const [localOutputTable, setLocalOutputTable] = useState('')
  const [localOutputMode, setLocalOutputMode] = useState<string>('preview')
  const [localVersion, setLocalVersion] = useState<number>(1)
  const [localParameters, setLocalParameters] = useState<PipelineParameter[]>([])
  const [localWebhookToken, setLocalWebhookToken] = useState<string | undefined>(undefined)
  // dbt-style features
  const [localTests, setLocalTests] = useState<PipelineTest[]>([])
  const [localDeps, setLocalDeps] = useState<string[]>([])
  const [localIncrementalStrategy, setLocalIncrementalStrategy] = useState<string>('append')
  const [localIncrementalKey, setLocalIncrementalKey] = useState<string>('')
  const [localMicrobatchWindow, setLocalMicrobatchWindow] = useState<string>('1day')
  // SCD Type 2 fields
  const [localScd2Key, setLocalScd2Key] = useState<string>('')
  const [localScd2TrackedCols, setLocalScd2TrackedCols] = useState<string>('')
  // Execution hooks
  const [localPreHook, setLocalPreHook] = useState<string>('')
  const [localPostHook, setLocalPostHook] = useState<string>('')
  const [localLoadTriggerUrl, setLocalLoadTriggerUrl] = useState<string>('')
  const [localLoadTriggerJobId, setLocalLoadTriggerJobId] = useState<string>('')
  const [localCdcTriggerUrl, setLocalCdcTriggerUrl] = useState<string>('')
  const [localExposures, setLocalExposures] = useState<import('./types').Exposure[]>([])
  const [localApprovalRequired, setLocalApprovalRequired] = useState(false)
  const [localPendingApprovalId, setLocalPendingApprovalId] = useState<string | null>(null)
  // Split output path into namespace (dropdown) + table name (text)
  const [outputNamespace, setOutputNamespace] = useState('')
  const [outputTableName, setOutputTableName] = useState('')
  const [localScd2EffFrom, setLocalScd2EffFrom] = useState<string>('effective_from')
  const [localScd2EffTo, setLocalScd2EffTo] = useState<string>('effective_to')
  const [localScd2IsCurrent, setLocalScd2IsCurrent] = useState<string>('is_current')
  const [showDagView, setShowDagView] = useState(false)
  const [showDagRunModal, setShowDagRunModal] = useState(false)
  const [showSeedModal, setShowSeedModal] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [rightPanel, setRightPanel] = useState<RightPanelMode>('config')
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)

  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null)
  const [executeResult, setExecuteResult] = useState<ExecuteResult | null>(null)
  const [sqlText, setSqlText] = useState('')
  const [bottomPanel, setBottomPanel] = useState<'preview' | 'execute' | 'sql' | null>(null)

  // Param modal state
  const [showParamModal, setShowParamModal] = useState<'preview' | 'execute' | null>(null)

  const [isDirty, setIsDirty] = useState(false)
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [centerView, setCenterView] = useState<CenterView>('pipeline')
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('dremio')
  const [showAddCatalog, setShowAddCatalog] = useState(false)
  const [showConnectionSettings, setShowConnectionSettings] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState<'connection' | 'notifications' | 'storage' | 'security' | 'sso' | 'mcp' | 'agent'>('connection')
  const [catalogKey, setCatalogKey] = useState(0)
  const [showSchedule, setShowSchedule] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [showQuitConfirm, setShowQuitConfirm] = useState(false)
  const [quitting, setQuitting] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [pipelineSearch, setPipelineSearch] = useState('')
  const [customSqlEditorStepId, setCustomSqlEditorStepId] = useState<string | null>(null)
  const [showAlerts, setShowAlerts] = useState(false)
  const [showDashboard, setShowDashboard] = useState(false)
  const [showDqHub, setShowDqHub] = useState(false)
  const [showIngestionHub, setShowIngestionHub] = useState(false)
  const [showAgentPanel, setShowAgentPanel] = useState(false)
  const [showDupeNameWarning, setShowDupeNameWarning] = useState(false)

  // ── Folders & tags state ──────────────────────────────────────────────────
  const [pipelineFolder, setPipelineFolder] = useState<string>('')
  const [pipelineTags, setPipelineTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState<string>('')
  const [allFolders, setAllFolders] = useState<string[]>([])
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null)
  const [showAuditLog, setShowAuditLog] = useState(false)

  // ── Auth initialization ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Pick up SSO token from URL (after IdP callback redirect)
      const urlParams = new URLSearchParams(window.location.search)
      const ssoToken = urlParams.get('sso_token')
      const ssoError = urlParams.get('sso_error')
      if (ssoToken) {
        localStorage.setItem('ts_token', ssoToken)
        window.history.replaceState({}, '', window.location.pathname)
      }
      if (ssoError) {
        window.history.replaceState({}, '', window.location.pathname)
        // Show error briefly — it will surface through the normal auth flow below
        console.error('SSO error:', ssoError)
      }

      try {
        const status = await fetchAuthStatus()
        if (cancelled) return
        setAuthEnabled(status.auth_enabled)
        if (status.auth_enabled) {
          const token = getToken()
          if (token) {
            try {
              const user = await fetchCurrentUser()
              if (!cancelled) {
                setCurrentUser(user)
                setShowLogin(false)
              }
            } catch {
              if (!cancelled) {
                clearToken()
                setShowLogin(true)
              }
            }
          } else {
            if (!cancelled) setShowLogin(true)
          }
        }
      } catch {
        // If auth status fails, proceed without auth
      } finally {
        if (!cancelled) setAuthChecked(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Listen for ts:unauthorized events
  useEffect(() => {
    const handler = () => {
      setCurrentUser(null)
      if (authEnabled) setShowLogin(true)
    }
    window.addEventListener('ts:unauthorized', handler)
    return () => window.removeEventListener('ts:unauthorized', handler)
  }, [authEnabled])

  // Global search — keyboard shortcut ⌘K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowSearch(s => !s)
        if (!showSearch) { setSearchQuery(''); setSearchResults([]) }
      }
      if (e.key === 'Escape') setShowSearch(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showSearch])

  const handleSearch = async (q: string) => {
    setSearchQuery(q)
    if (q.trim().length < 2) { setSearchResults([]); return }
    setSearchLoading(true)
    try {
      const res = await globalSearch(q)
      setSearchResults(res)
    } finally {
      setSearchLoading(false)
    }
  }

  const handleSearchSelect = (result: SearchResult) => {
    const p = pipelines?.find(pl => pl.id === result.pipeline_id)
    if (p) { loadPipeline(p) }
    setShowSearch(false)
    setSearchQuery('')
    setSearchResults([])
  }

  const handleLogin = (user: { id: string; username: string; is_admin: boolean; role?: string }) => {
    setCurrentUser({
      user_id: user.id,
      username: user.username,
      is_admin: user.is_admin,
      role: (user.role as AuthUser['role']) ?? (user.is_admin ? 'admin' : 'editor'),
    })
    setShowLogin(false)
    qc.invalidateQueries({ queryKey: ['pipelines'] })
  }

  const handleLogout = async () => {
    await logout()
    setCurrentUser(null)
    setShowUserMenu(false)
    if (authEnabled) setShowLogin(true)
  }

  // ── Permission helpers ────────────────────────────────────────────────────
  const canEditPipeline = (p: Pipeline): boolean => {
    if (!authEnabled) return true
    if (currentUser?.role === 'admin') return true
    if (currentUser && p.user_id === currentUser.user_id) return true
    if (p.shared_access === 'editor') return true
    return false
  }

  const canDeletePipeline = (p: Pipeline): boolean => {
    if (!authEnabled) return true
    if (currentUser?.role === 'admin') return true
    if (currentUser && p.user_id === currentUser.user_id) return true
    return false
  }

  const canSharePipeline = (p: Pipeline): boolean => {
    if (!authEnabled) return false  // sharing only makes sense when auth is on
    if (currentUser?.role === 'admin') return true
    if (currentUser && p.user_id === currentUser.user_id) return true
    return false
  }

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: isDesktop = false } = useQuery({
    queryKey: ['is-desktop'],
    queryFn: fetchIsDesktop,
    staleTime: Infinity, // never changes during a session
  })

  const { data: pipelines = [] } = useQuery({
    queryKey: ['pipelines'],
    queryFn: async () => {
      const results = await fetchPipelines()
      fetchPipelineFolders().then(setAllFolders).catch(() => {})
      return results
    },
  })

  const { data: sourceSchema = [] } = useQuery({
    queryKey: ['schema', localSourceTable],
    queryFn: () => fetchTableSchema(localSourceTable),
    enabled: localSourceTable.length > 0,
  })

  // Namespaces for output folder dropdown
  const { data: namespaces = [] } = useQuery({
    queryKey: ['namespaces'],
    queryFn: fetchNamespaces,
    staleTime: 60000,
  })

  // When namespaces load (or output table changes), split the full path into
  // top-level space (dropdown) + subpath (free text).
  // Match longest namespace prefix so "My Space" doesn't clash with "My Space.folder".
  useEffect(() => {
    if (!localOutputTable || namespaces.length === 0) return
    // Already split by the user — don't overwrite
    if (outputNamespace || outputTableName) return

    const match = namespaces
      .filter(ns => localOutputTable === ns || localOutputTable.startsWith(ns + '.'))
      .sort((a, b) => b.length - a.length)[0]   // longest match wins

    if (match) {
      setOutputNamespace(match)
      setOutputTableName(localOutputTable.slice(match.length + 1))  // strip "ns."
    } else {
      // No namespace match — treat whole value as subpath
      setOutputNamespace('')
      setOutputTableName(localOutputTable)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namespaces, localOutputTable])

  const { data: icebergCatalogs = [] } = useQuery({
    queryKey: ['iceberg-catalogs'],
    queryFn: fetchIcebergCatalogs,
  })

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: createPipeline,
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['pipelines'] })
      loadPipeline(p)
    },
    onError: (e: Error) => flash('err', e.message),
  })

  const saveMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof savePipeline>[1] }) =>
      savePipeline(id, data),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['pipelines'] })
      loadPipeline(p)
      setIsDirty(false)
      flash('ok', 'Saved')
    },
  })

  const previewMut = useMutation({
    mutationFn: ({ id, paramValues }: { id: string; paramValues?: Record<string, string> }) =>
      previewPipeline(id, paramValues),
    onSuccess: (r) => { setPreviewResult(r); setBottomPanel('preview') },
    onError: (e: Error) => flash('err', e.message),
  })

  const executeMut = useMutation({
    mutationFn: ({ id, paramValues }: { id: string; paramValues?: Record<string, string> }) =>
      executePipeline(
        id, paramValues, localOutputTable, localOutputMode,
        localOutputMode === 'incremental' ? localIncrementalStrategy : undefined,
        localOutputMode === 'incremental' ? localIncrementalKey : undefined,
        localOutputMode === 'scd2' ? localScd2Key : undefined,
        localOutputMode === 'scd2' ? localScd2TrackedCols.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        localOutputMode === 'scd2' ? localScd2EffFrom : undefined,
        localOutputMode === 'scd2' ? localScd2EffTo : undefined,
        localOutputMode === 'scd2' ? localScd2IsCurrent : undefined,
        localOutputMode === 'incremental' && localIncrementalStrategy === 'microbatch' ? localMicrobatchWindow : undefined,
      ),
    onSuccess: (r) => { setExecuteResult(r); setBottomPanel('execute') },
    onError: (e: Error) => flash('err', e.message),
  })

  const deleteCatalogMut = useMutation({
    mutationFn: deleteIcebergCatalog,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['iceberg-catalogs'] }),
  })

  const renameMut = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      // Fetch current pipeline steps so we don't overwrite them
      const current = pipelines.find((p) => p.id === id)
      const steps = id === activePipelineId ? localSteps : (current?.steps ?? [])
      return savePipeline(id, { name, steps })
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['pipelines'] })
      if (p.id === activePipelineId) { setLocalName(p.name) }
      setRenamingId(null)
    },
  })

  const deletePipelineMut = useMutation({
    mutationFn: deletePipeline,
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['pipelines'] })
      if (id === activePipelineId) { handleNewPipeline() }
      setDeleteConfirmId(null)
    },
  })

  const duplicateMut = useMutation({
    mutationFn: duplicatePipeline,
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['pipelines'] })
      loadPipeline(p)
      flash('ok', `Duplicated as "${p.name}"`)
    },
    onError: (e: Error) => flash('err', e.message),
  })

  const importMut = useMutation({
    mutationFn: importPipeline,
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['pipelines'] })
      loadPipeline(p)
      flash('ok', `Imported "${p.name}"`)
    },
    onError: (e: Error) => flash('err', `Import failed: ${e.message}`),
  })

  // ── Helpers ───────────────────────────────────────────────────────────────
  const flash = (type: 'ok' | 'err', text: string) => {
    setStatusMsg({ type, text })
    setTimeout(() => setStatusMsg(null), 3000)
  }

  const loadPipeline = useCallback((p: Pipeline) => {
    setActivePipelineId(p.id)
    setLocalSteps(p.steps)
    setLocalName(p.name)
    setLocalDescription(p.description ?? '')
    setLocalSourceTable(p.source_table)
    setLocalOutputTable(p.output_table ?? '')
    setLocalOutputMode(p.output_mode)
    // Reset split fields — the useEffect below will re-split when namespaces are available
    setOutputNamespace('')
    setOutputTableName('')
    setLocalVersion(p.version)
    setLocalParameters(p.parameters ?? [])
    setLocalWebhookToken(p.webhook_token)
    setLocalTests(p.tests ?? [])
    setLocalDeps(p.dependencies ?? [])
    setLocalIncrementalStrategy(p.incremental_strategy ?? 'append')
    setLocalIncrementalKey(p.incremental_key ?? '')
    setLocalMicrobatchWindow(p.microbatch_window ?? '1day')
    setLocalScd2Key(p.scd2_key ?? '')
    setLocalScd2TrackedCols((p.scd2_tracked_columns ?? []).join(', '))
    setLocalScd2EffFrom(p.scd2_effective_from ?? 'effective_from')
    setLocalScd2EffTo(p.scd2_effective_to ?? 'effective_to')
    setLocalScd2IsCurrent(p.scd2_is_current ?? 'is_current')
    setLocalPreHook(p.pre_hook_sql ?? '')
    setLocalPostHook(p.post_hook_sql ?? '')
    setLocalLoadTriggerUrl(p.load_trigger_url ?? '')
    setLocalLoadTriggerJobId(p.load_trigger_job_id ?? '')
    setLocalCdcTriggerUrl(p.cdc_trigger_url ?? '')
    setLocalExposures(p.exposures ?? [])
    setLocalApprovalRequired(p.approval_required ?? false)
    setLocalPendingApprovalId(p.pending_approval_id ?? null)
    setPipelineFolder(p.folder ?? '')
    setPipelineTags(p.tags ?? [])
    setTagInput('')
    setSelectedStepId(null)
    setRightPanel('library')
    setPreviewResult(null)
    setExecuteResult(null)
    setBottomPanel(null)
    setIsDirty(false)
  }, [])

  const handleSelectTable = (fullName: string) => {
    if (!activePipelineId) {
      createMut.mutate({
        name: fullName.split('.').pop() ?? 'New Pipeline',
        source_table: fullName,
        steps: [],
      })
    } else {
      setLocalSourceTable(fullName)
      setIsDirty(true)
    }
  }

  const handleNewPipeline = () => {
    setActivePipelineId(null)
    setLocalSteps([])
    setLocalName('Untitled Pipeline')
    setLocalDescription('')
    setLocalSourceTable('')
    setLocalOutputTable('')
    setLocalOutputMode('preview')
    setLocalParameters([])
    setLocalWebhookToken(undefined)
    setLocalTests([])
    setLocalDeps([])
    setLocalIncrementalStrategy('append')
    setLocalIncrementalKey('')
    setLocalMicrobatchWindow('1day')
    setLocalScd2Key('')
    setLocalScd2TrackedCols('')
    setLocalScd2EffFrom('effective_from')
    setLocalScd2EffTo('effective_to')
    setLocalScd2IsCurrent('is_current')
    setLocalPreHook('')
    setLocalPostHook('')
    setLocalLoadTriggerUrl('')
    setLocalLoadTriggerJobId('')
    setLocalCdcTriggerUrl('')
    setLocalExposures([])
    setLocalApprovalRequired(false)
    setLocalPendingApprovalId(null)
    setPipelineFolder('')
    setPipelineTags([])
    setTagInput('')
    setOutputNamespace('')
    setOutputTableName('')
    setSelectedStepId(null)
    setRightPanel('library')
    setPreviewResult(null)
    setExecuteResult(null)
    setBottomPanel(null)
    setIsDirty(false)
  }

  const handleAddTransform = (tt: TransformType) => {
    const step: TransformStep = { id: uuidv4(), transform_type: tt.id, config: {}, label: tt.name }
    setLocalSteps((prev) => [...prev, step])
    setSelectedStepId(step.id)
    setRightPanel('config')
    setIsDirty(true)
    // Custom SQL: open the editor immediately
    if (tt.id === 'custom_sql') {
      setCustomSqlEditorStepId(step.id)
    }
  }

  const handleStepUpdate = (stepId: string, updates: Partial<TransformStep>) => {
    setLocalSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, ...updates } : s)))
    setIsDirty(true)
    setSqlText('')
  }

  const handleStepDelete = (stepId: string) => {
    setLocalSteps((prev) => prev.filter((s) => s.id !== stepId))
    if (selectedStepId === stepId) { setSelectedStepId(null); setRightPanel('library') }
    setIsDirty(true)
    setSqlText('')
  }

  const handleStepMove = (stepId: string, direction: 'up' | 'down') => {
    setLocalSteps((prev) => {
      const idx = prev.findIndex((s) => s.id === stepId)
      if (idx < 0) return prev
      const next = [...prev]
      const target = direction === 'up' ? idx - 1 : idx + 1
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
    setIsDirty(true)
    setSqlText('')
  }

  const handleReorder = (newSteps: TransformStep[]) => {
    setLocalSteps(newSteps)
    setIsDirty(true)
    setSqlText('')
  }

  const doSave = () => {
    if (!activePipelineId) {
      if (!localSourceTable) { flash('err', 'Select a source table first'); return }
      createMut.mutate({
        name: localName, description: localDescription || undefined,
        source_table: localSourceTable, steps: localSteps,
        output_table: localOutputTable || undefined, output_mode: localOutputMode,
        parameters: localParameters, dependencies: localDeps,
        incremental_strategy: localOutputMode === 'incremental' ? localIncrementalStrategy : undefined,
        incremental_key: localOutputMode === 'incremental' ? localIncrementalKey : undefined,
        microbatch_window: localOutputMode === 'incremental' && localIncrementalStrategy === 'microbatch' ? localMicrobatchWindow : undefined,
        tests: localTests,
        scd2_key: localOutputMode === 'scd2' ? localScd2Key : undefined,
        scd2_tracked_columns: localOutputMode === 'scd2' ? localScd2TrackedCols.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        scd2_effective_from: localOutputMode === 'scd2' ? localScd2EffFrom : undefined,
        scd2_effective_to: localOutputMode === 'scd2' ? localScd2EffTo : undefined,
        scd2_is_current: localOutputMode === 'scd2' ? localScd2IsCurrent : undefined,
        pre_hook_sql: localPreHook || undefined,
        post_hook_sql: localPostHook || undefined,
        load_trigger_url: localLoadTriggerUrl || undefined,
        load_trigger_job_id: localLoadTriggerJobId || undefined,
        cdc_trigger_url: localCdcTriggerUrl || undefined,
        exposures: localExposures,
        folder: pipelineFolder || undefined,
        tags: pipelineTags.length > 0 ? pipelineTags : undefined,
      })
      return
    }
    saveMut.mutate({
      id: activePipelineId, data: {
        name: localName, description: localDescription || undefined,
        steps: localSteps, output_table: localOutputTable || undefined,
        output_mode: localOutputMode, parameters: localParameters,
        dependencies: localDeps,
        incremental_strategy: localOutputMode === 'incremental' ? localIncrementalStrategy : undefined,
        incremental_key: localOutputMode === 'incremental' ? localIncrementalKey : undefined,
        microbatch_window: localOutputMode === 'incremental' && localIncrementalStrategy === 'microbatch' ? localMicrobatchWindow : undefined,
        tests: localTests,
        scd2_key: localOutputMode === 'scd2' ? localScd2Key : undefined,
        scd2_tracked_columns: localOutputMode === 'scd2' ? localScd2TrackedCols.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        scd2_effective_from: localOutputMode === 'scd2' ? localScd2EffFrom : undefined,
        scd2_effective_to: localOutputMode === 'scd2' ? localScd2EffTo : undefined,
        scd2_is_current: localOutputMode === 'scd2' ? localScd2IsCurrent : undefined,
        pre_hook_sql: localPreHook || undefined,
        post_hook_sql: localPostHook || undefined,
        load_trigger_url: localLoadTriggerUrl || undefined,
        load_trigger_job_id: localLoadTriggerJobId || undefined,
        cdc_trigger_url: localCdcTriggerUrl || undefined,
        exposures: localExposures,
        folder: pipelineFolder || undefined,
        tags: pipelineTags.length > 0 ? pipelineTags : undefined,
      }
    })
  }

  const handleSave = () => {
    // Check for duplicate name — warn if another pipeline (different id) has the same name
    const trimmed = localName.trim().toLowerCase()
    const dupe = pipelines.some(p =>
      p.name.trim().toLowerCase() === trimmed && p.id !== activePipelineId
    )
    if (dupe) {
      setShowDupeNameWarning(true)
      return
    }
    doSave()
  }


  const handleExport = async () => {
    if (!activePipelineId) return
    try {
      const data = await exportPipeline(activePipelineId)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${localName.replace(/[^a-z0-9_-]/gi, '_')}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      flash('err', 'Export failed')
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        importMut.mutate(data)
      } catch {
        flash('err', 'Invalid JSON file')
      }
    }
    reader.readAsText(file)
    // Reset the input so the same file can be re-imported if needed
    e.target.value = ''
  }

  const handlePreview = () => {
    if (!activePipelineId) { flash('err', 'Save the pipeline first'); return }
    if (localParameters.length > 0) {
      setShowParamModal('preview')
    } else {
      previewMut.mutate({ id: activePipelineId })
    }
  }

  const handleExecute = async () => {
    if (!activePipelineId) { flash('err', 'Save the pipeline first'); return }
    if (localOutputMode === 'preview' || !localOutputTable?.trim()) {
      flash('err', 'Choose a write mode (CTAS / Insert / View / Incremental) and enter an output table name before executing')
      return
    }
    if (localOutputMode === 'incremental' && !localIncrementalKey.trim()) {
      flash('err', 'Incremental mode requires a key column. Set it in the Output section.')
      return
    }
    if (localOutputMode === 'scd2' && !localScd2Key.trim()) {
      flash('err', 'SCD Type 2 requires a natural key column. Set it in the Output section.')
      return
    }
    // Always save first — the backend reads from DB, not local state
    try {
      await savePipeline(activePipelineId, {
        name: localName,
        steps: localSteps,
        output_table: localOutputTable,
        output_mode: localOutputMode,
        parameters: localParameters,
        dependencies: localDeps,
        incremental_strategy: localOutputMode === 'incremental' ? localIncrementalStrategy : undefined,
        incremental_key: localOutputMode === 'incremental' ? localIncrementalKey : undefined,
        microbatch_window: localOutputMode === 'incremental' && localIncrementalStrategy === 'microbatch' ? localMicrobatchWindow : undefined,
        tests: localTests,
        scd2_key: localOutputMode === 'scd2' ? localScd2Key : undefined,
        scd2_tracked_columns: localOutputMode === 'scd2' ? localScd2TrackedCols.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        scd2_effective_from: localOutputMode === 'scd2' ? localScd2EffFrom : undefined,
        scd2_effective_to: localOutputMode === 'scd2' ? localScd2EffTo : undefined,
        scd2_is_current: localOutputMode === 'scd2' ? localScd2IsCurrent : undefined,
      })
      setIsDirty(false)
      qc.invalidateQueries({ queryKey: ['pipelines'] })
    } catch (e: unknown) {
      flash('err', (e as Error).message ?? 'Save failed — cannot execute')
      return
    }
    if (localParameters.length > 0) {
      setShowParamModal('execute')
    } else {
      executeMut.mutate({ id: activePipelineId })
    }
  }

  const handleRunWithParams = (paramValues: Record<string, string>) => {
    if (!activePipelineId || !showParamModal) return
    if (showParamModal === 'preview') {
      previewMut.mutate({ id: activePipelineId, paramValues })
    } else {
      executeMut.mutate({ id: activePipelineId, paramValues })
    }
    setShowParamModal(null)
  }

  const handleShowSql = async () => {
    try {
      const res = await generateSql(localSourceTable, localSteps)
      setSqlText(res.sql)
      setBottomPanel('sql')
    } catch (e: unknown) {
      flash('err', (e as Error).message ?? 'Could not generate SQL')
    }
  }

  const handleSqlTabClick = async () => {
    setBottomPanel('sql')
    // Auto-generate SQL if not yet generated or source changed
    if (!sqlText && localSourceTable) {
      try {
        const res = await generateSql(localSourceTable, localSteps)
        setSqlText(res.sql)
      } catch {
        // Silently ignore — SqlPreview will show empty state
      }
    }
  }

  const selectedStep = localSteps.find((s) => s.id === selectedStepId) ?? null
  const isLoading = previewMut.isPending || executeMut.isPending || saveMut.isPending

  // Show login modal if auth enabled and not logged in
  if (authEnabled && showLogin) {
    return <LoginModal onLogin={handleLogin} />
  }

  // Don't render until auth check complete (avoids flash)
  if (authEnabled && !authChecked) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-navy-950">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-surface-100 overflow-hidden font-sans">
      {/* ── Top Bar ─────────────────────────────────────────────────────────── */}
      <header className="flex flex-col bg-navy-950 border-b border-navy-800 shrink-0">

        {/* Row 1: Logo + pipeline nav + hub buttons */}
        <div className="flex items-center gap-2 px-4 h-11 border-b border-navy-800">
          {/* Logo */}
          <div className="flex items-center gap-2 mr-2">
            <div className="w-6 h-6 rounded bg-dblue-500 flex items-center justify-center">
              <Layers size={14} className="text-white" />
            </div>
            <span className="font-semibold text-white text-sm tracking-tight">Transform Studio</span>
            <span className="text-white/50 text-xs font-mono ml-1">for Dremio</span>
          </div>

          <div className="h-5 w-px bg-navy-700" />

          <button
            onClick={handleNewPipeline}
            title="New pipeline"
            className="flex items-center gap-1 px-2.5 py-1 rounded border border-sidebar-border hover:border-primary text-white/70 hover:text-white hover:bg-sidebar-accent transition-colors text-xs font-medium"
          >
            <IconAdd size={12} />
            New Pipeline
          </button>
          <button
            onClick={() => setShowTemplates(true)}
            title="Pipeline templates"
            className="flex items-center gap-1 px-2.5 py-1 rounded border border-sidebar-border hover:border-primary text-white/70 hover:text-white hover:bg-sidebar-accent transition-colors text-xs font-medium"
          >
            <LayoutTemplate size={12} />
            Templates
          </button>

          <div className="h-5 w-px bg-navy-700" />

          {/* Pipeline name */}
          <div className="flex items-center gap-1.5 group">
            <span className="text-white text-sm font-medium max-w-[200px] truncate">{localName}</span>
            {activePipelineId && (
              <button
                onClick={() => { setRenamingId(activePipelineId); setRenameValue(localName) }}
                title="Rename pipeline"
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-navy-500 hover:text-white/70 transition-all"
              >
                <IconEdit size={11} />
              </button>
            )}
          </div>
          {isDirty && <span className="text-xs text-amber-400 font-medium">●</span>}

          <div className="flex-1" />

          <Tooltip text="Ingestion Hub">
            <button
              onClick={() => setShowIngestionHub(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dblue-500/20 hover:bg-dblue-500/40 text-primary hover:text-white border border-dblue-500/40 hover:border-dblue-500/70 transition-all font-semibold text-xs"
            >
              <Zap size={15} />
              Ingest
            </button>
          </Tooltip>
          <Tooltip text="AI Agent">
            <button
              onClick={() => setShowAgentPanel(p => !p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all font-semibold text-xs ${showAgentPanel ? 'bg-dblue-500 text-white border-dblue-500' : 'bg-dblue-500/20 hover:bg-dblue-500/40 text-primary hover:text-white border-dblue-500/40 hover:border-dblue-500/70'}`}
            >
              <Bot size={15} />
              Agent
            </button>
          </Tooltip>
          <Tooltip text="Data Quality Hub">
            <button
              onClick={() => setShowDqHub(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dblue-500/20 hover:bg-dblue-500/40 text-primary hover:text-white border border-dblue-500/40 hover:border-dblue-500/70 transition-all font-semibold text-xs whitespace-nowrap"
            >
              <ShieldCheck size={15} />
              DQ Hub
            </button>
          </Tooltip>
        </div>

        {/* Row 2: Tools + status + actions */}
        <div className="flex items-center gap-1 px-4 h-9 pl-64">
          <Tooltip text="Health Dashboard">
            <button onClick={() => setShowDashboard(true)} className="p-1.5 rounded text-white/70 hover:text-white hover:bg-sidebar-accent transition-colors">
              <Activity size={14} />
            </button>
          </Tooltip>
          <Tooltip text="Approvals">
            <button onClick={() => setRightPanel('approvals')} className="p-1.5 rounded text-white/70 hover:text-white hover:bg-sidebar-accent transition-colors">
              <GitPullRequest size={14} />
            </button>
          </Tooltip>
          <Tooltip text="Alerts">
            <button onClick={() => setShowAlerts(true)} className="p-1.5 rounded text-white/70 hover:text-white hover:bg-sidebar-accent transition-colors">
              <Bell size={14} />
            </button>
          </Tooltip>
          <Tooltip text="Pipeline DAG">
            <button onClick={() => setShowDagView(true)} className="p-1.5 rounded text-white/70 hover:text-white hover:bg-sidebar-accent transition-colors">
              <GitBranch size={14} />
            </button>
          </Tooltip>
          {localDeps.length > 0 && (
            <Tooltip text="Run with Dependencies">
              <button onClick={() => activePipelineId && setShowDagRunModal(true)} disabled={!activePipelineId} className="p-1.5 rounded text-primary hover:text-white hover:bg-sidebar-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                <GitMerge size={14} />
              </button>
            </Tooltip>
          )}
          <Tooltip text="Seed Table from CSV">
            <button onClick={() => setShowSeedModal(true)} className="p-1.5 rounded text-white/70 hover:text-white hover:bg-sidebar-accent transition-colors">
              <Sprout size={14} />
            </button>
          </Tooltip>
          <Tooltip text="Global Search (⌘K)">
            <button onClick={() => { setShowSearch(true); setSearchQuery(''); setSearchResults([]) }} className="p-1.5 rounded text-white/70 hover:text-white hover:bg-sidebar-accent transition-colors">
              <IconSearch size={14} />
            </button>
          </Tooltip>
          <Tooltip text="Export Documentation">
            <button onClick={exportDocs} className="p-1.5 rounded text-white/70 hover:text-white hover:bg-sidebar-accent transition-colors">
              <FileText size={14} />
            </button>
          </Tooltip>
          <Tooltip text="Export as dbt Project">
            <button onClick={exportDbt} className="p-1.5 rounded text-white/70 hover:text-white hover:bg-sidebar-accent transition-colors">
              <Package size={14} />
            </button>
          </Tooltip>
          <Tooltip text="Import from dbt">
            <button onClick={() => setShowDbtImport(true)} className="p-1.5 rounded text-white/70 hover:text-white hover:bg-sidebar-accent transition-colors">
              <Upload size={14} />
            </button>
          </Tooltip>
          <Tooltip text={activePipelineId ? 'Schedule Pipeline' : 'Save a pipeline first'}>
            <button onClick={() => activePipelineId && setShowSchedule(true)} disabled={!activePipelineId} className="p-1.5 rounded text-white/70 hover:text-white hover:bg-sidebar-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <CalendarClock size={14} />
            </button>
          </Tooltip>
          <Tooltip text="Connection Settings">
            <button onClick={() => setShowConnectionSettings(true)} className="p-1.5 rounded text-white/70 hover:text-white hover:bg-sidebar-accent transition-colors">
              <IconSettings size={14} />
            </button>
          </Tooltip>
          <Tooltip text={activePipelineId ? 'Export pipeline as JSON' : 'Save a pipeline first'}>
            <button onClick={handleExport} disabled={!activePipelineId} className="p-1.5 rounded text-white/70 hover:text-white hover:bg-sidebar-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <IconDatasetDownload size={14} />
            </button>
          </Tooltip>
          <Tooltip text="Import pipeline from JSON">
            <button onClick={handleImportClick} className="p-1.5 rounded text-white/70 hover:text-white hover:bg-sidebar-accent transition-colors">
              <Upload size={14} />
            </button>
          </Tooltip>
          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />

          <EnvironmentSwitcher onActivated={() => qc.invalidateQueries({ queryKey: ['pipelines'] })} />

          {/* User menu (auth enabled) */}
          {authEnabled && currentUser && (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu((v) => !v)}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-white/70 hover:text-white hover:bg-sidebar-accent transition-colors text-xs"
                title={currentUser.username}
              >
                <User size={13} />
                <span className="max-w-[80px] truncate">{currentUser.username}</span>
              </button>
              {showUserMenu && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-navy-900 border border-navy-700 rounded-lg shadow-xl z-50 overflow-hidden">
                  <div className="px-3 py-2 border-b border-navy-800">
                    <p className="text-xs font-semibold text-white truncate">{currentUser.username}</p>
                    <p className="text-xs" style={{ color: currentUser.role === 'admin' ? '#60a5fa' : currentUser.role === 'viewer' ? '#f59e0b' : '#6ee7b7' }}>
                      {currentUser.role === 'admin' ? 'Admin' : currentUser.role === 'viewer' ? 'Viewer' : 'Editor'}
                    </p>
                  </div>
                  {currentUser.is_admin && (
                    <button onClick={() => { setShowManageUsers(true); setShowUserMenu(false) }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/70 hover:bg-sidebar-accent hover:text-white transition-colors">
                      <Users size={12} /> Manage Users
                    </button>
                  )}
                  {currentUser.is_admin && (
                    <button onClick={() => { setShowAuditLog(true); setShowUserMenu(false) }} className="flex items-center gap-2 w-full px-3 py-2 text-xs text-white/70 hover:bg-sidebar-accent hover:text-white transition-colors">
                      <ScrollText size={12} /> Audit Log
                    </button>
                  )}
                  <button onClick={() => { setShowMyCredentials(true); setShowUserMenu(false) }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/70 hover:bg-sidebar-accent hover:text-white transition-colors">
                    <KeyRound size={12} /> My Dremio Credentials
                  </button>
                  <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/70 hover:bg-navy-800 hover:text-red-400 transition-colors">
                    <LogOut size={12} /> Sign Out
                  </button>
                </div>
              )}
            </div>
          )}
          {isDesktop && (
            <Tooltip text="Quit Transform Studio">
              <button onClick={() => setShowQuitConfirm(true)} className="p-1.5 rounded text-white/60 hover:text-red-400 hover:bg-navy-700 transition-colors">
                <Power size={14} />
              </button>
            </Tooltip>
          )}

          <div className="flex-1" />

          {statusMsg && (
            <span className={clsx(
              'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
              statusMsg.type === 'ok' ? 'text-emerald-400 bg-emerald-950/60' : 'text-red-400 bg-red-950/60'
            )}>
              {statusMsg.type === 'ok' ? <IconCheckCircle size={11} /> : <IconErrorCircle size={11} />}
              {statusMsg.text}
            </span>
          )}
          {isLoading && <Loader2 size={14} className="animate-spin text-primary" />}

          <div className="h-5 w-px bg-navy-700" />
          <TopBtn onClick={handleShowSql} icon={<Code2 size={12} />} label="View SQL" />
        <TopBtn
          onClick={handlePreview}
          disabled={!localSourceTable || isLoading}
          icon={<IconDatasetRun size={12} />}
          label="Preview"
          accent="emerald"
        />
        <TopBtn
          onClick={handleExecute}
          disabled={!activePipelineId || !localOutputTable || isLoading || (authEnabled && currentUser?.role === 'viewer')}
          icon={<Zap size={12} />}
          label="Execute"
          accent="blue"
          title={authEnabled && currentUser?.role === 'viewer' ? 'Viewers cannot execute pipelines directly' : undefined}
        />

        {/* ── Approval-aware save area ───────────────────────────────────── */}
        {/* Viewers always go through review; editors go through review on approval-required pipelines */}
        {activePipelineId && authEnabled && currentUser && (
          (localApprovalRequired && !currentUser.is_admin) || currentUser.role === 'viewer'
        ) ? (
          /* Viewer role OR non-admin on an approval-required pipeline */
          localPendingApprovalId ? (
            /* Already has a pending review — can't submit another */
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 font-medium">
              <Clock size={12} />
              Review Pending
            </div>
          ) : (
            /* Submit for review */
            <TopBtn
              onClick={async () => {
                if (!activePipelineId) return
                const approval = await submitPipelineReview(activePipelineId, localSteps)
                setLocalPendingApprovalId(approval.id)
                qc.invalidateQueries({ queryKey: ['approvals'] })
                qc.invalidateQueries({ queryKey: ['dashboard'] })
              }}
              disabled={isLoading}
              icon={<GitPullRequest size={12} />}
              label="Submit for Review"
              accent="violet"
            />
          )
        ) : (
          /* Normal save (admin, or approval not required) */
          <>
            {activePipelineId && (!authEnabled || currentUser?.is_admin) && (
              <Tooltip text={localApprovalRequired ? 'Approval required — click to disable' : 'Click to require approval for changes'}>
                <button
                  onClick={async () => {
                    if (!activePipelineId) return
                    const next = !localApprovalRequired
                    await setApprovalRequired(activePipelineId, next)
                    setLocalApprovalRequired(next)
                  }}
                  className={`p-1.5 rounded transition-colors ${
                    localApprovalRequired
                      ? 'text-violet-400 bg-violet-500/15 hover:bg-violet-500/25'
                      : 'text-white/40 hover:text-white/70 hover:bg-navy-700'
                  }`}
                >
                  <GitPullRequest size={15} />
                </button>
              </Tooltip>
            )}
            {activePipelineId && (() => {
              const ap = pipelines.find(p => p.id === activePipelineId)
              return ap && canSharePipeline(ap) ? (
                <Tooltip text="Share pipeline">
                  <button
                    onClick={() => setShareModalPipelineId(activePipelineId)}
                    className="p-1.5 rounded text-white/40 hover:text-primary hover:bg-navy-700 transition-colors"
                  >
                    <Share2 size={15} />
                  </button>
                </Tooltip>
              ) : null
            })()}
            <TopBtn
              onClick={handleSave}
              disabled={isLoading}
              icon={<Save size={12} />}
              label="Save"
              accent="dark"
            />
          </>
        )}
        </div>{/* end row 2 */}
      </header>

      {/* ── Main Content ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left Sidebar — dark navy */}
        <aside className="w-60 bg-navy-900 border-r border-navy-800 flex flex-col shrink-0 overflow-hidden">

          {/* Pipelines */}
          <div className="border-b border-navy-800 shrink-0">
            <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
              <span className="text-xs font-semibold text-white/60 uppercase tracking-widest">Pipelines</span>
              <button onClick={handleNewPipeline} className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-sidebar-accent text-white/70 hover:text-white transition-colors text-xs" title="New pipeline">
                <IconAdd size={12} />
                <span>New</span>
              </button>
            </div>
            {/* Search box — only show when 5+ pipelines */}
            {pipelines.length >= 5 && (
              <div className="px-3 pb-1.5">
                <div className="flex items-center gap-1.5 bg-sidebar-accent rounded px-2 py-1 border border-sidebar-border">
                  <IconSearch size={10} className="text-white/50 shrink-0" />
                  <input
                    type="text"
                    value={pipelineSearch}
                    onChange={(e) => setPipelineSearch(e.target.value)}
                    placeholder="Search pipelines..."
                    className="flex-1 bg-transparent text-xs text-white/80 placeholder-white/30 outline-none min-w-0"
                  />
                  {pipelineSearch && (
                    <button onClick={() => setPipelineSearch('')} className="text-white/60 hover:text-white transition-colors">
                      <IconClose size={10} />
                    </button>
                  )}
                </div>
              </div>
            )}
            {/* Folder filter */}
            {allFolders.length > 0 && (
              <div className="px-2 pb-1.5 border-b border-navy-800 mb-1">
                <p className="text-[9px] font-semibold text-white/30 uppercase tracking-wider px-1 py-1">Folders</p>
                <button
                  onClick={() => { setActiveFolder(null); setActiveTagFilter(null) }}
                  className={clsx('w-full text-left px-2 py-0.5 rounded text-xs transition-colors',
                    activeFolder === null && !activeTagFilter ? 'text-white' : 'text-white/40 hover:text-white/70')}
                >
                  All pipelines
                </button>
                {allFolders.map(folder => (
                  <button key={folder} onClick={() => setActiveFolder(activeFolder === folder ? null : folder)}
                    className={clsx('w-full text-left px-2 py-0.5 rounded text-xs transition-colors flex items-center gap-1.5',
                      activeFolder === folder ? 'text-primary' : 'text-white/40 hover:text-white/70')}>
                    <span className="text-[10px]">📁</span>
                    <span className="truncate">{folder}</span>
                  </button>
                ))}
                {pipelines.some((p: any) => !p.folder) && (
                  <button onClick={() => setActiveFolder('__uncategorized__')}
                    className={clsx('w-full text-left px-2 py-0.5 rounded text-xs transition-colors italic',
                      activeFolder === '__uncategorized__' ? 'text-primary' : 'text-white/40 hover:text-white/70')}>
                    Uncategorized
                  </button>
                )}
              </div>
            )}

            {/* Tag filter chips */}
            {(() => {
              const allTags = [...new Set((pipelines as any[]).flatMap((p: any) => p.tags ?? []))] as string[]
              if (!allTags.length) return null
              return (
                <div className="px-2 pb-1.5 border-b border-navy-800 mb-1 flex flex-wrap gap-1">
                  {allTags.slice(0, 10).map(tag => (
                    <button key={tag} onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
                      className={clsx('text-[9px] px-1.5 py-0.5 rounded-full transition-colors',
                        activeTagFilter === tag ? 'bg-dblue-500 text-white' : 'bg-navy-800 text-white/60 hover:text-surface-200')}>
                      {tag}
                    </button>
                  ))}
                </div>
              )
            })()}

            <ul className="max-h-36 overflow-y-auto">
              {(() => {
                const displayedPipelines = (pipelines as any[])
                  .filter((p: any) => {
                    if (activeFolder === '__uncategorized__') return !p.folder
                    if (activeFolder) return p.folder === activeFolder || p.folder?.startsWith(activeFolder + '/')
                    return true
                  })
                  .filter((p: any) => !activeTagFilter || (p.tags ?? []).includes(activeTagFilter))
                  .filter((p: any) => {
                    if (!pipelineSearch || (pipelines as any[]).length < 5) return true
                    const q = pipelineSearch.toLowerCase()
                    return p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q)
                  })
                return (
                  <>
                    {pipelines.length === 0 && (
                      <li className="px-3 py-2 text-xs text-white/50">No pipelines yet</li>
                    )}
                    {pipelines.length >= 5 && pipelineSearch && displayedPipelines.length === 0 && (
                      <li className="px-3 py-2 text-xs text-white/50 italic">No pipelines match</li>
                    )}
                    {displayedPipelines.map((p: any) => (
                      <li key={p.id} className="group flex flex-col">
                        <div className="flex items-center">
                          <button
                            onClick={() => loadPipeline(p)}
                            className={clsx(
                              'flex-1 text-left px-3 py-1.5 text-xs truncate transition-colors',
                              activePipelineId === p.id
                                ? 'bg-primary/20 text-primary font-medium border-l-2 border-primary'
                                : 'text-white/70 hover:bg-sidebar-accent hover:text-white'
                            )}
                          >
                            <span className="truncate">{p.name}</span>
                            {p.shared_access && (
                              <span className="ml-1 text-[9px] text-white/40 font-normal">(shared)</span>
                            )}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); duplicateMut.mutate(p.id) }}
                            title="Duplicate"
                            className="opacity-0 group-hover:opacity-100 p-1 mr-0.5 rounded text-white/40 hover:text-primary transition-all"
                          >
                            <IconCopy size={11} />
                          </button>
                          {canSharePipeline(p) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setShareModalPipelineId(p.id) }}
                              title="Share"
                              className="opacity-0 group-hover:opacity-100 p-1 mr-0.5 rounded text-white/40 hover:text-primary transition-all"
                            >
                              <Share2 size={11} />
                            </button>
                          )}
                          {canEditPipeline(p) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setRenamingId(p.id); setRenameValue(p.name) }}
                              title="Rename"
                              className="opacity-0 group-hover:opacity-100 p-1 mr-0.5 rounded text-white/40 hover:text-white transition-all"
                            >
                              <IconEdit size={11} />
                            </button>
                          )}
                          {canDeletePipeline(p) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(p.id) }}
                              title="Delete"
                              className="opacity-0 group-hover:opacity-100 p-1 mr-1 rounded text-white/40 hover:text-red-400 transition-all"
                            >
                              <IconDelete size={11} />
                            </button>
                          )}
                        </div>
                        {p.tags && p.tags.length > 0 && (
                          <div className="flex gap-1 flex-wrap mt-0.5 px-3 pb-0.5">
                            {(p.tags as string[]).slice(0, 3).map((tag: string) => (
                              <span key={tag} className="text-[9px] px-1 py-0 rounded-full bg-primary/20 text-primary">{tag}</span>
                            ))}
                            {p.tags.length > 3 && <span className="text-[9px] text-white/40">+{p.tags.length - 3}</span>}
                          </div>
                        )}
                      </li>
                    ))}
                  </>
                )
              })()}
            </ul>
          </div>

          {/* Catalog tabs */}
          <div className="flex border-b border-navy-800 shrink-0">
            <CatalogTabBtn
              active={sidebarTab === 'dremio'}
              onClick={() => setSidebarTab('dremio')}
              icon={<IconEntityNamespace size={11} />}
              label="Dremio"
            />
            <CatalogTabBtn
              active={sidebarTab === 'iceberg'}
              onClick={() => setSidebarTab('iceberg')}
              icon={<Layers size={11} />}
              label="Iceberg"
              badge={icebergCatalogs.length > 0 ? icebergCatalogs.length : undefined}
            />
          </div>

          {/* Catalog content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {sidebarTab === 'dremio' ? (
              <div className="flex-1 overflow-y-auto">
                <CatalogBrowser key={catalogKey} activeTable={localSourceTable} onSelectTable={handleSelectTable} />
              </div>
            ) : (
              <div className="flex-1 overflow-hidden flex flex-col">
                {/* Iceberg catalog list */}
                <div className="px-3 pt-2.5 pb-1.5 flex items-center justify-between shrink-0">
                  <span className="text-xs text-white/60 font-medium">REST Catalogs</span>
                  <button
                    onClick={() => setShowAddCatalog(true)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-primary hover:bg-navy-800 transition-colors"
                  >
                    <IconAdd size={11} /> Add
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {icebergCatalogs.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-white/50">
                      No Iceberg catalogs configured.{' '}
                      <button onClick={() => setShowAddCatalog(true)} className="text-primary hover:underline">Add one</button>
                    </div>
                  ) : (
                    icebergCatalogs.map((cat) => (
                      <IcebergCatalogSection
                        key={cat.id}
                        catalog={cat}
                        activeTable={localSourceTable}
                        onSelectTable={handleSelectTable}
                        onDelete={() => deleteCatalogMut.mutate(cat.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Center — Pipeline Builder */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Source banner */}
          {localSourceTable && (
            <div className="flex items-center gap-2 px-4 py-2 bg-navy-900 border-b border-navy-800 text-sm shrink-0">
              <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Source</span>
              <code className="text-xs font-mono text-white bg-white/10 px-2 py-0.5 rounded">{localSourceTable}</code>
              <button
                onClick={() => setShowProfile((v) => !v)}
                title="Profile table"
                className={clsx(
                  'flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors',
                  showProfile
                    ? 'bg-dblue-500 text-white'
                    : 'text-white/70 hover:text-white hover:bg-sidebar-accent'
                )}
              >
                <BarChart2 size={11} /> Profile
              </button>
              <span className="ml-auto text-xs text-white/60">{sourceSchema.length} columns</span>
              {/* View toggle */}
              <div className="flex items-center gap-0.5 ml-3 bg-surface-100 rounded-full p-0.5">
                <ViewToggleBtn
                  active={centerView === 'pipeline'}
                  onClick={() => setCenterView('pipeline')}
                  label="Pipeline"
                />
                <ViewToggleBtn
                  active={centerView === 'lineage'}
                  onClick={() => setCenterView('lineage')}
                  label="Lineage"
                />
              </div>
            </div>
          )}

          {/* Description / Notes */}
          {activePipelineId && (
            <div className="px-4 py-2 bg-white border-b border-surface-100 shrink-0">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Notes</label>
              <textarea
                value={localDescription}
                onChange={(e) => { setLocalDescription(e.target.value); setIsDirty(true) }}
                placeholder="Add a description for this pipeline..."
                rows={1}
                className="w-full text-xs text-surface-700 placeholder-surface-300 bg-transparent border-none outline-none resize-none leading-relaxed"
                style={{ minHeight: '1.5rem', maxHeight: '6rem', overflowY: 'auto' }}
                onInput={(e) => {
                  const el = e.currentTarget
                  el.style.height = 'auto'
                  el.style.height = Math.min(el.scrollHeight, 96) + 'px'
                }}
              />
            </div>
          )}

          {/* Folder & Tags */}
          {activePipelineId && (
            <div className="flex items-center gap-4 px-4 py-1.5 border-b border-gray-100 bg-gray-50/80 text-xs shrink-0">
              {/* Folder */}
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400 text-sm">📁</span>
                <input
                  value={pipelineFolder}
                  onChange={e => { setPipelineFolder(e.target.value); setIsDirty(true) }}
                  onBlur={() => fetchPipelineFolders().then(setAllFolders).catch(() => {})}
                  placeholder="Add to folder…"
                  list="folder-suggestions"
                  className="text-xs bg-transparent border-none outline-none text-gray-600 placeholder-gray-300 w-36 focus:placeholder-gray-200"
                />
                <datalist id="folder-suggestions">
                  {allFolders.map(f => <option key={f} value={f} />)}
                </datalist>
              </div>
              {/* Tags */}
              <div className="flex items-center gap-1 flex-wrap flex-1 min-w-0">
                <span className="text-gray-400 shrink-0">🏷</span>
                {pipelineTags.map(tag => (
                  <span key={tag} className="flex items-center gap-0.5 bg-dblue-50 text-dblue-600 border border-dblue-200 px-1.5 py-0.5 rounded-full text-[10px] font-medium">
                    {tag}
                    <button
                      onClick={() => { setPipelineTags(t => t.filter(x => x !== tag)); setIsDirty(true) }}
                      className="ml-0.5 hover:text-red-500 leading-none"
                    >×</button>
                  </span>
                ))}
                <input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => {
                    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
                      e.preventDefault()
                      const newTag = tagInput.trim().replace(/,$/, '')
                      if (newTag && !pipelineTags.includes(newTag)) {
                        setPipelineTags(t => [...t, newTag])
                        setIsDirty(true)
                      }
                      setTagInput('')
                    }
                    if (e.key === 'Backspace' && !tagInput && pipelineTags.length) {
                      setPipelineTags(t => t.slice(0, -1))
                      setIsDirty(true)
                    }
                  }}
                  placeholder={pipelineTags.length ? '' : 'Add tag…'}
                  className="text-[10px] bg-transparent border-none outline-none text-gray-600 placeholder-gray-300 w-16 min-w-0"
                />
              </div>
            </div>
          )}

          {!localSourceTable ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-xs">
                <div className="w-16 h-16 rounded-2xl bg-navy-900 flex items-center justify-center mx-auto mb-4">
                  <IconEntityNamespace size={28} className="text-navy-600" />
                </div>
                <p className="font-semibold text-gray-400 mb-1 text-sm">No source table selected</p>
                <p className="text-xs text-gray-500">Click a table in the Catalog panel to start building a pipeline.</p>
              </div>
            </div>
          ) : centerView === 'lineage' ? (
            <div className="flex-1 overflow-y-auto">
              <LineageView
                pipeline={{
                  id: activePipelineId ?? '',
                  name: localName,
                  source_table: localSourceTable,
                  steps: localSteps,
                  output_table: localOutputTable || undefined,
                  output_mode: localOutputMode as Pipeline['output_mode'],
                  version: localVersion ?? 1,
                  created_at: '',
                  updated_at: '',
                }}
                selectedStepId={selectedStepId}
                onStepClick={(id) => { setSelectedStepId(id); setCenterView('pipeline'); setRightPanel('config') }}
              />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4">
              {showProfile && localSourceTable && (
                <div className="mb-4 max-w-2xl mx-auto">
                  <DataProfilePanel
                    table={localSourceTable}
                    onClose={() => setShowProfile(false)}
                  />
                </div>
              )}
              <PipelineBuilder
                steps={localSteps}
                selectedStepId={selectedStepId}
                onStepClick={(id) => { setSelectedStepId(id); setRightPanel('config') }}
                onStepDelete={handleStepDelete}
                onStepMove={handleStepMove}
                onReorder={handleReorder}
                onAddStep={() => setRightPanel('library')}
              />
            </div>
          )}

          {/* Output strip */}
          {localSourceTable && (
            <div className="shrink-0 bg-selected" style={{ borderTop: '3px solid var(--primary)' }}>
              <div className="flex items-center gap-3 px-4 py-2.5 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>Output</span>
                </div>
                <select
                  value={localOutputMode}
                  onChange={(e) => { setLocalOutputMode(e.target.value); setIsDirty(true) }}
                  className="text-xs border border-ring rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring bg-card text-secondary-foreground font-medium shadow-sm"
                >
                  <option value="preview">Preview only (no output)</option>
                  <option value="ctas">Create Table (CTAS)</option>
                  <option value="insert">Insert Into</option>
                  <option value="view">Create View</option>
                  <option value="incremental">Incremental (Merge/Append)</option>
                  <option value="scd2">SCD Type 2 (History)</option>
                </select>
                {localOutputMode !== 'preview' ? (
                  <div className="flex items-center gap-1 flex-1 max-w-2xl">
                    {/* Top-level space dropdown */}
                    <select
                      value={outputNamespace}
                      onChange={e => {
                        const ns = e.target.value
                        setOutputNamespace(ns)
                        const full = ns && outputTableName ? `${ns}.${outputTableName}`
                          : ns ? ns
                          : outputTableName
                        setLocalOutputTable(full)
                        setIsDirty(true)
                      }}
                      className="border border-dblue-400 rounded-md px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-dblue-400 bg-white shadow-sm text-surface-700 max-w-[180px] shrink-0"
                    >
                      <option value="">— space —</option>
                      {namespaces.map(ns => (
                        <option key={ns} value={ns}>{ns}</option>
                      ))}
                    </select>

                    <span className="text-gray-500 font-mono text-sm shrink-0">.</span>

                    {/* Subpath: folder(s) + table name, supports dots for nesting */}
                    <input
                      className="border border-dblue-400 rounded-md px-2 py-1.5 text-xs font-mono flex-1 focus:outline-none focus:ring-2 focus:ring-dblue-400 bg-white shadow-sm"
                      placeholder="folder.subfolder.table_name"
                      value={outputTableName}
                      onChange={e => {
                        const sub = e.target.value
                        setOutputTableName(sub)
                        const full = outputNamespace && sub ? `${outputNamespace}.${sub}`
                          : outputNamespace ? outputNamespace
                          : sub
                        setLocalOutputTable(full)
                        setIsDirty(true)
                      }}
                    />

                    {/* Full path preview */}
                    {localOutputTable && (
                      <span className="text-xs text-gray-500 font-mono truncate max-w-[200px] shrink-0" title={localOutputTable}>
                        → {localOutputTable}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs italic text-accent">Select a write mode to save results to a table or view</span>
                )}
                {/* Incremental settings */}
                {localOutputMode === 'incremental' && (
                  <>
                    <select
                      value={localIncrementalStrategy}
                      onChange={e => { setLocalIncrementalStrategy(e.target.value); setIsDirty(true) }}
                      className="text-xs border border-dblue-400 rounded-md px-2 py-1.5 bg-white text-gray-700 shadow-sm"
                    >
                      <option value="append">Append (timestamp)</option>
                      <option value="merge">Merge (MERGE INTO, Iceberg only)</option>
                      <option value="microbatch">Microbatch (time windows)</option>
                    </select>
                    <input
                      className="border border-dblue-400 rounded-md px-2 py-1.5 text-xs font-mono w-36 focus:outline-none focus:ring-2 focus:ring-dblue-400 bg-white shadow-sm"
                      placeholder="Timestamp column"
                      value={localIncrementalKey}
                      onChange={e => { setLocalIncrementalKey(e.target.value); setIsDirty(true) }}
                    />
                    {localIncrementalStrategy === 'microbatch' && (
                      <select
                        value={localMicrobatchWindow}
                        onChange={e => { setLocalMicrobatchWindow(e.target.value); setIsDirty(true) }}
                        className="text-xs border border-dblue-400 rounded-md px-2 py-1.5 bg-white text-gray-700 shadow-sm"
                        title="Batch window size — each execution processes data in chunks of this size"
                      >
                        <option value="1hour">1-hour batches</option>
                        <option value="6hour">6-hour batches</option>
                        <option value="1day">Daily batches</option>
                        <option value="1week">Weekly batches</option>
                      </select>
                    )}
                  </>
                )}
                {/* SCD Type 2 settings */}
                {localOutputMode === 'scd2' && (
                  <>
                    <input
                      className="border border-dblue-400 rounded-md px-2 py-1.5 text-xs font-mono w-32 focus:outline-none focus:ring-2 focus:ring-dblue-400 bg-white shadow-sm"
                      placeholder="Natural key col *"
                      title="Natural key column — used to match existing records"
                      value={localScd2Key}
                      onChange={e => { setLocalScd2Key(e.target.value); setIsDirty(true) }}
                    />
                    <input
                      className="border border-dblue-400 rounded-md px-2 py-1.5 text-xs font-mono w-44 focus:outline-none focus:ring-2 focus:ring-dblue-400 bg-white shadow-sm"
                      placeholder="Tracked cols (comma sep, blank = all)"
                      title="Columns to track for changes. Leave blank to track all."
                      value={localScd2TrackedCols}
                      onChange={e => { setLocalScd2TrackedCols(e.target.value); setIsDirty(true) }}
                    />
                    <div className="flex items-center gap-1 border border-dblue-400 rounded-md px-2 py-1.5 bg-white shadow-sm">
                      <span className="text-xs text-gray-500">eff_from</span>
                      <input
                        className="text-xs font-mono w-24 bg-transparent outline-none"
                        value={localScd2EffFrom}
                        onChange={e => { setLocalScd2EffFrom(e.target.value); setIsDirty(true) }}
                      />
                      <span className="text-xs text-gray-500 ml-1">eff_to</span>
                      <input
                        className="text-xs font-mono w-24 bg-transparent outline-none"
                        value={localScd2EffTo}
                        onChange={e => { setLocalScd2EffTo(e.target.value); setIsDirty(true) }}
                      />
                      <span className="text-xs text-gray-500 ml-1">current</span>
                      <input
                        className="text-xs font-mono w-20 bg-transparent outline-none"
                        value={localScd2IsCurrent}
                        onChange={e => { setLocalScd2IsCurrent(e.target.value); setIsDirty(true) }}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </main>

        {/* Right Panel */}
        <aside className="w-72 bg-white border-l border-surface-200 flex flex-col shrink-0 overflow-hidden">
          {/* Primary tabs: Add | Config | History | Runs */}
          <div className="grid grid-cols-4 border-b border-surface-200 shrink-0">
            <PanelTabBtn active={rightPanel === 'library'} onClick={() => { setRightPanel('library'); setSelectedStepId(null) }} label="Add" />
            <PanelTabBtn active={rightPanel === 'config'} onClick={() => setRightPanel('config')} label="Config" disabled={!selectedStep} />
            <PanelTabBtn active={rightPanel === 'history'} onClick={() => setRightPanel('history')} label="History" disabled={!activePipelineId} />
            <PanelTabBtn active={rightPanel === 'runs'} onClick={() => setRightPanel('runs')} label="Runs" disabled={!activePipelineId} />
          </div>
          {/* Secondary icon strip: Params | Tests | Deps | Webhook | Hooks | Expose | Reviews */}
          <div className="flex items-center justify-around px-2 py-1 border-b border-surface-200 bg-surface-50 shrink-0">
            <IconTabBtn active={rightPanel === 'params'} onClick={() => setRightPanel('params')} tooltip="Params" icon={<SlidersHorizontal size={14} />} />
            <IconTabBtn active={rightPanel === 'tests'} onClick={() => setRightPanel('tests')} tooltip="Tests" icon={<FlaskConical size={14} />} />
            <IconTabBtn active={rightPanel === 'deps'} onClick={() => setRightPanel('deps')} tooltip="Deps" icon={<GitBranch size={14} />} disabled={!activePipelineId} />
            <IconTabBtn active={rightPanel === 'webhook'} onClick={() => setRightPanel('webhook')} tooltip="Webhook" icon={<Link size={14} />} disabled={!activePipelineId} />
            <IconTabBtn active={rightPanel === 'hooks'} onClick={() => setRightPanel('hooks')} tooltip="Hooks" icon={<Zap size={14} />} />
            <IconTabBtn active={rightPanel === 'exposures'} onClick={() => setRightPanel('exposures')} tooltip="Expose" icon={<Radio size={14} />} />
            <IconTabBtn active={rightPanel === 'approvals'} onClick={() => setRightPanel('approvals')} tooltip="Reviews" icon={<GitPullRequest size={14} />} />
          </div>
          <div className="flex-1 overflow-y-auto">
            {rightPanel === 'library' ? (
              <TransformLibrary onAddTransform={handleAddTransform} />
            ) : rightPanel === 'history' && activePipelineId ? (
              <VersionHistory
                pipelineId={activePipelineId}
                currentVersion={localVersion}
                onRestore={loadPipeline}
              />
            ) : rightPanel === 'runs' && activePipelineId ? (
              <RunsPanel pipelineId={activePipelineId} />
            ) : rightPanel === 'params' ? (
              <ParametersPanel
                parameters={localParameters}
                onChange={(params) => { setLocalParameters(params); setIsDirty(true) }}
              />
            ) : rightPanel === 'tests' ? (
              <div className="p-3">
                <TestsPanel
                  pipelineId={activePipelineId ?? undefined}
                  tests={localTests}
                  columns={sourceSchema.map(c => c.name)}
                  onTestsChange={(tests) => { setLocalTests(tests); setIsDirty(true) }}
                />
              </div>
            ) : rightPanel === 'deps' && activePipelineId ? (
              <div className="p-3">
                <DependencyPanel
                  pipeline={{
                    id: activePipelineId,
                    name: localName,
                    source_table: localSourceTable,
                    steps: localSteps,
                    output_table: localOutputTable || undefined,
                    output_mode: localOutputMode as Pipeline['output_mode'],
                    version: localVersion,
                    dependencies: localDeps,
                  }}
                  allPipelines={pipelines}
                  onDependenciesChange={(deps) => { setLocalDeps(deps); setIsDirty(true) }}
                />
              </div>
            ) : rightPanel === 'webhook' && activePipelineId ? (
              <WebhookPanel
                pipelineId={activePipelineId}
                webhookToken={localWebhookToken}
                onTokenRegenerated={(token) => setLocalWebhookToken(token)}
              />
            ) : rightPanel === 'hooks' ? (
              <div className="p-3 flex flex-col gap-4">
                <p className="text-xs text-gray-500">
                  Hooks run SQL before and after the pipeline executes.
                  Use them for GRANT statements, audit inserts, cache invalidation, or any setup/teardown query.
                </p>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Pre-hook SQL</label>
                  <p className="text-[10px] text-gray-400 mb-1">Runs before the pipeline. If this fails, the pipeline is aborted.</p>
                  <textarea
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white font-mono resize-none focus:outline-none focus:ring-1 focus:ring-dblue-500"
                    rows={5}
                    placeholder={'-- e.g. GRANT SELECT ON My Space.output TO ROLE analyst\n-- or: INSERT INTO audit_log VALUES (\'run_start\', NOW())'}
                    value={localPreHook}
                    onChange={e => { setLocalPreHook(e.target.value); setIsDirty(true) }}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Post-hook SQL</label>
                  <p className="text-[10px] text-gray-400 mb-1">Runs after a successful execute. Pipeline is marked successful even if the post-hook fails (error shown as warning).</p>
                  <textarea
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white font-mono resize-none focus:outline-none focus:ring-1 focus:ring-dblue-500"
                    rows={5}
                    placeholder={'-- e.g. REFRESH TABLE My Space.output\n-- or: INSERT INTO audit_log VALUES (\'run_end\', NOW())'}
                    value={localPostHook}
                    onChange={e => { setLocalPostHook(e.target.value); setIsDirty(true) }}
                  />
                </div>
              </div>
            ) : rightPanel === 'exposures' ? (
              <div className="p-3">
                <ExposuresPanel
                  exposures={localExposures}
                  onExposuresChange={(exps) => { setLocalExposures(exps); setIsDirty(true) }}
                />
              </div>
            ) : rightPanel === 'approvals' ? (
              <ApprovalPanel
                isAdmin={currentUser?.is_admin ?? false}
                currentPipelineId={activePipelineId ?? undefined}
                onApproved={async () => {
                  qc.invalidateQueries({ queryKey: ['pipelines'] })
                  if (activePipelineId) {
                    try {
                      const { fetchPipeline } = await import('./api/client')
                      const updated = await fetchPipeline(activePipelineId)
                      loadPipeline(updated)
                    } catch (_) {}
                  }
                }}
              />
            ) : rightPanel === 'config' && selectedStep ? (
              <TransformConfig
                step={selectedStep}
                columns={sourceSchema.map((c) => c.name)}
                onUpdate={(updates) => handleStepUpdate(selectedStep.id, updates)}
                onDelete={() => handleStepDelete(selectedStep.id)}
                onOpenEditor={selectedStep.transform_type === 'custom_sql' ? () => setCustomSqlEditorStepId(selectedStep.id) : undefined}
              />
            ) : (
              <div className="p-6 text-center text-gray-400 text-xs">
                Select a step to configure it
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ── Bottom Panel ────────────────────────────────────────────────────── */}
      {bottomPanel && (
        <div className="h-56 bg-white border-t border-surface-200 flex flex-col shrink-0">
          <div className="flex items-center gap-2 px-4 py-1.5 border-b border-surface-100 bg-surface-50 shrink-0">
            <div className="flex gap-0.5">
              {(['preview', 'execute', 'sql'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => tab === 'sql' ? handleSqlTabClick() : setBottomPanel(tab)}
                  className={clsx(
                    'px-3 py-1 text-xs font-medium rounded transition-colors capitalize',
                    bottomPanel === tab
                      ? 'bg-white border border-surface-200 text-navy-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  )}
                >
                  {tab === 'sql' ? 'SQL' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <button onClick={() => setBottomPanel(null)} className="text-gray-500 hover:text-gray-700 text-xs px-2">✕</button>
          </div>
          <div className="flex-1 overflow-auto">
            {bottomPanel === 'preview' && previewResult && <PreviewTable result={previewResult} />}
            {bottomPanel === 'execute' && executeResult && (
              <div className="p-4 text-sm">
                {executeResult.success ? (
                  <div className="flex items-center gap-2 text-emerald-700">
                    <IconCheckCircle size={15} />
                    <span className="font-medium">
                      {localOutputMode === 'view'
                        ? <>View created: <code className="font-mono">{executeResult.output_table}</code></>
                        : localOutputMode === 'incremental'
                          ? <>{(executeResult.rows_written ?? 0).toLocaleString()} rows after incremental run on <code className="font-mono">{executeResult.output_table}</code></>
                          : localOutputMode === 'scd2'
                            ? <>SCD2 update complete on <code className="font-mono">{executeResult.output_table}</code></>
                            : <>{(executeResult.rows_written ?? 0).toLocaleString()} rows {localOutputMode === 'insert' ? 'inserted into' : 'written to'} <code className="font-mono">{executeResult.output_table}</code></>
                      }
                      {executeResult.duration_ms != null && ` in ${(executeResult.duration_ms / 1000).toFixed(1)}s`}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 text-red-700">
                    <IconErrorCircle size={15} className="shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium">
                        {executeResult.blocked_by_tests
                          ? 'Blocked by test failures'
                          : executeResult.failed_step_index != null
                            ? `Failed at step ${executeResult.failed_step_index + 1} — ${executeResult.failed_step_name}`
                            : 'Execution failed'}
                      </p>
                      {executeResult.failed_step_index != null ? (
                        <>
                          <p className="text-xs mt-1 font-mono text-red-600">{executeResult.failed_step_error}</p>
                          <p className="text-xs mt-1 text-red-400">Pipeline error: {executeResult.error}</p>
                        </>
                      ) : (
                        <p className="text-xs mt-1 font-mono">{executeResult.error}</p>
                      )}
                    </div>
                  </div>
                )}
                {/* Iceberg metadata push status */}
                {executeResult.success && executeResult.metadata_push && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs">
                    {executeResult.metadata_push === 'skipped' || executeResult.metadata_push === 'timeout' ? (
                      <span className="text-white/60">Iceberg metadata: not stamped (table may not be Iceberg)</span>
                    ) : executeResult.metadata_push.startsWith('rest_catalog:') ? (
                      <>
                        <IconCheckCircle size={11} className="text-emerald-500" />
                        <span className="text-emerald-600">Iceberg metadata stamped via REST catalog ({executeResult.metadata_push.replace('rest_catalog:', '')})</span>
                      </>
                    ) : executeResult.metadata_push === 'sql' ? (
                      <>
                        <IconCheckCircle size={11} className="text-emerald-500" />
                        <span className="text-emerald-600">Iceberg metadata stamped</span>
                      </>
                    ) : (
                      <span className="text-amber-600">Iceberg metadata push failed</span>
                    )}
                  </div>
                )}

                {/* Test results summary */}
                {executeResult.test_results && executeResult.test_results.length > 0 && (
                  <div className="mt-3 border-t border-gray-200 pt-3">
                    <p className="text-xs font-semibold text-gray-600 mb-2">
                      Test Results —{' '}
                      <span className="text-green-600">{executeResult.tests_passed} passed</span>
                      {(executeResult.tests_failed ?? 0) > 0 && (
                        <span className="text-red-600"> · {executeResult.tests_failed} failed</span>
                      )}
                    </p>
                    <div className="flex flex-col gap-1">
                      {executeResult.test_results.map(r => (
                        <div key={r.test_id} className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${
                          r.status === 'passed' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                        }`}>
                          {r.status === 'passed' ? <IconCheckCircle size={11} /> : <IconErrorCircle size={11} />}
                          <span className="font-medium">{r.test_name}</span>
                          <span className="text-gray-500 flex-1">{r.message}</span>
                          {r.severity === 'warn' && r.status !== 'passed' && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-1 rounded">warn</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {bottomPanel === 'sql' && <SqlPreview sql={sqlText} />}
          </div>
        </div>
      )}

      {/* Alerts page — full-page overlay */}
      {showAlerts && <AlertsPage onClose={() => setShowAlerts(false)} />}
      {showDqHub && <DataQualityHub onClose={() => setShowDqHub(false)} />}
      {showIngestionHub && (
        <IngestionHub
          onClose={() => setShowIngestionHub(false)}
          loadTriggerUrl={localLoadTriggerUrl}
          loadTriggerJobId={localLoadTriggerJobId}
          cdcTriggerUrl={localCdcTriggerUrl}
          pipelineName={localName}
          onLoadTriggerChange={(url, jobId) => {
            setLocalLoadTriggerUrl(url)
            setLocalLoadTriggerJobId(jobId)
            setIsDirty(true)
          }}
          onCdcTriggerChange={(url) => {
            setLocalCdcTriggerUrl(url)
            setIsDirty(true)
          }}
        />
      )}
      {showAuditLog && <AuditLogPage onClose={() => setShowAuditLog(false)} />}
      {showAgentPanel && (
        <AgentPanel
          onClose={() => setShowAgentPanel(false)}
          onOpenSettings={() => { setSettingsInitialTab('agent'); setShowConnectionSettings(true) }}
          pipelineState={{
            source_table: localSourceTable,
            output_table: localOutputTable,
            steps: localSteps.map(s => ({ id: s.id, type: s.transform_type, label: s.label, config: s.config })),
          }}
          onPipelineStateChange={(state) => {
            if (state.source_table !== undefined) setLocalSourceTable(state.source_table)
            if (state.output_table !== undefined) setLocalOutputTable(state.output_table)
            if (state.steps) {
              setLocalSteps(state.steps.map((s, i) => ({
                id: s.id || `agent-step-${i}`,
                transform_type: s.type || '',
                label: s.label || s.type || '',
                config: s.config || {},
              })))
            }
          }}
        />
      )}

      {/* Share modal */}
      {shareModalPipelineId && (() => {
        const sharePipeline = pipelines.find(p => p.id === shareModalPipelineId)
        return sharePipeline && currentUser ? (
          <ShareModal
            pipeline={sharePipeline}
            currentUserId={currentUser.user_id}
            onClose={() => setShareModalPipelineId(null)}
          />
        ) : null
      })()}

      {/* My Dremio Credentials modal */}
      {showMyCredentials && (
        <MyCredentialsModal onClose={() => setShowMyCredentials(false)} />
      )}

      {/* Global Search palette */}
      {showSearch && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/50" onClick={() => setShowSearch(false)}>
          <div
            className="bg-white rounded-xl shadow-2xl w-[560px] mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100">
              <IconSearch size={16} className="text-gray-400 shrink-0" />
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search pipelines, steps, tables…"
                className="flex-1 text-sm text-gray-800 placeholder:text-gray-400 outline-none"
              />
              {searchLoading && <Loader2 size={14} className="text-gray-400 animate-spin shrink-0" />}
              <kbd className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono">Esc</kbd>
            </div>

            {/* Results */}
            <div className="max-h-80 overflow-y-auto">
              {searchQuery.length >= 2 && searchResults.length === 0 && !searchLoading && (
                <div className="text-center py-8 text-sm text-gray-400">No results for "{searchQuery}"</div>
              )}
              {searchQuery.length < 2 && (
                <div className="text-center py-8 text-xs text-gray-400">Type at least 2 characters to search</div>
              )}
              {searchResults.map((r, i) => {
                const fieldLabel: Record<string, string> = {
                  name: 'Pipeline name',
                  description: 'Description',
                  source_table: 'Source table',
                  output_table: 'Output table',
                  step_label: 'Step',
                  step_notes: 'Step note',
                  step_config: 'Step config',
                }
                return (
                  <button
                    key={i}
                    onClick={() => handleSearchSelect(r)}
                    className="w-full text-left flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm text-gray-800 truncate">{r.pipeline_name}</span>
                        <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                          {fieldLabel[r.match_field] ?? r.match_field}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{r.match_context}</p>
                    </div>
                  </button>
                )
              })}
            </div>

            {searchResults.length > 0 && (
              <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} — click to open pipeline
              </div>
            )}
          </div>
        </div>
      )}

      {/* Templates modal */}
      {showTemplates && (
        <TemplatesModal
          onClose={() => setShowTemplates(false)}
          onDeployed={(pipeline) => {
            qc.invalidateQueries({ queryKey: ['pipelines'] })
            loadPipeline(pipeline)
            setShowTemplates(false)
          }}
        />
      )}

      {/* dbt Import modal */}
      {showDbtImport && (
        <DbtImportModal
          onClose={() => setShowDbtImport(false)}
          onImported={() => { qc.invalidateQueries({ queryKey: ['pipelines'] }) }}
        />
      )}

      {/* Duplicate pipeline name warning */}
      {showDupeNameWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-start gap-3 mb-4">
              <IconErrorCircle size={20} className="text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-surface-800 text-sm">Duplicate Pipeline Name</h3>
                <p className="text-white/40 text-xs mt-1">
                  A pipeline named <span className="font-mono font-semibold text-surface-700">"{localName}"</span> already
                  exists. Duplicate names can make pipelines hard to find and manage.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDupeNameWarning(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white/30 hover:bg-surface-100 transition-colors"
              >
                Cancel — rename it
              </button>
              <button
                onClick={() => { setShowDupeNameWarning(false); doSave() }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500 hover:bg-amber-400 text-white transition-colors"
              >
                Save Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Health Dashboard — full-page overlay */}
      {showDashboard && (
        <div className="fixed inset-0 z-50 bg-navy-900 flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-navy-700 bg-navy-800 shrink-0">
            <span className="text-xs text-white/60">Click a pipeline card to open it in the editor</span>
            <button
              onClick={() => setShowDashboard(false)}
              className="p-1.5 rounded hover:bg-sidebar-accent text-white/70 hover:text-white transition-colors"
            >
              <IconClose size={15} />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <DashboardView
              onOpenPipeline={(id) => {
                const p = pipelines.find(p => p.id === id)
                if (p) { loadPipeline(p); setShowDashboard(false) }
              }}
            />
          </div>
        </div>
      )}

      {/* Pipeline DAG view */}
      {showDagView && (
        <PipelineDagView
          onClose={() => setShowDagView(false)}
          onSelectPipeline={(id) => {
            const p = pipelines.find(p => p.id === id)
            if (p) loadPipeline(p)
          }}
        />
      )}

      {/* Custom SQL Editor — full-page overlay */}
      {customSqlEditorStepId && (() => {
        const step = localSteps.find((s) => s.id === customSqlEditorStepId)
        if (!step) return null
        return (
          <CustomSqlEditor
            step={step}
            columns={sourceSchema.map((c) => c.name)}
            onSave={(sql, label) => {
              handleStepUpdate(customSqlEditorStepId, {
                config: { ...step.config, sql },
                ...(label !== undefined ? { label } : {}),
              })
              setCustomSqlEditorStepId(null)
            }}
            onClose={() => setCustomSqlEditorStepId(null)}
          />
        )
      })()}

      {showAddCatalog && <AddCatalogModal onClose={() => { setShowAddCatalog(false); setSidebarTab('iceberg') }} />}
      {showConnectionSettings && <ConnectionSettingsModal onClose={() => { setShowConnectionSettings(false); setSettingsInitialTab('connection') }} onSaved={() => { qc.removeQueries({ queryKey: ['namespaces'] }); qc.removeQueries({ queryKey: ['tables'] }); setCatalogKey(k => k + 1) }} initialTab={settingsInitialTab} />}
      {showSchedule && activePipelineId && (
        <ScheduleModal
          pipelineId={activePipelineId}
          pipelineName={localName}
          onClose={() => setShowSchedule(false)}
        />
      )}

      {/* Run with params modal */}
      {showParamModal && activePipelineId && (
        <RunWithParamsModal
          parameters={localParameters}
          mode={showParamModal}
          onRun={handleRunWithParams}
          onCancel={() => setShowParamModal(null)}
        />
      )}

      {/* User management modal */}
      {showManageUsers && (
        <UserManagementModal onClose={() => setShowManageUsers(false)} />
      )}

      {/* Rename modal */}
      {renamingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-80 mx-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-navy-950 flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Rename Pipeline</span>
              <button onClick={() => setRenamingId(null)} className="text-gray-400 hover:text-white"><IconClose size={15} /></button>
            </div>
            <div className="p-5 space-y-4">
              <input
                autoFocus
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-dblue-500"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') renameMut.mutate({ id: renamingId, name: renameValue }); if (e.key === 'Escape') setRenamingId(null) }}
                placeholder="Pipeline name"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setRenamingId(null)}>Cancel</Button>
                <Button
                  size="sm"
                  onClick={() => renameMut.mutate({ id: renamingId, name: renameValue })}
                  disabled={!renameValue.trim() || renameMut.isPending}
                >
                  {renameMut.isPending ? 'Saving…' : 'Rename'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-80 mx-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-navy-950 flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Delete Pipeline</span>
              <button onClick={() => setDeleteConfirmId(null)} className="text-gray-400 hover:text-white"><IconClose size={15} /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600">
                Are you sure you want to delete <span className="font-semibold text-gray-900">"{pipelines.find(p => p.id === deleteConfirmId)?.name ?? 'this pipeline'}"</span>? This will remove all version history and cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deletePipelineMut.mutate(deleteConfirmId)}
                  disabled={deletePipelineMut.isPending}
                >
                  {deletePipelineMut.isPending ? 'Deleting…' : 'Delete'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Quit Confirmation Modal ────────────────────────────────────────── */}
      {showQuitConfirm && !quitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-80">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
              <Power size={16} className="text-red-500" />
              <h2 className="text-sm font-semibold text-gray-800">Quit Transform Studio?</h2>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600">
                This will stop the app server. You can relaunch it anytime from your Applications folder.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowQuitConfirm(false)}>Cancel</Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    setQuitting(true)
                    setShowQuitConfirm(false)
                    try { await quitApp() } catch (_) { /* server closed before responding */ }
                  }}
                >
                  Quit
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DAG Run Modal */}
      {showDagRunModal && activePipelineId && (
        <DagRunModal
          pipelineId={activePipelineId}
          pipelineName={localName}
          dependencies={localDeps}
          dependencyNames={localDeps.map(id => pipelines.find(p => p.id === id)?.name ?? id)}
          outputTable={localOutputTable}
          outputMode={localOutputMode}
          onClose={() => setShowDagRunModal(false)}
        />
      )}

      {/* Seed Table Modal */}
      {showSeedModal && <SeedModal onClose={() => setShowSeedModal(false)} />}

      {/* ── Shutdown Screen ────────────────────────────────────────────────── */}
      {quitting && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-navy-900">
          <Power size={40} className="text-navy-600 mb-6" />
          <p className="text-white text-lg font-semibold mb-2">Transform Studio has stopped</p>
          <p className="text-white/60 text-sm">You can close this tab.</p>
        </div>
      )}
    </div>
  )
}

// ── User Management Modal ─────────────────────────────────────────────────────

function UserManagementModal({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<{ id: string; username: string; is_admin: boolean; role: string; created_at: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', password: '', is_admin: false, role: 'editor' })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchUsers().then(setUsers).catch(() => setError('Failed to load users')).finally(() => setLoading(false))
  }, [])

  const handleCreate = async () => {
    if (!newUser.username.trim() || !newUser.password) return
    try {
      const role = newUser.is_admin ? 'admin' : newUser.role
      const created = await createUser({ username: newUser.username.trim(), password: newUser.password, is_admin: newUser.is_admin, role })
      setUsers((u) => [...u, { ...created, created_at: new Date().toISOString() }])
      setNewUser({ username: '', password: '', is_admin: false, role: 'editor' })
      setAdding(false)
    } catch {
      setError('Failed to create user')
    }
  }

  const handleRoleChange = async (id: string, role: string) => {
    try {
      const updated = await updateUserRole(id, role)
      setUsers((u) => u.map((x) => x.id === id ? { ...x, role: updated.role, is_admin: role === 'admin' } : x))
    } catch {
      setError('Failed to update role')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteUser(id)
      setUsers((u) => u.filter((x) => x.id !== id))
    } catch {
      setError('Failed to delete user')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-[480px] mx-4 overflow-hidden max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 bg-navy-950 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-primary" />
            <span className="text-sm font-semibold text-white">Manage Users</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><IconClose size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && <p className="text-xs text-red-600">{error}</p>}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={18} className="animate-spin text-white/60" />
            </div>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 bg-surface-50 border border-surface-200 rounded-lg group">
                  <div className="w-7 h-7 rounded-full bg-dblue-100 flex items-center justify-center shrink-0">
                    <User size={13} className="text-dblue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-800 truncate">{u.username}</p>
                  </div>
                  <select
                    value={u.role || (u.is_admin ? 'admin' : 'editor')}
                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    className="text-xs border border-surface-200 rounded px-2 py-1 bg-white text-white/30 focus:outline-none focus:ring-1 focus:ring-dblue-400"
                  >
                    <option value="admin">Admin</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    onClick={() => handleDelete(u.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-white/60 hover:text-red-500 hover:bg-red-50 transition-all"
                    title="Delete user"
                  >
                    <IconDelete size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {adding ? (
            <div className="bg-dblue-50 border border-dblue-200 rounded-lg p-4 space-y-3">
              <p className="text-xs font-semibold text-dblue-700">New User</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-white/30 mb-1">Username</label>
                  <input
                    autoFocus
                    type="text"
                    value={newUser.username}
                    onChange={(e) => setNewUser((u) => ({ ...u, username: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-xs border border-surface-300 rounded focus:outline-none focus:ring-1 focus:ring-dblue-400"
                    placeholder="username"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/30 mb-1">Password</label>
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser((u) => ({ ...u, password: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-xs border border-surface-300 rounded focus:outline-none focus:ring-1 focus:ring-dblue-400"
                    placeholder="••••••••"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-white/30 mb-1">Role</label>
                <select
                  value={newUser.is_admin ? 'admin' : newUser.role}
                  onChange={(e) => {
                    const role = e.target.value
                    setNewUser((u) => ({ ...u, role, is_admin: role === 'admin' }))
                  }}
                  className="w-full px-2.5 py-1.5 text-xs border border-surface-300 rounded focus:outline-none focus:ring-1 focus:ring-dblue-400"
                >
                  <option value="admin">Admin — can manage users &amp; see all pipelines</option>
                  <option value="editor">Editor — owns their pipelines, can be shared with</option>
                  <option value="viewer">Viewer — read-only, must submit for approval</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setAdding(false)} className="px-3 py-1.5 text-xs text-white/40 hover:text-surface-700">Cancel</button>
                <button
                  onClick={handleCreate}
                  disabled={!newUser.username.trim() || !newUser.password}
                  className="px-4 py-1.5 text-xs font-semibold bg-dblue-500 text-white rounded hover:bg-dblue-600 disabled:opacity-50"
                >
                  Create User
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 w-full px-3 py-2 text-xs text-dblue-600 hover:bg-dblue-50 rounded-lg border border-dashed border-dblue-300 transition-colors"
            >
              <IconAdd size={12} /> Add User
            </button>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 shrink-0 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold bg-navy-800 text-white rounded hover:bg-navy-700">Done</button>
        </div>
      </div>
    </div>
  )
}

// ── Small UI helpers ──────────────────────────────────────────────────────────

function TopBtn({ onClick, disabled, icon, label, accent, title }: {
  onClick: () => void
  disabled?: boolean
  icon: React.ReactNode
  label: string
  accent?: 'emerald' | 'blue' | 'dark' | 'violet'
  title?: string
}) {
  const base = 'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors disabled:opacity-40'
  const styles = {
    emerald: 'text-white bg-emerald-600 hover:bg-emerald-500',
    blue: 'text-white bg-primary hover:bg-sidebar-primary',
    dark: 'text-white bg-navy-700 hover:bg-white/15',
    violet: 'text-white bg-violet-600 hover:bg-violet-500',
    undefined: 'text-white/70 hover:text-white hover:bg-sidebar-accent',
  }
  return (
    <button onClick={onClick} disabled={disabled} title={title} className={clsx(base, styles[accent as keyof typeof styles] ?? styles['undefined'])}>
      {icon} {label}
    </button>
  )
}

function CatalogTabBtn({ active, onClick, icon, label, badge }: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  badge?: number
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors',
        active ? 'text-primary border-b-2 border-dblue-500 bg-navy-800/50' : 'text-white/60 hover:text-white'
      )}
    >
      {icon}
      {label}
      {badge !== undefined && (
        <span className="bg-dblue-500/20 text-primary text-xs px-1.5 py-0.5 rounded-full font-mono leading-none">{badge}</span>
      )}
    </button>
  )
}

function PanelTabBtn({ active, onClick, label, disabled, icon }: {
  active: boolean
  onClick: () => void
  label: string
  disabled?: boolean
  icon?: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors disabled:opacity-40 flex items-center justify-center gap-1',
        active ? 'text-dblue-600 border-b-2 border-dblue-500 bg-dblue-50' : 'text-gray-500 hover:text-gray-700'
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function IconTabBtn({ active, onClick, tooltip, icon, disabled }: {
  active: boolean
  onClick: () => void
  tooltip: string
  icon: React.ReactNode
  disabled?: boolean
}) {
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        disabled={disabled}
        className={clsx(
          'flex items-center justify-center w-8 h-8 rounded-lg transition-colors disabled:opacity-30',
          active
            ? 'bg-dblue-50 text-dblue-600'
            : 'text-gray-500 hover:bg-surface-100 hover:text-gray-700'
        )}
      >
        {icon}
      </button>
      {/* Tooltip */}
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 rounded bg-navy-900 text-white text-[10px] font-semibold tracking-wide whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50">
        {tooltip}
      </div>
    </div>
  )
}

function ViewToggleBtn({ active, onClick, label }: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-2.5 py-0.5 text-xs font-medium rounded-full transition-colors',
        active
          ? 'bg-white text-navy-900 shadow-sm'
          : 'text-white/40 hover:text-surface-700'
      )}
    >
      {label}
    </button>
  )
}

// ── Runs Panel ────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function RunsPanel({ pipelineId }: { pipelineId: string }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: runs = [], isFetching } = useQuery({
    queryKey: ['runs', pipelineId],
    queryFn: () => fetchPipelineRuns(pipelineId),
    refetchInterval: 10000,
  })

  if (isFetching && runs.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 gap-2 text-white/60">
        <Loader2 size={14} className="animate-spin" />
        <span className="text-xs">Loading runs…</span>
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <div className="p-6 text-center text-white/60">
        <Clock size={24} className="mx-auto mb-3 text-white/70" />
        <p className="text-xs font-medium text-white/40 mb-1">No runs yet</p>
        <p className="text-xs">Hit Execute to run this pipeline</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-surface-100">
      {runs.map((run: PipelineRun) => {
        const isExpanded = expandedId === run.id
        return (
          <div key={run.id} className="px-4 py-3">
            <div className="flex items-start gap-2">
              {/* Status icon */}
              {run.status === 'success' ? (
                <IconCheckCircle size={14} className="text-emerald-500 shrink-0 mt-0.5" />
              ) : (
                <IconErrorCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={run.status === 'success' ? 'success' : 'destructive'}>
                    {run.status === 'success' ? 'Success' : 'Failed'}
                  </Badge>
                  <span className={clsx(
                    'text-xs px-1.5 py-0.5 rounded-full font-medium',
                    run.run_type === 'manual'
                      ? 'bg-surface-100 text-white/30'
                      : 'bg-amber-100 text-amber-700'
                  )}>
                    {run.run_type}
                  </span>
                  <span className="text-xs text-white/60 ml-auto">{relativeTime(run.started_at)}</span>
                </div>
                {run.row_count != null && (
                  <p className="text-xs text-white/40 mt-0.5">{run.row_count.toLocaleString()} rows</p>
                )}
                {run.status === 'failed' && run.error_message && (
                  <div className="mt-1">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : run.id)}
                      className="text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      {isExpanded ? 'Hide error ▲' : 'Show error ▼'}
                    </button>
                    {isExpanded && (
                      <p className="mt-1 text-xs font-mono text-red-600 bg-red-50 rounded p-2 break-all whitespace-pre-wrap max-h-24 overflow-y-auto">
                        {run.error_message}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function IcebergCatalogSection({ catalog, activeTable, onSelectTable, onDelete }: {
  catalog: IcebergCatalog
  activeTable: string
  onSelectTable: (t: string) => void
  onDelete: () => void
}) {
  const [testing, setTesting] = useState(false)
  const [testOk, setTestOk] = useState<boolean | null>(null)

  const handleTest = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setTesting(true)
    try {
      const r = await testIcebergCatalog(catalog.id)
      setTestOk(r.ok)
    } catch {
      setTestOk(false)
    }
    setTesting(false)
    setTimeout(() => setTestOk(null), 3000)
  }

  return (
    <div className="border-b border-navy-800">
      {/* Catalog header */}
      <div className="flex items-center gap-2 px-3 py-2 group">
        <Layers size={12} className="text-primary shrink-0" />
        <span className="text-xs font-medium text-white truncate flex-1">{catalog.name}</span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={handleTest} title="Test connection" className="p-1 rounded hover:bg-navy-700 text-white/40 hover:text-primary transition-colors">
            {testing ? <Loader2 size={11} className="animate-spin" /> : <IconRefresh size={11} />}
          </button>
          <button onClick={onDelete} title="Remove" className="p-1 rounded hover:bg-navy-700 text-white/40 hover:text-red-400 transition-colors">
            <IconDelete size={11} />
          </button>
        </div>
        {testOk === true && <IconCheckCircle size={11} className="text-emerald-400 shrink-0" />}
        {testOk === false && <IconErrorCircle size={11} className="text-red-400 shrink-0" />}
      </div>
      {/* Namespace browser */}
      <IcebergCatalogBrowser
        catalog={catalog}
        activeTable={activeTable}
        onSelectTable={onSelectTable}
      />
    </div>
  )
}
